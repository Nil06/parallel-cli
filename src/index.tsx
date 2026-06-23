#!/usr/bin/env node
import React from 'react';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { render } from 'ink';
import { App } from './ui/App.js';
import { Controller } from './controller.js';
import { loadConfig, providerReady, setConfigHome } from './config.js';
import { setLang } from './i18n.js';

const argv = process.argv.slice(2);

function takeFlagValue(flag: string): string | undefined {
  const i = argv.indexOf(flag);
  if (i === -1) return undefined;
  const value = argv[i + 1];
  argv.splice(i, value && !value.startsWith('-') ? 2 : 1);
  return value && !value.startsWith('-') ? value : undefined;
}

const firstRun = argv.includes('--first-run');
if (firstRun) argv.splice(argv.indexOf('--first-run'), 1);
const headless = argv.includes('--headless');
if (headless) argv.splice(argv.indexOf('--headless'), 1);
const jsonOut = argv.includes('--json');
if (jsonOut) argv.splice(argv.indexOf('--json'), 1);
const configHome = takeFlagValue('--config-home');

if (argv.includes('--help') || argv.includes('-h')) {
  console.log(`⚡ Parallel — real-time parallel coding agents.

Usage:
  parallel [folder]      Start the TUI (wizard only if first setup is incomplete)
  prl [folder]           Short alias
  parallel attach <agent> [--root <dir>]
                          Open a DEDICATED terminal view on one agent of a
                          running session (native scrollback + live steering)
  parallel --first-run   Test the first-run wizard with a temporary config home
  parallel --config-home <dir> [folder]
                          Use <dir>/config.json instead of ~/.parallel/config.json
  parallel --headless "task1" ["task2"…] [--json]
                          No TUI: one agent per task in the current folder,
                          auto-approved commands, summary (or JSON) on stdout — for CI

Environment variables:
  PARALLEL_API_KEY / DEEPSEEK_API_KEY   API key
  PARALLEL_MODEL                        Default model (e.g. deepseek-chat)
  PARALLEL_BASE_URL                     OpenAI-compatible endpoint
  PARALLEL_NO_ALT_SCREEN=1              Disable the alternate terminal screen.

Inside the TUI:
  <task> + Enter         Launch agent N+1 — even while the others are working
  @a1 <message>          Real-time instruction to an agent (@all for everyone)
  /project [folder]      Change project folder or reopen the folder picker
  /wizard                Relaunch the setup wizard
  /help                  All commands
`);
  process.exit(0);
}

if (firstRun) {
  setConfigHome(fs.mkdtempSync(path.join(os.tmpdir(), 'parallel-first-run-')));
} else if (configHome) {
  setConfigHome(configHome);
}

// ---------- attach mode: dedicated terminal for ONE agent of a running session ----------
if (argv[0] === 'attach') {
  const root = path.resolve(takeFlagValue('--root') ?? process.cwd());
  const agentRef = argv[1];
  if (!agentRef) {
    console.error('Usage: parallel attach <agent> [--root <dir>]');
    process.exit(1);
  }
  if (!process.stdout.isTTY) {
    console.error('Parallel requires an interactive terminal (TTY).');
    process.exit(1);
  }
  const config = loadConfig();
  if (config.language) setLang(config.language);
  const { socketPath } = await import('./server.js');
  const sock = socketPath(root);
  if (!fs.existsSync(sock)) {
    console.error(`No running Parallel session found in ${root} (missing ${sock}).`);
    console.error('Start `parallel` in that folder first, then re-run attach.');
    process.exit(1);
  }
  const { AttachApp } = await import('./ui/AttachApp.js');
  // NO alternate screen here: <Static> writes into the native scrollback,
  // so the user can scroll this agent's history like any terminal output.
  const attachApp = render(<AttachApp agentRef={agentRef} sock={sock} />, { exitOnCtrlC: true });
  await attachApp.waitUntilExit();
  process.exit(0);
}

// ---------- headless mode (CI / scripts): no TUI, one agent per task ----------
if (headless) {
  const tasks = argv.filter((a) => !a.startsWith('-'));
  if (tasks.length === 0) {
    console.error('Usage: parallel --headless "task1" ["task2"…] [--json]');
    process.exit(1);
  }
  const config = loadConfig();
  if (config.language) setLang(config.language);
  const ctl = new Controller(config, process.cwd());
  // No human in the loop: commands are auto-approved.
  ctl.setSessionApprovalMode('yolo');
  const provider = ctl.sessionProvider();
  if (!provider || !providerReady(provider)) {
    console.error('Headless mode needs a configured provider + API key. Run `parallel` interactively once, or set PARALLEL_API_KEY.');
    process.exit(1);
  }
  // Agent questions cannot be asked: auto-answer with the recommended option.
  ctl.on('update', () => {
    for (const q of [...ctl.questions]) ctl.answerQuestion(q.id, q.options[q.recommended] ?? '', true);
  });
  for (const task of tasks) {
    if (!ctl.spawnAgent(task)) {
      console.error(`Failed to spawn an agent for: ${task}`);
      process.exit(1);
    }
  }
  const TERMINAL = ['done', 'error', 'stopped'];
  let printed = 0;
  await new Promise<void>((resolve) => {
    const iv = setInterval(() => {
      if (!jsonOut) {
        // Stream the live log to stdout (text mode only).
        const logs = ctl.board.logs;
        for (; printed < logs.length; printed++) {
          const l = logs[printed];
          const who = l.agentId ? (ctl.board.agents.get(l.agentId)?.name ?? l.agentId) : 'system';
          console.log(`[${who}] ${l.text}`);
        }
      }
      const all = [...ctl.board.agents.values()];
      if (all.length > 0 && all.every((a) => TERMINAL.includes(a.state))) {
        clearInterval(iv);
        resolve();
      }
    }, 400);
  });
  ctl.saveSession();
  const agents = [...ctl.board.agents.values()].map((a) => ({
    name: a.name,
    alias: a.alias,
    task: a.task,
    state: a.state,
    steps: a.steps,
    tokensIn: a.tokensIn,
    tokensOut: a.tokensOut,
    cost: a.cost,
    result: a.lastResult ?? null,
  }));
  const changedFiles = [...new Set(ctl.board.changes.map((c) => c.path))];
  if (jsonOut) {
    console.log(JSON.stringify({ agents, changedFiles }, null, 2));
  } else {
    console.log('\n— Summary —');
    for (const a of agents) {
      console.log(`${a.state === 'done' ? '✅' : '❌'} ${a.name} [${a.state}] ${a.result ?? ''}`);
    }
    if (changedFiles.length > 0) console.log(`Files changed: ${changedFiles.join(', ')}`);
  }
  process.exit(agents.every((a) => a.state === 'done') ? 0 : 1);
}

if (!process.stdout.isTTY) {
  console.error('Parallel requires an interactive terminal (TTY).');
  process.exit(1);
}

const config = loadConfig();
if (config.language) setLang(config.language);
const initialFolder = argv.find((a) => !a.startsWith('-'));

const useAltScreen = process.stdout.isTTY && process.env.PARALLEL_NO_ALT_SCREEN !== '1';
const restoreTerminal = () => {
  if (!useAltScreen) return;
  // Show cursor + leave alternate screen.
  process.stdout.write('\x1b[?25h\x1b[?1049l');
};

if (useAltScreen) {
  // Alternate screen + clear.
  process.stdout.write('\x1b[?1049h\x1b[2J\x1b[3J\x1b[H');
  process.once('exit', restoreTerminal);
  process.once('SIGINT', () => {
    restoreTerminal();
    process.exit(130);
  });
  process.once('SIGTERM', () => {
    restoreTerminal();
    process.exit(143);
  });
}

const app = render(<App config={config} initialFolder={initialFolder} />, { exitOnCtrlC: true });
await app.waitUntilExit();
restoreTerminal();
