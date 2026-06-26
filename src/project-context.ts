import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';
import type { ChatCompletionMessageParam } from 'openai/resources/chat/completions';
import type {
  ProjectContextData,
  ProjectContextFile,
  ProjectContextStatus,
  ProjectContextWork,
} from './types.js';
import { redactPersistedText, sanitizeForPersistence, writeFileAtomicPrivate } from './security.js';

const SCHEMA_VERSION = 1 as const;
const MAX_CONTEXT_CHARS = 12_000;
const MAX_SEED_CHARS = 28_000;
const IGNORED = new Set([
  '.git',
  '.parallel',
  '.cursor',
  'node_modules',
  'dist',
  'build',
  'coverage',
  '.next',
  '__pycache__',
  '.venv',
  'venv',
]);
const SEED_FILES = [
  'AGENTS.md',
  'README.md',
  'CHANGELOG.md',
  'package.json',
  'pyproject.toml',
  'Cargo.toml',
  'go.mod',
  'Makefile',
  'tsconfig.json',
];

function ignoredName(name: string): boolean {
  const lower = name.toLowerCase();
  return (
    IGNORED.has(name) ||
    lower === '.env' ||
    lower.startsWith('.env.') ||
    /(^|[._-])(secret|secrets|credential|credentials|private-key|id_rsa)([._-]|$)/.test(lower)
  );
}

export interface ProjectContextGenerationResult {
  content: string;
  tokensIn: number;
  tokensOut: number;
  model: string;
  cost: number | null;
}

export type ProjectContextGenerator = (
  messages: ChatCompletionMessageParam[],
) => Promise<ProjectContextGenerationResult>;

export interface ProjectContextStatusSnapshot {
  status: ProjectContextStatus;
  generatedAt?: string;
  fingerprint: string;
  model?: string;
  tokensIn: number;
  tokensOut: number;
  cost: number | null;
  error?: string;
}

function hashText(content: string): string {
  return crypto.createHash('sha256').update(content).digest('hex').slice(0, 16);
}

function safeJsonObject(text: string): Record<string, unknown> | null {
  const trimmed = text.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
  try {
    const parsed = JSON.parse(trimmed);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

function stringArray(value: unknown, max: number): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => String(item ?? '').replace(/\s+/g, ' ').trim())
    .filter(Boolean)
    .slice(0, max);
}

function safeRelativePath(value: unknown): string | null {
  const rel = String(value ?? '').replace(/\\/g, '/').replace(/^\.\/+/, '');
  if (!rel || path.isAbsolute(rel) || rel === '..' || rel.startsWith('../')) return null;
  return rel;
}

function contextFiles(value: unknown): ProjectContextFile[] {
  if (!Array.isArray(value)) return [];
  const files: ProjectContextFile[] = [];
  for (const item of value.slice(-200)) {
    if (!item || typeof item !== 'object') continue;
    const raw = item as Record<string, unknown>;
    const filePath = safeRelativePath(raw.path);
    const hash = String(raw.hash ?? '');
    if (!filePath || !/^[a-f0-9]{16}$/.test(hash)) continue;
    files.push({ path: filePath, hash, inspectedAt: String(raw.inspectedAt ?? '') });
  }
  return files;
}

function contextWork(value: unknown): ProjectContextWork[] {
  if (!Array.isArray(value)) return [];
  const work: ProjectContextWork[] = [];
  for (const item of value.slice(-20)) {
    if (!item || typeof item !== 'object') continue;
    const raw = item as Record<string, unknown>;
    const task = String(raw.task ?? '').trim();
    const result = String(raw.result ?? '').trim();
    if (!task || !result) continue;
    work.push({
      agentName: String(raw.agentName ?? 'agent').slice(0, 80),
      task: task.slice(0, 2_000),
      result: result.slice(0, 5_000),
      inspectedFiles: stringArray(raw.inspectedFiles, 100).flatMap((file) => {
        const safe = safeRelativePath(file);
        return safe ? [safe] : [];
      }),
      changedFiles: stringArray(raw.changedFiles, 100).flatMap((file) => {
        const safe = safeRelativePath(file);
        return safe ? [safe] : [];
      }),
      completedAt: String(raw.completedAt ?? ''),
    });
  }
  return work;
}

export class ProjectContextStore {
  private data: ProjectContextData | null = null;
  private status: ProjectContextStatus = 'idle';
  private generation: Promise<ProjectContextData> | null = null;
  private refreshTimer: NodeJS.Timeout | null = null;
  private inspectedByAgent = new Map<string, Map<string, ProjectContextFile>>();
  private error: string | undefined;

  constructor(
    readonly projectRoot: string,
    private onStatus?: (status: ProjectContextStatus, detail?: string) => void,
  ) {
    this.data = this.load();
    if (this.data) this.status = this.data.fingerprint === this.fingerprint() ? 'ready' : 'idle';
  }

  private file(): string {
    return path.join(this.projectRoot, '.parallel', 'project-context.json');
  }

  private load(): ProjectContextData | null {
    try {
      const raw = JSON.parse(fs.readFileSync(this.file(), 'utf8')) as Partial<ProjectContextData>;
      if (raw.schemaVersion !== SCHEMA_VERSION || raw.projectRoot !== this.projectRoot) return null;
      if (typeof raw.architecture !== 'string' || typeof raw.fingerprint !== 'string') return null;
      return {
        schemaVersion: SCHEMA_VERSION,
        generatedAt: String(raw.generatedAt ?? ''),
        projectRoot: this.projectRoot,
        gitHead: String(raw.gitHead ?? ''),
        fingerprint: raw.fingerprint,
        model: raw.model,
        architecture: raw.architecture,
        entryPoints: stringArray(raw.entryPoints, 20),
        conventions: stringArray(raw.conventions, 20),
        pitfalls: stringArray(raw.pitfalls, 20),
        files: contextFiles(raw.files),
        recentWork: contextWork(raw.recentWork),
        deterministicSeed: String(raw.deterministicSeed ?? ''),
        tokensIn: Number(raw.tokensIn ?? 0),
        tokensOut: Number(raw.tokensOut ?? 0),
        cost: raw.cost === null ? null : Number(raw.cost ?? 0),
      };
    } catch {
      return null;
    }
  }

  private persist(): void {
    if (!this.data) return;
    writeFileAtomicPrivate(this.file(), sanitizeForPersistence(JSON.stringify(this.data, null, 2)));
  }

  gitHead(): string {
    try {
      return String(execFileSync('git', ['rev-parse', 'HEAD'], { cwd: this.projectRoot, stdio: 'pipe' })).trim();
    } catch {
      return '';
    }
  }

  fingerprint(): string {
    let worktree = '';
    try {
      worktree = String(
        execFileSync('git', ['diff', '--no-ext-diff', '--binary', '--', '.'], {
          cwd: this.projectRoot,
          stdio: 'pipe',
          maxBuffer: 4 * 1024 * 1024,
        }),
      );
    } catch {}
    const untrackedBits: string[] = [];
    try {
      const files = String(
        execFileSync('git', ['ls-files', '--others', '--exclude-standard'], {
          cwd: this.projectRoot,
          stdio: 'pipe',
        }),
      )
        .split('\n')
        .filter(Boolean)
        .filter((rel) => !rel.split('/').some(ignoredName))
        .slice(0, 100);
      for (const rel of files) {
        try {
          const content = fs.readFileSync(path.join(this.projectRoot, rel));
          untrackedBits.push(`${rel}:${hashText(content.subarray(0, 200_000).toString('binary'))}`);
        } catch {}
      }
    } catch {}
    const manifestBits: string[] = [];
    for (const rel of SEED_FILES) {
      try {
        const content = fs.readFileSync(path.join(this.projectRoot, rel), 'utf8');
        manifestBits.push(`${rel}:${hashText(content)}`);
      } catch {}
    }
    return hashText([this.gitHead(), worktree, ...untrackedBits, ...manifestBits].join('\n'));
  }

  private projectTree(): string[] {
    const out: string[] = [];
    const walk = (dir: string, depth: number) => {
      if (depth > 5 || out.length >= 400) return;
      let entries: fs.Dirent[];
      try {
        entries = fs.readdirSync(dir, { withFileTypes: true });
      } catch {
        return;
      }
      for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
        if (ignoredName(entry.name) || entry.name.startsWith('.git')) continue;
        const full = path.join(dir, entry.name);
        const rel = path.relative(this.projectRoot, full);
        if (entry.isDirectory()) {
          out.push(`${rel}/`);
          walk(full, depth + 1);
        } else if (entry.isFile()) {
          out.push(rel);
        }
        if (out.length >= 400) break;
      }
    };
    walk(this.projectRoot, 0);
    return out;
  }

  deterministicSeed(): string {
    const sections: string[] = [
      `PROJECT ROOT\n${this.projectRoot}`,
      `GIT HEAD\n${this.gitHead() || '(not a git repository)'}`,
      `PROJECT TREE\n${this.projectTree().join('\n')}`,
    ];
    for (const rel of SEED_FILES) {
      try {
        const content = fs.readFileSync(path.join(this.projectRoot, rel), 'utf8').slice(0, 8_000);
        sections.push(`${rel}\n${redactPersistedText(content)}`);
      } catch {}
    }
    try {
      const memory = fs.readFileSync(path.join(this.projectRoot, '.parallel', 'memory.md'), 'utf8').slice(-8_000);
      sections.push(`DURABLE USER/AGENT FACTS\n${redactPersistedText(memory)}`);
    } catch {}
    if (this.data?.recentWork.length) {
      sections.push(
        `RECENT WORK\n${redactPersistedText(this.data.recentWork
          .slice(-10)
          .map((work) => `${work.agentName}: ${work.task}\n${work.result}\nfiles: ${[...work.inspectedFiles, ...work.changedFiles].join(', ')}`)
          .join('\n\n'))}`,
      );
    }
    return sections.join('\n\n---\n\n').slice(0, MAX_SEED_CHARS);
  }

  statusSnapshot(): ProjectContextStatusSnapshot {
    return {
      status: this.status,
      generatedAt: this.data?.generatedAt,
      fingerprint: this.data?.fingerprint ?? this.fingerprint(),
      model: this.data?.model,
      tokensIn: this.data?.tokensIn ?? 0,
      tokensOut: this.data?.tokensOut ?? 0,
      cost: this.data?.cost ?? null,
      error: this.error,
    };
  }

  recordInspection(agentId: string, relPath: string, content: string): void {
    const normalized = relPath.replace(/\\/g, '/');
    let files = this.inspectedByAgent.get(agentId);
    if (!files) {
      files = new Map();
      this.inspectedByAgent.set(agentId, files);
    }
    files.set(normalized, {
      path: normalized,
      hash: hashText(content),
      inspectedAt: new Date().toISOString(),
    });
  }

  inspectedFiles(agentId: string): string[] {
    return [...(this.inspectedByAgent.get(agentId)?.keys() ?? [])].sort();
  }

  recordOutcome(agentId: string, work: Omit<ProjectContextWork, 'inspectedFiles' | 'completedAt'>): void {
    const inspected = [...(this.inspectedByAgent.get(agentId)?.values() ?? [])];
    const base = this.data ?? this.fallbackData();
    const byPath = new Map(base.files.map((file) => [file.path, file]));
    for (const file of inspected) byPath.set(file.path, file);
    base.files = [...byPath.values()].slice(-200);
    base.recentWork = [
      ...base.recentWork,
      {
        ...work,
        inspectedFiles: inspected.map((file) => file.path),
        completedAt: new Date().toISOString(),
      },
    ].slice(-20);
    base.fingerprint = this.fingerprint();
    base.gitHead = this.gitHead();
    base.generatedAt = new Date().toISOString();
    base.deterministicSeed = this.deterministicSeed();
    this.data = base;
    this.persist();
  }

  private fallbackData(): ProjectContextData {
    const seed = this.deterministicSeed();
    return {
      schemaVersion: SCHEMA_VERSION,
      generatedAt: new Date().toISOString(),
      projectRoot: this.projectRoot,
      gitHead: this.gitHead(),
      fingerprint: this.fingerprint(),
      architecture: 'No validated architecture summary is available yet. Use the project tree and targeted file reads.',
      entryPoints: [],
      conventions: [],
      pitfalls: [],
      files: this.data?.files ?? [],
      recentWork: this.data?.recentWork ?? [],
      deterministicSeed: seed,
      tokensIn: 0,
      tokensOut: 0,
      cost: null,
    };
  }

  async refresh(generator?: ProjectContextGenerator, force = false): Promise<ProjectContextData> {
    const currentFingerprint = this.fingerprint();
    if (!force && this.data?.fingerprint === currentFingerprint && this.status === 'ready') return this.data;
    if (this.generation) return this.generation;
    this.status = 'indexing';
    this.error = undefined;
    this.onStatus?.('indexing');
    this.generation = (async () => {
      const seed = this.deterministicSeed();
      if (!generator) {
        this.data = this.fallbackData();
        this.status = 'fallback';
        this.onStatus?.('fallback');
        this.persist();
        return this.data;
      }
      try {
        const response = await generator([
          {
            role: 'system',
            content:
              'Build a compact, factual software-project map. Return ONLY JSON with keys architecture (string), entryPoints (string[]), conventions (string[]), pitfalls (string[]). Do not include secrets, credentials, prose outside JSON, or guesses not grounded in the supplied repository seed.',
          },
          { role: 'user', content: seed },
        ]);
        const parsed = safeJsonObject(response.content);
        if (!parsed || typeof parsed.architecture !== 'string') throw new Error('invalid project-context JSON');
        this.data = {
          schemaVersion: SCHEMA_VERSION,
          generatedAt: new Date().toISOString(),
          projectRoot: this.projectRoot,
          gitHead: this.gitHead(),
          fingerprint: this.fingerprint(),
          model: response.model,
          architecture: parsed.architecture.slice(0, 5_000),
          entryPoints: stringArray(parsed.entryPoints, 20),
          conventions: stringArray(parsed.conventions, 20),
          pitfalls: stringArray(parsed.pitfalls, 20),
          files: this.data?.files ?? [],
          recentWork: this.data?.recentWork ?? [],
          deterministicSeed: seed,
          tokensIn: response.tokensIn,
          tokensOut: response.tokensOut,
          cost: response.cost,
        };
        this.status = 'ready';
        this.onStatus?.('ready');
        this.persist();
        return this.data;
      } catch (error: any) {
        this.error = String(error?.message ?? error).slice(0, 200);
        this.data = this.fallbackData();
        this.status = 'fallback';
        this.onStatus?.('fallback', this.error);
        this.persist();
        return this.data;
      } finally {
        this.generation = null;
      }
    })();
    return this.generation;
  }

  scheduleRefresh(generator?: ProjectContextGenerator): void {
    if (this.refreshTimer) clearTimeout(this.refreshTimer);
    this.refreshTimer = setTimeout(() => {
      this.refreshTimer = null;
      void this.refresh(generator, true);
    }, 750);
    this.refreshTimer.unref?.();
  }

  async bootstrap(generator?: ProjectContextGenerator, timeoutMs = 20_000): Promise<string> {
    const refresh = this.refresh(generator);
    let timer: NodeJS.Timeout | undefined;
    try {
      const data = await Promise.race([
        refresh,
        new Promise<ProjectContextData>((resolve) => {
          timer = setTimeout(() => resolve(this.data ?? this.fallbackData()), timeoutMs);
        }),
      ]);
      return this.format(data);
    } finally {
      if (timer) clearTimeout(timer);
    }
  }

  snapshot(): string {
    return this.format();
  }

  format(data = this.data ?? this.fallbackData()): string {
    const currentFingerprint = this.fingerprint();
    const stale = data.fingerprint !== currentFingerprint;
    const knownFiles = data.files
      .slice(-80)
      .map((file) => {
        try {
          const current = hashText(fs.readFileSync(path.join(this.projectRoot, file.path), 'utf8'));
          return `- ${file.path} [${current === file.hash ? 'fresh' : 'STALE: re-read before relying on it'}]`;
        } catch {
          return `- ${file.path} [missing or unreadable]`;
        }
      })
      .join('\n');
    const recent = data.recentWork
      .slice(-8)
      .map(
        (work) =>
          `- ${work.agentName}: ${work.task}\n  result: ${work.result.slice(0, 800)}\n  inspected: ${work.inspectedFiles.join(', ') || '(none)'}\n  changed: ${work.changedFiles.join(', ') || '(none)'}`,
      )
      .join('\n');
    return `PROJECT CONTEXT v${data.schemaVersion}
Generated: ${data.generatedAt}
Freshness: ${stale ? 'STALE globally — verify task-relevant files' : 'current project fingerprint'}
Architecture:
${data.architecture}

Entry points:
${data.entryPoints.map((item) => `- ${item}`).join('\n') || '- unknown'}

Conventions:
${data.conventions.map((item) => `- ${item}`).join('\n') || '- none recorded'}

Pitfalls:
${data.pitfalls.map((item) => `- ${item}`).join('\n') || '- none recorded'}

Known inspected files:
${knownFiles || '- none recorded'}

Recent completed work:
${recent || '- none recorded'}

Use this map to orient yourself. Do not perform a generic repository exploration when it already answers the architecture question. Re-read only task-relevant files that are unknown, stale, or about to be modified.`.slice(0, MAX_CONTEXT_CHARS);
  }
}
