import { Controller, normalizeShellApprovalMode } from './controller.js';
import { createSkillTemplate, createSpecialistTemplate } from './skills.js';
import { t } from './i18n.js';
import type { AgentMode } from './types.js';

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
  { name: '/spawn', args: '[Name:] <task> [--model=m] [#skill]', descKey: 'cmd.spawn', group: 'modes', hidden: true },
  { name: '/plan', args: '[Name:] <task> [--model=m]', descKey: 'cmd.plan', group: 'modes', aliases: ['/p'] },
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
  { name: '/key', args: '<key>', descKey: 'cmd.key', group: 'settings' },
  { name: '/approvals', args: '<ask|auto|auto-safe|yolo>', descKey: 'cmd.approvals', group: 'settings' },
  { name: '/sound', args: '<on|off>', descKey: 'cmd.sound', group: 'settings' },
  { name: '/settings', args: '', descKey: 'cmd.settings', group: 'settings' },
  { name: '/settings-session', args: '', descKey: 'cmd.ssettings', group: 'settings', aliases: ['/ssettings'] },
  { name: '/doctor', args: '', descKey: 'cmd.doctor', group: 'settings' },
  // exit
  { name: '/help', args: '', descKey: 'cmd.help', group: 'other' },
  { name: '/quit', args: '', descKey: 'cmd.quit', group: 'other', aliases: ['/exit'] },
];

export function visibleCommands(): CommandDef[] {
  return COMMANDS.filter((c) => !c.hidden);
}

export function matchCommands(input: string, opts: { includeHidden?: boolean } = {}): CommandDef[] {
  if (!input.startsWith('/')) return [];
  const word = input.split(/\s+/)[0].toLowerCase();
  return COMMANDS.filter((c) => opts.includeHidden || !c.hidden).filter(
    (c) => c.name.startsWith(word) || c.aliases?.some((a) => a.startsWith(word)),
  );
}

function agentList(ctl: Controller): string {
  return [...ctl.board.agents.values()].map((a) => a.name).join(', ') || t('m.none');
}

/**
 * Single-agent ergonomics: when the session has exactly ONE agent, commands
 * that target an agent (/undo, /focus, /pause…) work without naming it.
 */
function soloAgent(ctl: Controller): string | null {
  const list = [...ctl.board.agents.values()];
  return list.length === 1 ? list[0].name : null;
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
  if (!p) return ui.system(t('m.missingProvider'));
  if (!p.apiKey) return ui.system(t('m.missingKey', { name: p.name }));
  if (!ctl.session.model && !p.defaultModel && !p.models[0]) return ui.system(t('m.missingModel', { name: p.name }));
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
  if (!agent) return ui.system(specialist ? t('m.noSpecialist', { name: specialist }) : t('m.spawnFail'));
  ui.system(
    t('m.spawned', { name: agent.name, model: model ? ` (${model})` : '' }) +
      ` /${mode}` +
      (specialist ? ` 🎓${specialist}` : '') +
      (forced.length > 0 ? ` 🧩${forced.join(',')}` : ''),
  );
}

export function executeInput(raw: string, ctl: Controller, ui: UIActions, images?: string[]): void {
  const input = raw.trim();
  if (!input) return;

  // "@Agent message" or "@all message" → live instruction
  if (input.startsWith('@')) {
    if (images?.length) ui.system(t('m.imagesIgnored'));
    const m = input.match(/^@(\S+)\s+(.+)$/s);
    if (!m) return ui.system(t('m.usageAt'));
    const [, target, content] = m;
    if (target.toLowerCase() === 'all') {
      ctl.broadcast(content);
      ui.system(t('m.broadcast'));
    } else if (ctl.sendToAgent(target, content)) {
      ui.system(t('m.sent', { target }));
    } else {
      ui.system(t('m.notFound', { target, list: agentList(ctl) }));
    }
    return;
  }

  // Plain text → ALWAYS spawns agent N+1, even while others are working.
  if (!input.startsWith('/')) {
    spawnFrom(input, ctl, ui, images);
    return;
  }

  if (images?.length) ui.system(t('m.imagesIgnored'));
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
              : rawCmd;
  const arg = rest.join(' ').trim();

  switch (cmd.toLowerCase()) {
    case '/ask': {
      if (!arg) return ui.system(t('m.usageAsk'));
      spawnFrom(arg, ctl, ui, images, undefined, 'ask');
      return;
    }
    case '/task': {
      if (!arg) return ui.system(t('m.usageSpawn'));
      spawnFrom(arg, ctl, ui, images, undefined, 'task');
      return;
    }
    case '/spawn': {
      if (!arg) return ui.system(t('m.usageSpawn'));
      spawnFrom(arg, ctl, ui, images, undefined, 'task');
      return;
    }
    case '/plan': {
      // Plan-first agent: presents its plan (ask_user) and waits for approval
      // before touching any file.
      if (!arg) return ui.system(t('m.usagePlan'));
      spawnFrom(arg, ctl, ui, images, undefined, 'plan');
      return;
    }
    case '/issue': {
      // Import a task from GitHub Issues (requires the gh CLI, authenticated).
      const n = Number.parseInt(arg, 10);
      if (!arg || Number.isNaN(n)) return ui.system(t('m.usageIssue'));
      const issue = ctl.fetchIssue(n);
      if ('error' in issue) {
        return ui.system(issue.error === 'gh-missing' ? t('m.ghMissing') : t('m.issueFail', { msg: issue.error }));
      }
      const task = `GitHub issue #${issue.number}: ${issue.title}\n\n${issue.body || '(no description)'}\n\nResolve this issue.`;
      const agent = ctl.spawnAgent(task);
      if (!agent) return ui.system(t('m.spawnFail'));
      ui.system(t('m.issueSpawned', { n: String(issue.number), name: agent.name, title: issue.title.slice(0, 60) }));
      return;
    }
    case '/undo': {
      // Revert the agent's LAST file change (blackboard checkpoint).
      const who = arg || soloAgent(ctl);
      if (!who) return ui.system(t('m.usageUndo'));
      const r = ctl.undoAgent(who);
      if (r === null) return ui.system(t('m.notFound', { target: who, list: agentList(ctl) }));
      if (r === 'none') return ui.system(t('m.undoNone', { name: who }));
      ui.system(t('m.undone', { name: who, path: r.path }) + (r.conflict ? ' ' + t('m.undoConflict') : ''));
      return;
    }
    case '/commit': {
      // Commit the files touched by one agent (or all) — staged by explicit path.
      const [target0, ...msg] = rest;
      const target = target0 || soloAgent(ctl);
      if (!target) return ui.system(t('m.usageCommit'));
      const r = ctl.commitFor(target, msg.join(' ').trim() || undefined);
      if (r.ok) return ui.system(t('m.committed', { name: target, files: String(r.files) }));
      if (r.reason === 'not-found') return ui.system(t('m.notFound', { target, list: agentList(ctl) }));
      if (r.reason === 'no-changes') return ui.system(t('m.commitNone', { name: target }));
      return ui.system(t('m.commitFail', { msg: r.detail ?? '' }));
    }
    case '/autocommit': {
      if (arg !== 'on' && arg !== 'off') return ui.system(t('m.usageAutocommit', { state: ctl.autoCommit ? 'on' : 'off' }));
      ctl.autoCommit = arg === 'on';
      ui.system(t('m.autocommit', { state: arg }));
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
      const sessions = Controller.listSessions(ctl.projectRoot);
      if (sessions.length === 0) return ui.system(t('m.usageSession'));
      const idx = arg.toLowerCase() === 'latest' ? 0 : Number.parseInt(arg, 10) - 1;
      const session = sessions[idx];
      if (!session) return ui.system(t('m.usageSession'));
      ctl.loadSession(session.data);
      ui.system(t('m.sessionLoaded', { date: new Date(session.data.savedAt).toLocaleString() }));
      return;
    }
    case '/restore': {
      // Relaunch an agent from the restored session with its FULL conversation.
      if (!arg) return ui.system(t('m.usageRestore'));
      if (!ctl.loadedSession) return ui.system(t('m.usageSession'));
      const res = ctl.respawnAgent(arg);
      if (res === 'no-conversation') return ui.system(t('m.noConversation', { name: arg }));
      if (!res) return ui.system(t('m.spawnFail'));
      ui.system(t('m.restored', { name: res.name }));
      return;
    }
    case '/attach': {
      // Multi-terminal: open (or toggle the auto-opening of) a dedicated
      // terminal per agent, connected to this session.
      const who = arg || soloAgent(ctl);
      if (!who) return ui.system(t('m.usageAttach', { state: ctl.autoAttach ? 'on' : 'off' }));
      if (who === 'on' || who === 'off') {
        ctl.autoAttach = who === 'on';
        ui.system(t('m.attachAuto', { state: who }));
        return;
      }
      const a = ctl.board.getAgentByName(who);
      if (!a) return ui.system(t('m.notFound', { target: who, list: agentList(ctl) }));
      if (!ctl.attachEnabled) return ui.system(t('m.attachManual', { cmd: `parallel attach ${a.alias}` }));
      const r = ctl.openTerminal(a.alias);
      ui.system(
        r === 'opened'
          ? t('m.attachOpened', { name: a.name })
          : t('m.attachManual', { cmd: `parallel attach ${a.alias}` }),
      );
      return;
    }
    case '/focus': {
      const who = arg || soloAgent(ctl);
      if (!who) return ui.system(t('m.usageFocus'));
      if (!ui.setFocus) return;
      if (who.toLowerCase() === 'off') {
        ui.setFocus(null);
        ui.system(t('m.focusOff'));
        return;
      }
      const a = ctl.board.getAgentByName(who);
      if (!a) return ui.system(t('m.notFound', { target: who, list: agentList(ctl) }));
      ui.setFocus(a.name);
      ui.system(t('m.focusOn', { name: a.name }));
      return;
    }
    case '/doctor': {
      const p = ctl.sessionProvider();
      if (!p) return ui.system(t('m.missingProvider'), 'error');
      if (!p.apiKey) return ui.system(t('m.missingKey', { name: p.name }), 'error');
      if (!ctl.session.model && !p.defaultModel && !p.models[0])
        return ui.system(t('m.missingModel', { name: p.name }), 'error');
      ui.system(t('m.doctorOk', { pm: `${p.name}:${ctl.session.model || p.defaultModel || p.models[0]}` }), 'ok');
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
      if (!m) return ui.system(t('m.usageSkill'));
      try {
        const file = createSkillTemplate(m[1], '', m[2] ? 'global' : 'project', ctl.projectRoot);
        ui.system(t('m.skillCreated', { file }));
      } catch (e: any) {
        ui.system(t('m.alreadyExists', { msg: e?.message ?? '' }));
      }
      return;
    }
    case '/specialist': {
      if (!arg) return ui.system(t('m.usageSpecialist'));
      // /specialist new <name> [global] → create a template file
      const created = arg.match(/^new\s+([\p{L}\p{N}_-]+)(\s+global)?$/iu);
      if (created) {
        try {
          const file = createSpecialistTemplate(created[1], '', created[2] ? 'global' : 'project', ctl.projectRoot);
          ui.system(t('m.specCreated', { file }));
        } catch (e: any) {
          ui.system(t('m.alreadyExists', { msg: e?.message ?? '' }));
        }
        return;
      }
      // /specialist <name> [Name:] <task> → spawn an agent with this persona
      const m = arg.match(/^([\p{L}\p{N}_-]+)\s+(.+)$/su);
      if (!m) return ui.system(t('m.usageSpecialist'));
      const exists = ctl.getSpecialists().some((s) => s.name === m[1].toLowerCase());
      if (!exists) {
        const list = ctl.getSpecialists().map((s) => s.name).join(', ') || t('m.none');
        return ui.system(t('m.noSpecialist', { name: m[1] }) + ` (${list})`);
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
      if (!target || !content) return ui.system(t('m.usageSend'));
      executeInput(`@${target} ${content}`, ctl, ui);
      return;
    }
    case '/pause': {
      const who = arg || soloAgent(ctl);
      if (!who) return ui.system(t('m.usagePause'));
      if (who === 'all') {
        for (const a of ctl.board.agents.values()) ctl.pauseAgent(a.name);
        ui.system(t('m.allPaused'));
      } else {
        ui.system(ctl.pauseAgent(who) ? t('m.paused', { name: who }) : t('m.notFound', { target: who, list: agentList(ctl) }));
      }
      return;
    }
    case '/resume': {
      const who = arg || soloAgent(ctl);
      if (!who) return ui.system(t('m.usageResume'));
      if (who === 'all') {
        for (const a of ctl.board.agents.values()) ctl.resumeAgent(a.name);
        ui.system(t('m.allResumed'));
      } else {
        ui.system(ctl.resumeAgent(who) ? t('m.resumed', { name: who }) : t('m.notFound', { target: who, list: agentList(ctl) }));
      }
      return;
    }
    case '/stop': {
      const who = arg || soloAgent(ctl);
      if (!who) return ui.system(t('m.usageStop'));
      if (who === 'all') {
        ctl.stopAll();
        ui.system(t('m.allStopped'));
      } else {
        ui.system(ctl.stopAgent(who) ? t('m.stopped', { name: who }) : t('m.notFound', { target: who, list: agentList(ctl) }));
      }
      return;
    }
    // SESSION-only: changes the model for this session, never persisted.
    case '/model': {
      if (!arg) {
        const p = ctl.sessionProvider();
        return ui.system(t('m.model', { pm: p ? `${p.name}:${ctl.session.model}` : '—' }));
      }
      const r = ctl.setSessionModel(arg);
      if (!r) {
        const provName = arg.includes(':') ? arg.split(':')[0] : arg;
        return ui.system(t('m.noProvider', { name: provName, list: ctl.config.providers.map((p) => p.name).join(', ') || t('m.none') }));
      }
      ui.system(t('m.modelSet', { pm: `${r.provider}:${r.model}` }));
      return;
    }
    case '/settings':
      ui.setView('settings');
      return;
    case '/settings-session':
      ui.setView('settings-session');
      return;
    // SESSION-only approvals & sound (global defaults editable in /settings).
    case '/approvals': {
      const mode = normalizeShellApprovalMode(arg);
      if (!mode) return ui.system(t('m.usageApprovals'));
      ctl.setSessionApprovalMode(mode);
      ui.system(t('m.approvals', { mode }) + (mode === 'auto-safe' ? t('m.approvalsWarn') : mode === 'yolo' ? t('m.approvalsYoloWarn') : ''));
      return;
    }
    case '/sound': {
      if (arg !== 'on' && arg !== 'off')
        return ui.system(t('m.usageSound', { state: ctl.session.soundEnabled ? 'on' : 'off' }));
      ctl.setSessionSound(arg === 'on');
      ui.system(t('m.sound', { state: arg }));
      return;
    }
    case '/save': {
      const file = ctl.saveSession(arg || undefined);
      ui.system(file ? (arg ? t('m.savedAs', { name: arg }) : t('m.saved')) : t('m.nothing'));
      return;
    }
    case '/key': {
      if (!arg) return ui.system(t('m.usageKey'));
      const ok = ctl.setApiKey(arg);
      ui.system(ok ? t('m.keySaved', { name: ctl.sessionProvider()?.name ?? '?' }) : t('m.spawnFail'));
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
      ui.system(t('m.unknown', { cmd }));
  }
}
