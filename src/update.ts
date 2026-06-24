import fs from 'node:fs';
import path from 'node:path';
import readline from 'node:readline';
import { spawn } from 'node:child_process';
import { configDir } from './config.js';
import { PACKAGE_NAME, VERSION } from './version.js';

export interface UpdateState {
  lastCheckAt?: number;
  skipUntil?: number;
  dismissedVersion?: string;
}

export interface UpdateInfo {
  current: string;
  latest: string;
}

const CHECK_INTERVAL_MS = 24 * 60 * 60 * 1000;
const REMIND_LATER_MS = 24 * 60 * 60 * 1000;

export function compareVersions(a: string, b: string): number {
  const pa = a.replace(/^v/, '').split(/[.-]/).map((n) => Number.parseInt(n, 10) || 0);
  const pb = b.replace(/^v/, '').split(/[.-]/).map((n) => Number.parseInt(n, 10) || 0);
  const len = Math.max(pa.length, pb.length);
  for (let i = 0; i < len; i++) {
    const left = pa[i] ?? 0;
    const right = pb[i] ?? 0;
    if (left !== right) return left > right ? 1 : -1;
  }
  return 0;
}

function updateStateFile(): string {
  return path.join(configDir(), 'update.json');
}

export function readUpdateState(): UpdateState {
  try {
    const file = updateStateFile();
    return fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')) as UpdateState : {};
  } catch {
    return {};
  }
}

export function writeUpdateState(state: UpdateState): void {
  try {
    fs.mkdirSync(configDir(), { recursive: true });
    fs.writeFileSync(updateStateFile(), JSON.stringify(state, null, 2));
  } catch {
    /* best effort */
  }
}

export function shouldSkipUpdateCheck(env: NodeJS.ProcessEnv = process.env): boolean {
  return (
    env.PARALLEL_SKIP_UPDATE_CHECK === '1' ||
    env.CI === 'true' ||
    env.GITHUB_ACTIONS === 'true' ||
    env.GITLAB_CI === 'true' ||
    env.BUILDKITE === 'true'
  );
}

export function shouldPromptForUpdate(info: UpdateInfo, state: UpdateState, now = Date.now()): boolean {
  if (compareVersions(info.latest, info.current) <= 0) return false;
  if (state.dismissedVersion === info.latest) return false;
  if (state.skipUntil && state.skipUntil > now) return false;
  return true;
}

export async function fetchLatestVersion(timeoutMs = 1500): Promise<string | null> {
  let timeout: ReturnType<typeof setTimeout> | undefined;
  try {
    const controller = new AbortController();
    timeout = setTimeout(() => controller.abort(), timeoutMs);
    const resp = await fetch(`https://registry.npmjs.org/${encodeURIComponent(PACKAGE_NAME)}/latest`, {
      signal: controller.signal,
    });
    if (!resp.ok) return null;
    const data = await resp.json() as { version?: string };
    return typeof data.version === 'string' ? data.version : null;
  } catch {
    return null;
  } finally {
    if (timeout) clearTimeout(timeout);
  }
}

function ask(question: string): Promise<string> {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      rl.close();
      resolve(answer.trim());
    });
  });
}

export async function runGlobalUpdate(): Promise<number> {
  return new Promise((resolve) => {
    const child = spawn('npm', ['install', '-g', PACKAGE_NAME], { stdio: 'inherit' });
    child.on('close', (code) => resolve(code ?? 1));
    child.on('error', () => resolve(1));
  });
}

export async function maybeRunStartupUpdate(skip = false): Promise<boolean> {
  if (skip || shouldSkipUpdateCheck() || !process.stdin.isTTY || !process.stdout.isTTY) return false;
  const now = Date.now();
  const state = readUpdateState();
  if (state.lastCheckAt && now - state.lastCheckAt < CHECK_INTERVAL_MS && (!state.skipUntil || state.skipUntil > now)) {
    return false;
  }
  const latest = await fetchLatestVersion();
  writeUpdateState({ ...state, lastCheckAt: now });
  if (!latest) return false;
  const info = { current: VERSION, latest };
  if (!shouldPromptForUpdate(info, state, now)) return false;

  const answer = await ask(`Update Parallel ${VERSION} -> ${latest}? [y/N] `);
  if (!/^y(es)?$/i.test(answer)) {
    writeUpdateState({ ...state, lastCheckAt: now, skipUntil: now + REMIND_LATER_MS });
    return false;
  }

  console.log(`Updating Parallel via \`npm install -g ${PACKAGE_NAME}\`...\n`);
  const code = await runGlobalUpdate();
  if (code === 0) {
    writeUpdateState({ lastCheckAt: now, dismissedVersion: latest });
    console.log('\nUpdate ran successfully! Please restart Parallel.');
  } else {
    console.log('\nUpdate failed. Parallel will continue with the current version.');
  }
  return code === 0;
}
