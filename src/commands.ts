import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { Controller, normalizeShellApprovalMode } from './controller.js';
import { createSkillTemplate, createSpecialistTemplate } from './skills.js';
import { isLocalProvider, isPlaceholderModel, providerNeedsApiKey } from './config.js';
import { t } from './i18n.js';
import type { AgentInfo, AgentMode, FileChange, WorkMapWarning } from './types.js';

export type ViewName =
  | 'agents'
  | 'board'
  | 'diff'
  | 'notes'
  | 'help'
  | 'settings'
  | 'settings-session'
  | 'sessions'
  | 'cost'
  | 'skills'
  | 'specialists';

/** Severity level for system messages — maps to terminal colors. */
export type SystemLevel = 'ok' | 'warn' | 'error' | 'info';

export interface UIActions {
  setView: (v: ViewName) => void;
  system: (line: string, level?: SystemLevel) => void;
  exit: () => void;
  /** Focus mode: plain input goes to this agent; null = off. */
  setFocus?: (agentName: string | null) => void;
  toggleRaw?: () => void;
  copyLatest?: () => void;
  openProject?: (folder?: string) => void;
  openWizard?: () => void;
}

export interface CommandDef {
  name: string;
  args: string;
  descKey: string;
  group?: 'modes' | 'control' | 'views' | 'settings' | 'git' | 'other';
  hidden?: boolean;
  /** Alternative spellings — accepted and autocompleted, shown in /help. */
  aliases?: string[];
}

// Grouped by intent so /help reads as a story: create agents → steer them →
// inspect the session → git safety net → session & config → exit.
export const COMMANDS: CommandDef[] = [
  // create agents
  { name: '/ask', args: '[Name:] <question> [--model=m]', descKey: 'cmd.ask', group: 'modes', aliases: ['/a'] },
  { name: '/task', args: '[Name:] <task> [--model=m] [#skill]', descKey: 'cmd.task', group: 'modes', aliases: ['/t'] },
  { name: '/plan', args: '[Name:] <task> [--model=m]', descKey: 'cmd.plan', group: 'modes', aliases: ['/p'] },
  { name: '/review', args: '[agent|all] [prompt]', descKey: 'cmd.review', group: 'modes' },
  { name: '/issue', args: '<n>', descKey: 'cmd.issue', group: 'git' },
  { name: '/specialist', args: '<name> <task> | new <name> [global]', descKey: 'cmd.specialist', group: 'modes' },
  { name: '/specialists', args: '', descKey: 'cmd.specialists', group: 'views' },
  { name: '/skill', args: 'new <name> [global]', descKey: 'cmd.skill', group: 'settings' },
  { name: '/skills', args: '', descKey: 'cmd.skills', group: 'views' },
  // steer agents
  { name: '/send', args: '<agent|all> <message>', descKey: 'cmd.send', group: 'control' },
  { name: '/attach', args: '<agent|on|off>', descKey: 'cmd.attach', group: 'control' },
  { name: '/focus', args: '<agent|off>', descKey: 'cmd.focus', group: 'control' },
  { name: '/pause', args: '<agent|all>', descKey: 'cmd.pause', group: 'control' },
  { name: '/resume', args: '<agent|all>', descKey: 'cmd.resume', group: 'control' },
  { name: '/stop', args: '<agent|all>', descKey: 'cmd.stop', group: 'control' },
  { name: '/clear', args: '', descKey: 'cmd.clear', group: 'control' },
  { name: '/raw', args: '', descKey: 'cmd.raw', group: 'control' },
  { name: '/copy', args: '', descKey: 'cmd.copy', group: 'control' },
  // git safety net
  { name: '/undo', args: '[agent]', descKey: 'cmd.undo', group: 'git' },
  { name: '/commit', args: '[agent|all] [message]', descKey: 'cmd.commit', group: 'git' },
  { name: '/autocommit', args: '<on|off>', descKey: 'cmd.autocommit', group: 'git' },
  // inspect the session
  { name: '/agents', args: '', descKey: 'cmd.agents', group: 'views' },
  { name: '/board', args: '', descKey: 'cmd.board', group: 'views' },
  { name: '/notes', args: '', descKey: 'cmd.notes', group: 'views' },
  { name: '/diff', args: '', descKey: 'cmd.diff', group: 'views' },
  { name: '/cost', args: '', descKey: 'cmd.cost', group: 'views' },
  { name: '/status', args: '', descKey: 'cmd.status', group: 'views' },
  // sessions
  { name: '/save', args: '[name]', descKey: 'cmd.save', group: 'git' },
  { name: '/sessions', args: '', descKey: 'cmd.sessions', group: 'git' },
  { name: '/session', args: '[n|latest]', descKey: 'cmd.session', group: 'git' },
  { name: '/restore', args: '<agent>', descKey: 'cmd.restore', group: 'git' },
  // config
  { name: '/model', args: '[[provider:]model]', descKey: 'cmd.model', group: 'settings' },
  { name: '/key', args: '<key>', descKey: 'cmd.key', group: 'settings', hidden: true },
  { name: '/approvals', args: '<ask|auto|auto-safe|yolo>', descKey: 'cmd.approvals', group: 'settings' },
  { name: '/sound', args: '<on|off>', descKey: 'cmd.sound', group: 'settings' },
  { name: '/settings', args: '', descKey: 'cmd.settings', group: 'settings' },
  { name: '/settings-session', args: '', descKey: 'cmd.ssettings', group: 'settings', aliases: ['/ssettings'] },
  { name: '/project', args: '[folder]', descKey: 'cmd.project', group: 'settings', aliases: ['/folder'] },
  { name: '/wizard', args: '', descKey: 'cmd.wizard', group: 'settings', aliases: ['/setup'] },
  { name: '/doctor', args: '', descKey: 'cmd.doctor', group: 'settings' },
  // exit
  { name: '/help', args: '', descKey: 'cmd.help', group: 'other' },
  { name: '/quit', args: '', descKey: 'cmd.quit', group: 'other', aliases: ['/exit'] },
];

export function visibleCommands(): CommandDef[] {
  return COMMANDS.filter((c) => !c.hidden);
}

const COMMAND_GROUP_ORDER: Array<NonNullable<CommandDef['group']>> = ['modes', 'control', 'views', 'settings', 'git', 'other'];
const COMMAND_PALETTE_PRIORITY = [
  '/ask',
  '/task',
  '/plan',
  '/review',
  '/send',
  '/focus',
  '/attach',
  '/agents',
  '/board',
  '/diff',
  '/settings',
  '/help',
  '/quit',
];

function commandRank(c: CommandDef): number {
  const priority = COMMAND_PALETTE_PRIORITY.indexOf(c.name);
  if (priority !== -1) return priority;
  const group = COMMAND_GROUP_ORDER.indexOf(c.group ?? 'other');
  return COMMAND_PALETTE_PRIORITY.length + group * 100 + COMMANDS.indexOf(c);
}

export function sortCommandsForPalette(commands: CommandDef[]): CommandDef[] {
  return [...commands].sort((a, b) => commandRank(a) - commandRank(b) || a.name.localeCompare(b.name));
}

export function matchCommands(input: string, opts: { includeHidden?: boolean } = {}): CommandDef[] {
  if (!input.startsWith('/')) return [];
  const word = input.split(/\s+/)[0].toLowerCase();
  return COMMANDS.filter((c) => opts.includeHidden || !c.hidden).filter(
    (c) => c.name.startsWith(word) || c.aliases?.some((a) => a.startsWith(word)),
  );
}

export function commandPalette(input: string, opts: { includeHidden?: boolean; allowedNames?: string[] } = {}): CommandDef[] {
  const allowed = opts.allowedNames
    ? (c: CommandDef) => opts.allowedNames!.includes(c.name) || c.aliases?.some((a) => opts.allowedNames!.includes(a))
    : () => true;
  return sortCommandsForPalette(matchCommands(input, opts).filter(allowed));
}

function agentList(ctl: Controller): string {
  return [...ctl.board.agents.values()].map((a) => a.name).join(', ') || t('m.none');
}

function commandExists(name: string): boolean {
  try {
    execFileSync('which', [name], { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

async function localEndpointReachable(baseUrl: string): Promise<boolean> {
  let timeout: ReturnType<typeof setTimeout> | undefined;
  try {
    const controller = new AbortController();
    timeout = setTimeout(() => controller.abort(), 1500);
    const resp = await fetch(baseUrl.replace(/\/+$/, '') + '/models', { signal: controller.signal });
    return resp.ok;
  } catch {
    return false;
  } finally {
    if (timeout) clearTimeout(timeout);
  }
}

async function doctorReport(ctl: Controller, ui: UIActions): Promise<void> {
  const p = ctl.sessionProvider();
  const lines: string[] = [];
  let level: SystemLevel = 'ok';

  if (!p) {
    ui.system(t('m.doctorReport', { lines: t('m.doctorNoProvider') }), 'error');
    return;
  }

  const activeModel = ctl.session.model || p.defaultModel || p.models[0] || '';
  lines.push(t('m.doctorProvider', { provider: p.name, model: activeModel || '—' }));

  if (providerNeedsApiKey(p) && !p.apiKey) {
    level = 'error';
    lines.push(t('m.doctorKeyMissing'));
  } else {
    lines.push(providerNeedsApiKey(p) ? t('m.doctorKeyOk') : t('m.doctorKeySkipped'));
  }

  if (isPlaceholderModel(activeModel)) {
    level = 'error';
    lines.push(t('m.doctorModelMissing'));
  } else {
    lines.push(t('m.doctorModelOk', { model: activeModel }));
  }

  if (isLocalProvider(p)) {
    const reachable = await localEndpointReachable(p.baseUrl);
    if (reachable) {
      lines.push(t('m.doctorEndpointOk', { url: p.baseUrl }));
    } else {
      if (level !== 'error') level = 'warn';
      lines.push(t('m.doctorEndpointFail', { url: p.baseUrl }));
    }
  }

  const sock = path.join(ctl.projectRoot, '.parallel', 'session.sock');
  lines.push(fs.existsSync(sock) ? t('m.doctorAttachOk') : t('m.doctorAttachMissing'));
  lines.push(commandExists('git') ? t('m.doctorGitOk') : t('m.doctorGitMissing'));
  lines.push(commandExists('gh') ? t('m.doctorGhOk') : t('m.doctorGhMissing'));

  ui.system(t('m.doctorReport', { lines: lines.join('\n') }), level);
}

/**
 * Single-agent ergonomics: when the session has exactly ONE agent, commands
 * that target an agent (/undo, /focus, /pause…) work without naming it.
 */
function soloAgent(ctl: Controller): string | null {
  const list = [...ctl.board.agents.values()];
  return list.length === 1 ? list[0].name : null;
}

export function buildReviewPrompt(
  targetLabel: string,
  customPrompt: string,
  agents: AgentInfo[],
  changes: FileChange[],
  warnings: WorkMapWarning[],
): string {
  const files = [...new Set(changes.map((c) => c.path))].slice(0, 30);
  const agentLines = agents.map((a) => `- ${a.name}${a.alias !== a.name ? ` (${a.alias})` : ''} [${a.state}] ${a.task}`).join('\n') || '- no target agent';
  const fileLines = files.map((f) => `- ${f}`).join('\n') || '- no tracked file changes yet; inspect git status/read relevant files';
  const warningLines =
    warnings.map((w) => `- ${w.level.toUpperCase()}: ${w.title} (${w.paths.join(', ') || 'no path'}) ${w.detail}`).join('\n') || '- none';
  return `Review target: ${targetLabel}
${customPrompt ? `Extra reviewer instruction: ${customPrompt}\n` : ''}
You are a lightweight reviewer running in ask mode. Do not edit files and do not gate the whole session.

Target agents:
${agentLines}

Tracked files to inspect:
${fileLines}

Coordination warnings:
${warningLines}

Review the current working tree and recent coordination context. Inspect the files that matter before deciding. Focus on bugs, regressions, broken contracts between agents, missing validation, and unsafe concurrent edits.

Return exactly this structure:
Verdict: APPROVE | REVISE | BLOCK
Risks:
- concrete risk or "none"
Tests to run:
- exact command or manual check
Files to inspect:
- path and why
Notes:
- short reviewer guidance for the user and agents`;
}

function spawnFrom(
  arg: string,
  ctl: Controller,
  ui: UIActions,
  images?: string[],
  specialist?: string,
  mode: AgentMode = 'task',
): void {
  const p = ctl.sessionProvider();
  if (!p) return ui.system(t('m.missingProvider'), 'error');
  if (providerNeedsApiKey(p) && !p.apiKey) return ui.system(t('m.missingKey', { name: p.name }), 'error');
  const activeModel = ctl.session.model || p.defaultModel || p.models[0] || '';
  if (isPlaceholderModel(activeModel)) {
    return ui.system(t('m.missingModel', { name: p.name }), 'error');
  }
  // optional --model=xxx flag
  let model: string | undefined;
  let task = arg;
  const mFlag = task.match(/\s--model=(\S+)/);
  if (mFlag) {
    model = mFlag[1];
    task = task.replace(mFlag[0], '').trim();
  }
  // optional #skill tokens → force-load these skills at the start of the task
  const forced: string[] = [];
  const available = ctl.getSkills();
  task = task
    .replace(/(^|\s)#([\p{L}\p{N}_-]+)/gu, (full, pre, name) => {
      const skill = available.find((s) => s.name === name.toLowerCase());
      if (!skill) return full; // unknown → leave the text as-is
      forced.push(skill.name);
      return pre;
    })
    .trim();
  if (forced.length > 0) {
    task += `\n\nMANDATORY: before anything else, call load_skill for: ${forced.map((n) => `"${n}"`).join(', ')} and follow those instructions.`;
  }
  // optional "Name:" prefix
  const named = task.match(/^([\p{L}\p{N}_-]{1,16}):\s+(.+)$/su);
  const finalTask = named ? named[2] : task;
  const agent = ctl.spawnAgent(finalTask, named ? named[1] : undefined, model, images, specialist, undefined, mode);
  if (!agent) return ui.system(specialist ? t('m.noSpecialist', { name: specialist }) : t('m.spawnFail'), 'error');
  ui.system(
    t('m.spawned', { name: agent.name, model: model ? ` (${model})` : '' }) +
      ` /${mode}` +
      (specialist ? ` 🎓${specialist}` : '') +
      (forced.length > 0 ? ` 🧩${forced.join(',')}` : ''),
    'info',
  );
}

export function executeInput(raw: string, ctl: Controller, ui: UIActions, images?: string[]): void {
  const input = raw.trim();
  if (!input) return;

  // "@Agent message" or "@all message" → live instruction
  if (input.startsWith('@')) {
    if (images?.length) ui.system(t('m.imagesIgnored'), 'warn');
    const m = input.match(/^@(\S+)\s+(.+)$/s);
    if (!m) return ui.system(t('m.usageAt'), 'warn');
    const [, target, content] = m;
    if (target.toLowerCase() === 'all') {
      const n = ctl.broadcast(content);
      ui.system(t('m.broadcast', { n }), n > 0 ? 'ok' : 'warn');
    } else if (ctl.sendToAgent(target, content)) {
      ui.system(t('m.sent', { target }), 'ok');
    } else {
      ui.system(t('m.notFound', { target, list: agentList(ctl) }), 'error');
    }
    return;
  }

  // Plain text → ALWAYS spawns agent N+1, even while others are working.
  if (!input.startsWith('/')) {
    spawnFrom(input, ctl, ui, images);
    return;
  }

  if (images?.length) ui.system(t('m.imagesIgnored'), 'warn');
  const [rawCmd, ...rest] = input.split(/\s+/);
  const cmd =
    rawCmd.toLowerCase() === '/a'
      ? '/ask'
      : rawCmd.toLowerCase() === '/t'
        ? '/task'
        : rawCmd.toLowerCase() === '/p'
          ? '/plan'
          : rawCmd.toLowerCase() === '/ssettings'
            ? '/settings-session'
            : rawCmd.toLowerCase() === '/exit'
              ? '/quit'
              : rawCmd.toLowerCase() === '/folder'
                ? '/project'
                : rawCmd.toLowerCase() === '/setup'
                  ? '/wizard'
                  : rawCmd;
  const arg = rest.join(' ').trim();

  switch (cmd.toLowerCase()) {
    case '/ask': {
      if (!arg) return ui.system(t('m.usageAsk'), 'warn');
      spawnFrom(arg, ctl, ui, images, undefined, 'ask');
      return;
    }
    case '/task': {
      if (!arg) return ui.system(t('m.usageSpawn'), 'warn');
      spawnFrom(arg, ctl, ui, images, undefined, 'task');
      return;
    }
    case '/plan': {
      // Plan-first agent: presents its plan (ask_user) and waits for approval
      // before touching any file.
      if (!arg) return ui.system(t('m.usagePlan'), 'warn');
      spawnFrom(arg, ctl, ui, images, undefined, 'plan');
      return;
    }
    case '/review': {
      const [maybeTarget, ...promptParts] = rest;
      const targetInfo = maybeTarget && maybeTarget.toLowerCase() !== 'all' ? ctl.board.getAgentByName(maybeTarget) : undefined;
      const hasExplicitTarget = Boolean(maybeTarget && (maybeTarget.toLowerCase() === 'all' || targetInfo));
      const target = hasExplicitTarget && maybeTarget ? maybeTarget : 'all';
      const customPrompt = hasExplicitTarget ? promptParts.join(' ').trim() : arg;
      if (target !== 'all' && !targetInfo) return ui.system(t('m.notFound', { target, list: agentList(ctl) }), 'error');
      const agents = target === 'all' ? [...ctl.board.agents.values()] : targetInfo ? [targetInfo] : [];
      const ids = new Set(agents.map((a) => a.id));
      const names = new Set(agents.map((a) => a.name));
      const changes = target === 'all' ? ctl.board.changes : ctl.board.changes.filter((c) => ids.has(c.agentId));
      const warnings =
        target === 'all'
          ? ctl.board.workMapWarnings
          : ctl.board.workMapWarnings.filter((w) => w.agentNames.some((name) => names.has(name)) || w.paths.some((p) => changes.some((c) => c.path === p)));
      const reviewTarget = target === 'all' ? 'all agents' : `${targetInfo?.name ?? target}`;
      spawnFrom(`Reviewer: ${buildReviewPrompt(reviewTarget, customPrompt, agents, changes, warnings)}`, ctl, ui, images, undefined, 'ask');
      return;
    }
    case '/issue': {
      // Import a task from GitHub Issues (requires the gh CLI, authenticated).
      const n = Number.parseInt(arg, 10);
      if (!arg || Number.isNaN(n)) return ui.system(t('m.usageIssue'), 'warn');
      const issue = ctl.fetchIssue(n);
      if ('error' in issue) {
        return ui.system(issue.error === 'gh-missing' ? t('m.ghMissing') : t('m.issueFail', { msg: issue.error }), 'error');
      }
      const task = `GitHub issue #${issue.number}: ${issue.title}\n\n${issue.body || '(no description)'}\n\nResolve this issue.`;
      const agent = ctl.spawnAgent(task);
      if (!agent) return ui.system(t('m.spawnFail'), 'error');
      ui.system(t('m.issueSpawned', { n: String(issue.number), name: agent.name, title: issue.title.slice(0, 60) }), 'info');
      return;
    }
    case '/undo': {
      // Revert the agent's LAST file change (blackboard checkpoint).
      const who = arg || soloAgent(ctl);
      if (!who) return ui.system(t('m.usageUndo'), 'warn');
      const r = ctl.undoAgent(who);
      if (r === null) return ui.system(t('m.notFound', { target: who, list: agentList(ctl) }), 'error');
      if (r === 'none') return ui.system(t('m.undoNone', { name: who }), 'info');
      ui.system(t('m.undone', { name: who, path: r.path }) + (r.conflict ? ' ' + t('m.undoConflict') : ''), r.conflict ? 'warn' : 'ok');
      return;
    }
    case '/commit': {
      // Commit the files touched by one agent (or all) — staged by explicit path.
      const [target0, ...msg] = rest;
      const solo = soloAgent(ctl);
      const target =
        target0 && (target0.toLowerCase() === 'all' || ctl.board.getAgentByName(target0))
          ? target0
          : target0 && solo
            ? solo
            : target0 || solo;
      const message =
        target0 && target === solo && target0.toLowerCase() !== solo?.toLowerCase() && !ctl.board.getAgentByName(target0)
          ? rest.join(' ').trim()
          : msg.join(' ').trim();
      if (!target) return ui.system(t('m.usageCommit'), 'warn');
      const r = ctl.commitFor(target, message || undefined);
      if (r.ok) return ui.system(t('m.committed', { name: target, files: String(r.files) }), 'ok');
      if (r.reason === 'not-found') return ui.system(t('m.notFound', { target, list: agentList(ctl) }), 'error');
      if (r.reason === 'no-changes') return ui.system(t('m.commitNone', { name: target }), 'info');
      return ui.system(t('m.commitFail', { msg: r.detail ?? '' }), 'error');
    }
    case '/autocommit': {
      if (arg !== 'on' && arg !== 'off') return ui.system(t('m.usageAutocommit', { state: ctl.autoCommit ? 'on' : 'off' }), 'warn');
      ctl.autoCommit = arg === 'on';
      ui.system(t('m.autocommit', { state: arg }), 'info');
      return;
    }
    case '/agents':
      ui.setView('agents');
      return;
    case '/sessions':
      ui.setView('sessions');
      return;
    case '/session': {
      // No argument → show the saved-sessions list (same as /sessions),
      // so the natural flow is: /session → pick → /session <n>.
      if (!arg) {
        ui.setView('sessions');
        return;
      }
      const force = rest.includes('--force');
      const selector = rest.filter((part) => part !== '--force').join(' ').trim();
      const sessions = Controller.listSessions(ctl.projectRoot);
      if (sessions.length === 0) return ui.system(t('m.usageSession'), 'warn');
      const idx = selector.toLowerCase() === 'latest' ? 0 : Number.parseInt(selector, 10) - 1;
      const session = sessions[idx];
      if (!session) return ui.system(t('m.usageSession'), 'warn');
      if (ctl.hasRunningAgents() && !force) return ui.system(t('m.sessionActive'), 'warn');
      ctl.loadSession(session.data);
      ui.system(t('m.sessionLoaded', { date: new Date(session.data.savedAt).toLocaleString() }) + '\n' + t('m.sessionRestoreHint'), 'ok');
      return;
    }
    case '/restore': {
      // Relaunch an agent from the restored session with its FULL conversation.
      if (!arg) return ui.system(t('m.usageRestore'), 'warn');
      if (!ctl.loadedSession) return ui.system(t('m.usageSession'), 'warn');
      const res = ctl.respawnAgent(arg);
      if (res === 'no-agent') return ui.system(t('m.noRestoredAgent', { name: arg }), 'error');
      if (res === 'no-conversation') return ui.system(t('m.noConversation', { name: arg }), 'error');
      if (!res) return ui.system(t('m.spawnFail'), 'error');
      ui.system(t('m.restored', { name: res.name }), 'ok');
      return;
    }
    case '/attach': {
      // Multi-terminal: open (or toggle the auto-opening of) a dedicated
      // terminal per agent, connected to this session.
      const who = arg || soloAgent(ctl);
      if (!who) return ui.system(t('m.usageAttach', { state: ctl.autoAttach ? 'on' : 'off' }), 'warn');
      if (who === 'on' || who === 'off') {
        ctl.autoAttach = who === 'on';
        ui.system(t('m.attachAuto', { state: who }), 'info');
        return;
      }
      const a = ctl.board.getAgentByName(who);
      if (!a) return ui.system(t('m.notFound', { target: who, list: agentList(ctl) }), 'error');
      if (!ctl.attachEnabled) return ui.system(t('m.attachManual', { cmd: `parallel attach ${a.alias}` }), 'warn');
      const r = ctl.openTerminal(a.alias);
      ui.system(
        r === 'opened'
          ? t('m.attachOpened', { name: a.name })
          : t('m.attachManual', { cmd: `parallel attach ${a.alias}` }),
        r === 'opened' ? 'ok' : 'warn',
      );
      return;
    }
    case '/focus': {
      const who = arg || soloAgent(ctl);
      if (!who) return ui.system(t('m.usageFocus'), 'warn');
      if (!ui.setFocus) return ui.system(t('m.focusOff'), 'info');
      if (who.toLowerCase() === 'off') {
        ui.setFocus(null);
        ui.system(t('m.focusOff'), 'info');
        return;
      }
      const a = ctl.board.getAgentByName(who);
      if (!a) return ui.system(t('m.notFound', { target: who, list: agentList(ctl) }), 'error');
      ui.setFocus(a.name);
      ui.system(t('m.focusOn', { name: a.name }), 'ok');
      return;
    }
    case '/doctor': {
      void doctorReport(ctl, ui);
      return;
    }
    case '/cost':
      ui.setView('cost');
      return;
    case '/status': {
      const p = ctl.sessionProvider();
      const agents = [...ctl.board.agents.values()];
      const active = agents.filter((a) => ['working', 'thinking', 'listening', 'waiting'].includes(a.state)).length;
      const cost = agents.reduce((s, a) => s + (a.cost ?? 0), 0);
      const changed = new Set(ctl.board.changes.map((c) => c.path)).size;
      const pm = p ? `${p.name}:${ctl.session.model}` : '-';
      // Multiline: each metric on its own line for readability.
      ui.system(t('m.status', { pm, approval: ctl.session.approvalMode, total: agents.length, active, changed, cost: cost.toFixed(3) }), 'info');
      return;
    }
    case '/raw':
      ui.toggleRaw?.();
      // The rawLogs state is toggled by toggleRaw — the caller in App.tsx
      // provides the current value via a closure; we let App.tsx decide which message.
      return;
    case '/copy':
      ui.copyLatest?.();
      return;
    case '/skills':
      ui.setView('skills');
      return;
    case '/specialists':
      ui.setView('specialists');
      return;
    case '/skill': {
      // /skill new <name> [global] → create a template file to edit
      const m = arg.match(/^new\s+([\p{L}\p{N}_-]+)(\s+global)?$/iu);
      if (!m) return ui.system(t('m.usageSkill'), 'warn');
      try {
        const file = createSkillTemplate(m[1], '', m[2] ? 'global' : 'project', ctl.projectRoot);
        ui.system(t('m.skillCreated', { file }), 'ok');
      } catch (e: any) {
        ui.system(t('m.alreadyExists', { msg: e?.message ?? '' }), 'error');
      }
      return;
    }
    case '/specialist': {
      if (!arg) return ui.system(t('m.usageSpecialist'), 'warn');
      // /specialist new <name> [global] → create a template file
      const created = arg.match(/^new\s+([\p{L}\p{N}_-]+)(\s+global)?$/iu);
      if (created) {
        try {
          const file = createSpecialistTemplate(created[1], '', created[2] ? 'global' : 'project', ctl.projectRoot);
          ui.system(t('m.specCreated', { file }), 'ok');
        } catch (e: any) {
          ui.system(t('m.alreadyExists', { msg: e?.message ?? '' }), 'error');
        }
        return;
      }
      // /specialist <name> [Name:] <task> → spawn an agent with this persona
      const m = arg.match(/^([\p{L}\p{N}_-]+)\s+(.+)$/su);
      if (!m) return ui.system(t('m.usageSpecialist'), 'warn');
      const exists = ctl.getSpecialists().some((s) => s.name === m[1].toLowerCase());
      if (!exists) {
        const list = ctl.getSpecialists().map((s) => s.name).join(', ') || t('m.none');
        return ui.system(t('m.noSpecialist', { name: m[1] }) + ` (${list})`, 'error');
      }
      spawnFrom(m[2], ctl, ui, images, m[1].toLowerCase(), 'task');
      return;
    }
    case '/board':
      ui.setView('board');
      return;
    case '/notes':
      ui.setView('notes');
      return;
    case '/diff':
      ui.setView('diff');
      return;
    case '/send': {
      const [target, ...msg] = rest;
      const content = msg.join(' ').trim();
      if (!target || !content) return ui.system(t('m.usageSend'), 'warn');
      executeInput(`@${target} ${content}`, ctl, ui);
      return;
    }
    case '/pause': {
      const who = arg || soloAgent(ctl);
      if (!who) return ui.system(t('m.usagePause'), 'warn');
      if (who === 'all') {
        for (const a of ctl.board.agents.values()) ctl.pauseAgent(a.name);
        ui.system(t('m.allPaused'), 'ok');
      } else {
        const ok = ctl.pauseAgent(who);
        ui.system(
          ok ? t('m.paused', { name: who }) : t('m.notFound', { target: who, list: agentList(ctl) }),
          ok ? 'ok' : 'error',
        );
      }
      return;
    }
    case '/resume': {
      const who = arg || soloAgent(ctl);
      if (!who) return ui.system(t('m.usageResume'), 'warn');
      if (who === 'all') {
        for (const a of ctl.board.agents.values()) ctl.resumeAgent(a.name);
        ui.system(t('m.allResumed'), 'ok');
      } else {
        const ok = ctl.resumeAgent(who);
        ui.system(ok ? t('m.resumed', { name: who }) : t('m.notFound', { target: who, list: agentList(ctl) }), ok ? 'ok' : 'error');
      }
      return;
    }
    case '/stop': {
      const who = arg || soloAgent(ctl);
      if (!who) return ui.system(t('m.usageStop'), 'warn');
      if (who === 'all') {
        ctl.stopAll();
        ui.system(t('m.allStopped'), 'ok');
      } else {
        const ok = ctl.stopAgent(who);
        ui.system(ok ? t('m.stopped', { name: who }) : t('m.notFound', { target: who, list: agentList(ctl) }), ok ? 'ok' : 'error');
      }
      return;
    }
    // SESSION-only: changes the model for this session, never persisted.
    case '/model': {
      if (!arg) {
        const p = ctl.sessionProvider();
        return ui.system(t('m.model', { pm: p ? `${p.name}:${ctl.session.model}` : '—' }), 'info');
      }
      const r = ctl.setSessionModel(arg);
      if (!r) {
        const provName = arg.includes(':') ? arg.split(':')[0] : arg;
        return ui.system(t('m.noProvider', { name: provName, list: ctl.config.providers.map((p) => p.name).join(', ') || t('m.none') }), 'error');
      }
      ui.system(t('m.modelSet', { pm: `${r.provider}:${r.model}` }), 'ok');
      return;
    }
    case '/settings':
      ui.setView('settings');
      return;
    case '/settings-session':
      ui.setView('settings-session');
      return;
    case '/project':
      {
        const force = rest.includes('--force');
        const folderArg = rest.filter((part) => part !== '--force').join(' ').trim();
        if (ctl.hasRunningAgents() && !force) return ui.system(t('m.projectActive'), 'warn');
        ui.openProject?.(folderArg || undefined);
      }
      return;
    case '/wizard':
      if (ctl.hasRunningAgents() && arg !== '--force') return ui.system(t('m.wizardActive'), 'warn');
      ui.openWizard?.();
      return;
    // SESSION-only approvals & sound (global defaults editable in /settings).
    case '/approvals': {
      const mode = normalizeShellApprovalMode(arg);
      if (!mode) return ui.system(t('m.usageApprovals'), 'warn');
      ctl.setSessionApprovalMode(mode);
      const approvalLevel: SystemLevel = mode === 'yolo' ? 'warn' : 'ok';
      ui.system(t('m.approvals', { mode }) + (mode === 'auto-safe' ? t('m.approvalsWarn') : mode === 'yolo' ? t('m.approvalsYoloWarn') : ''), approvalLevel);
      return;
    }
    case '/sound': {
      if (arg !== 'on' && arg !== 'off')
        return ui.system(t('m.usageSound', { state: ctl.session.soundEnabled ? 'on' : 'off' }), 'warn');
      ctl.setSessionSound(arg === 'on');
      ui.system(t('m.sound', { state: arg }), 'ok');
      return;
    }
    case '/save': {
      const file = ctl.saveSession(arg || undefined);
      ui.system(file ? (arg ? t('m.savedAs', { name: arg }) : t('m.saved')) : t('m.nothing'), file ? 'ok' : 'warn');
      return;
    }
    case '/key': {
      if (!arg) return ui.system(t('m.usageKey'), 'warn');
      const ok = ctl.setApiKey(arg);
      ui.system(ok ? t('m.keySaved', { name: ctl.sessionProvider()?.name ?? '?' }) : t('m.spawnFail'), ok ? 'ok' : 'error');
      return;
    }
    case '/clear': {
      let cleared = 0;
      for (const [id, a] of [...ctl.board.agents.entries()]) {
        if (['done', 'stopped', 'error'].includes(a.state)) {
          ctl.board.agents.delete(id);
          ctl.agents.delete(id);
          cleared++;
        }
      }
      ctl.emit('update');
      ui.system(cleared > 0 ? t('m.clearedN', { n: cleared }) : t('m.clearedNone'), 'ok');
      return;
    }
    case '/help':
      ui.setView('help');
      return;
    case '/quit':
      ctl.saveSession();
      ctl.stopAll();
      ui.exit();
      return;
    default:
      ui.system(t('m.unknown', { cmd }), 'error');
  }
}
