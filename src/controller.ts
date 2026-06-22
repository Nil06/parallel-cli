import { EventEmitter } from 'node:events';
import fs from 'node:fs';
import path from 'node:path';
import { exec, execFileSync, spawn } from 'node:child_process';
import { Blackboard } from './coordination/blackboard.js';
import { LLMClient } from './llm/client.js';
import { Agent } from './agents/agent.js';
import { saveConfig, getProvider, upsertProvider } from './config.js';
import { priceFor, fmtCost } from './pricing.js';
import { loadSkills, loadSpecialists } from './skills.js';
import { t } from './i18n.js';
import type {
  AgentQuestion,
  ApprovalRequest,
  Note,
  ParallelConfig,
  ProviderConfig,
  ShellApprovalMode,
  AgentMode,
  SessionData,
  SessionSettings,
  Specialist,
} from './types.js';

const AGENT_COLORS = ['cyan', 'magenta', 'yellow', 'green', 'blue', 'redBright', 'cyanBright', 'magentaBright'];

export function normalizeShellApprovalMode(mode: string): ShellApprovalMode | null {
  if (mode === 'ask' || mode === 'auto-safe' || mode === 'yolo') return mode;
  if (mode === 'auto') return 'auto-safe';
  return null;
}

export function isRiskyCommand(command: string): boolean {
  const c = command.toLowerCase();
  if (/\b(sudo|su|dd|mkfs|fdisk|parted)\b/.test(c)) return true;
  if (/\b(rm|unlink|rmdir)\b/.test(c)) return true;
  if (/\b(chmod|chown)\s+-[^\s]*r\b/.test(c) || /\b(chmod|chown)\s+.*\s-r\b/.test(c)) return true;
  if (/\bmv\b.*\s(\/|~|\.\.)/.test(c)) return true;
  if (/\b(curl|wget)\b.*\|\s*(sh|bash|zsh|python|node)\b/.test(c)) return true;
  if (/\bgit\s+(reset|clean)\b/.test(c)) return true;
  if (/\bgit\s+push\b.*(--force|-f)\b/.test(c)) return true;
  if (/\b(drop|truncate)\s+(table|database|schema)\b/.test(c)) return true;
  if (/\b(prisma|knex|typeorm|sequelize|rails)\b.*\b(drop|reset|rollback|migrate)\b/.test(c)) return true;
  return false;
}

/**
 * The Controller glues everything together: it owns the blackboard, the LLM
 * clients, the live agents and the approval queue. The UI talks only to it.
 *
 * Paradigm: there is NO central orchestrator. The user launches agent N+1
 * whenever they want, while agent N is still working. Agents coordinate
 * between themselves through the blackboard (live statuses + diff feed + notes).
 *
 * Settings model:
 * - `config`  = GLOBAL settings, persisted in ~/.parallel/config.json (/settings)
 * - `session` = SESSION settings, initialized from globals, never persisted (/settings-session, /model)
 */
export class Controller extends EventEmitter {
  board: Blackboard;
  agents = new Map<string, Agent>();
  approvals: ApprovalRequest[] = [];
  questions: AgentQuestion[] = [];
  session: SessionSettings;

  private agentSeq = 0;
  private approvalSeq = 0;
  private questionSeq = 0;
  private sessionAllowedCommands = new Set<string>();
  private llmCache = new Map<string, LLMClient>();
  /** Stable per-run stamp: the session file is OVERWRITTEN (autosave), not duplicated. */
  private readonly sessionStamp = new Date().toISOString().replace(/[:.]/g, '-');
  /** Optional user-given session name (/save <name>). */
  sessionName: string | undefined;
  /** Conversation JSONL path per agent id — what makes /restore possible. */
  private conversationFiles = new Map<string, string>();
  /** The session restored at startup (source of /restore conversations). */
  loadedSession: SessionData | null = null;

  constructor(
    public config: ParallelConfig,
    public projectRoot: string,
  ) {
    super();
    this.board = new Blackboard(projectRoot);
    const p = getProvider(config);
    this.session = {
      providerName: p?.name ?? '',
      model: p?.defaultModel || p?.models[0] || '',
      approvalMode: normalizeShellApprovalMode(config.approvalMode) ?? 'ask',
      soundEnabled: config.soundEnabled,
    };
    this.board.on('update', () => this.emit('update'));
    this.board.on('agent-event', (ev: any) => this.onAgentEvent(ev));
    // Only the USER interrupts an agent's in-flight model call (steering).
    // Agent→agent notes never cut each other off: they are injected at the
    // recipient's NEXT step, together with the live snapshot + diffs — agents
    // adapt at action boundaries, they don't interrupt one another.
    this.board.on('note', (note: Note) => {
      if (note.to === 'all' || note.to === 'user') return;
      if (note.from !== 'user') return;
      const target = this.findAgent(note.to);
      if (target) target.nudge();
    });
    // Autosave: the session (+ conversations, written live by agents) survives a crash.
    const autosave = setInterval(() => this.saveSession(), 30_000);
    autosave.unref();
    // User hooks: every agent write schedules the afterWrite command (debounced).
    this.board.on('change', () => this.scheduleAfterWriteHook());
  }

  // ---------- providers / models ----------

  /** Provider used by the current session (falls back to the global default). */
  sessionProvider(): ProviderConfig | undefined {
    return getProvider(this.config, this.session.providerName || undefined);
  }

  /** Resolve "model" or "provider:model" against the configured providers. */
  resolveModel(spec: string): { provider: ProviderConfig; model: string } | null {
    const m = spec.match(/^([^:]+):(.+)$/);
    if (m) {
      const provider = getProvider(this.config, m[1].trim());
      return provider ? { provider, model: m[2].trim() } : null;
    }
    // bare model name: current session provider first, then any provider listing it
    const cur = this.sessionProvider();
    if (cur) return { provider: cur, model: spec.trim() };
    const any = this.config.providers.find((p) => p.models.includes(spec.trim()));
    return any ? { provider: any, model: spec.trim() } : null;
  }

  private llmFor(provider: ProviderConfig, model: string): LLMClient {
    const key = JSON.stringify([provider.name, provider.baseUrl, provider.apiKey, model]);
    let c = this.llmCache.get(key);
    if (!c) {
      c = new LLMClient(provider.apiKey, provider.baseUrl, model);
      this.llmCache.set(key, c);
    }
    return c;
  }

  // ---------- sound cues (terminal bell) ----------

  private onAgentEvent(ev: { type: string; id?: string; state?: string; prev?: string; path?: string }): void {
    if (ev.type === 'conflict' && ev.path) {
      // 3+ co-edit collisions on the same file: escalate to the user.
      this.board.addNote('system', 'user', t('m.conflict', { path: ev.path }));
      if (this.session.soundEnabled) this.bell(2);
      return;
    }
    // /autocommit on: each finished agent commits its own files right away.
    if (ev.type === 'state' && ev.state === 'done' && this.autoCommit && ev.id) {
      const info = this.board.agents.get(ev.id);
      if (info) {
        const r = this.commitFor(info.name);
        this.board.log(
          '',
          'system',
          r.ok
            ? t('m.committed', { name: info.name, files: String(r.files) })
            : r.reason === 'no-changes'
              ? t('m.commitNone', { name: info.name })
              : t('m.commitFail', { msg: r.detail ?? r.reason }),
        );
      }
    }
    if (!this.session.soundEnabled) return;
    if (ev.type === 'spawn') this.bell(1);
    if (ev.type === 'state') {
      if (ev.state === 'waiting') this.bell(2); // needs your approval
      else if (ev.state === 'done') this.bell(1);
      else if (ev.state === 'error' || ev.state === 'stopped') this.bell(1);
    }
  }

  private bell(times: number): void {
    for (let i = 0; i < times; i++) {
      setTimeout(() => process.stdout.write(''), i * 250);
    }
  }

  // ---------- approvals ----------

  private requestApproval = (agentId: string, command: string): Promise<boolean> => {
    const base = command.trim().split(/\s+/)[0];
    if (this.sessionAllowedCommands.has(base)) return Promise.resolve(true);
    if (this.session.approvalMode === 'yolo') return Promise.resolve(true);
    if (this.session.approvalMode === 'auto-safe' && !isRiskyCommand(command)) return Promise.resolve(true);
    return new Promise<boolean>((resolve) => {
      const agent = this.board.agents.get(agentId);
      this.approvals.push({
        id: ++this.approvalSeq,
        agentId,
        agentName: agent?.name ?? agentId,
        command,
        resolve,
      });
      this.emit('update');
    });
  };

  answerApproval(id: number, approved: boolean, always = false): void {
    const idx = this.approvals.findIndex((a) => a.id === id);
    if (idx === -1) return;
    const [req] = this.approvals.splice(idx, 1);
    if (approved && always) {
      this.sessionAllowedCommands.add(req.command.trim().split(/\s+/)[0]);
    }
    req.resolve(approved);
    this.emit('update');
  }

  // ---------- agent questions (ask_user, 30s auto-run countdown in the UI) ----------

  private requestQuestion = (
    agentId: string,
    question: string,
    options: string[],
    recommended: number,
  ): Promise<string> => {
    return new Promise<string>((resolve) => {
      const agent = this.board.agents.get(agentId);
      this.questions.push({
        id: ++this.questionSeq,
        agentId,
        agentName: agent?.name ?? agentId,
        question,
        options,
        recommended,
        resolve,
      });
      if (this.session.soundEnabled) this.bell(2); // the user is probably doing something else
      this.emit('update');
    });
  };

  /** Answer a pending agent question (by the user, or by the auto-run countdown). */
  answerQuestion(id: number, answer: string, auto = false): void {
    const idx = this.questions.findIndex((q) => q.id === id);
    if (idx === -1) return;
    const [q] = this.questions.splice(idx, 1);
    this.board.log(
      '',
      'system',
      auto ? t('m.qAuto', { name: q.agentName, answer }) : t('m.qAnswered', { name: q.agentName, answer }),
    );
    q.resolve(answer);
    this.emit('update');
  }

  // ---------- agents ----------

  /** Reload skills/specialists from disk (cheap — called on spawn and on demand). */
  getSkills() {
    return loadSkills(this.projectRoot);
  }

  getSpecialists(): Specialist[] {
    return loadSpecialists(this.projectRoot);
  }

  /** Shared project memory (.parallel/memory.md) — injected into every agent's system prompt. */
  private projectMemory(): string | undefined {
    try {
      const f = path.join(this.projectRoot, '.parallel', 'memory.md');
      if (!fs.existsSync(f)) return undefined;
      const lines = fs.readFileSync(f, 'utf8').trim().split('\n');
      return lines.slice(-50).join('\n') || undefined;
    } catch {
      return undefined;
    }
  }

  /** Launch agent N+1 — works at any time, even while others are running. */
  spawnAgent(
    task: string,
    name?: string,
    modelSpec?: string,
    images?: string[],
    specialistName?: string,
    initialHistory?: any[],
    mode: AgentMode = 'task',
  ): Agent | null {
    // Specialist persona: role appended to the system prompt, may pin a model.
    let specialist: Specialist | undefined;
    if (specialistName) {
      specialist = this.getSpecialists().find((s) => s.name === specialistName.toLowerCase());
      if (!specialist) return null;
    }
    const spec = modelSpec || specialist?.model;
    const resolved = spec
      ? this.resolveModel(spec)
      : ((): { provider: ProviderConfig; model: string } | null => {
          const p = this.sessionProvider();
          const model = this.session.model || p?.defaultModel || p?.models[0] || '';
          return p && model ? { provider: p, model } : null;
        })();
    if (!resolved) return null;
    const id = `agent-${++this.agentSeq}`;
    // Short stable handle: a1, a2, … — never runs out, fast to type (@a3 fix the tests).
    // A custom name keeps its alias, so the agent stays addressable both ways.
    const alias = `a${this.agentSeq}`;
    const agentName = name?.trim() || alias;
    const color = AGENT_COLORS[(this.agentSeq - 1) % AGENT_COLORS.length];
    // Conversation file (JSONL, appended live) — enables /restore after a save.
    let historyFile: string | undefined;
    try {
      const convDir = path.join(this.sessionsDir(), 'conversations');
      fs.mkdirSync(convDir, { recursive: true });
      historyFile = path.join(
        convDir,
        `${this.sessionStamp}-${id}-${agentName.replace(/[^\w.-]+/g, '_')}.jsonl`,
      );
    } catch {
      historyFile = undefined;
    }
    const agent = new Agent({
      id,
      name: agentName,
      alias,
      color,
      task,
      mode,
      model: resolved.model,
      llm: this.llmFor(resolved.provider, resolved.model),
      board: this.board,
      projectRoot: this.projectRoot,
      maxSteps: this.config.maxStepsPerAgent,
      requestApproval: this.requestApproval,
      requestQuestion: this.requestQuestion,
      images,
      price: priceFor(resolved.provider, resolved.model),
      skills: this.getSkills(),
      specialist,
      projectMemory: this.projectMemory(),
      historyFile,
      initialHistory,
    });
    if (historyFile) this.conversationFiles.set(id, historyFile);
    this.agents.set(id, agent);
    void agent.run();
    // Multi-terminal paradigm: each new agent gets its OWN terminal window
    // (attached to this session) — unless the user disabled it (/attach off).
    if (this.attachEnabled && this.autoAttach) {
      const r = this.openTerminal(alias);
      if (r === 'opened') this.board.log('', 'system', t('m.attachOpened', { name: agentName }));
      else this.board.log('', 'system', t('m.attachManual', { cmd: `parallel attach ${alias}` }));
    }
    return agent;
  }

  // ---------- multi-terminal (session server + one terminal per agent) ----------

  /** True once the session server listens on .parallel/session.sock (set by the UI). */
  attachEnabled = false;
  /** Auto-open a terminal per new agent (toggle: /attach on|off). */
  autoAttach = true;

  /**
   * Open a NEW system terminal running `parallel attach <alias>` for this
   * session. Best effort: tries the common terminal emulators; when none can
   * be opened (SSH, no GUI…), the caller shows the manual command instead.
   */
  openTerminal(alias: string): 'opened' | 'manual' {
    const cmd = [process.execPath, process.argv[1], 'attach', alias, '--root', this.projectRoot];
    try {
      if (process.platform === 'darwin') {
        const sh = cmd.map((c) => `'${c.replace(/'/g, `'\\''`)}'`).join(' ');
        const script = `tell application "Terminal" to do script "${sh.replace(/[\\"]/g, '\\$&')}"`;
        spawn('osascript', ['-e', script, '-e', 'tell application "Terminal" to activate'], {
          detached: true,
          stdio: 'ignore',
        }).unref();
        return 'opened';
      }
      if (process.platform === 'linux' && (process.env.DISPLAY || process.env.WAYLAND_DISPLAY)) {
        const candidates: [string, string[]][] = [
          ['gnome-terminal', ['--', ...cmd]],
          ['konsole', ['-e', ...cmd]],
          ['xfce4-terminal', ['-x', ...cmd]],
          ['x-terminal-emulator', ['-e', ...cmd]],
          ['xterm', ['-e', ...cmd]],
        ];
        for (const [bin, args] of candidates) {
          try {
            execFileSync('which', [bin], { stdio: 'ignore' });
          } catch {
            continue;
          }
          spawn(bin, args, { detached: true, stdio: 'ignore' }).unref();
          return 'opened';
        }
      }
    } catch {
      /* fall through to manual */
    }
    return 'manual';
  }

  /**
   * Relaunch an agent from a restored session (/restore <name>): its full
   * conversation is reloaded from the saved JSONL, so it continues with its
   * memory intact instead of starting from scratch.
   */
  respawnAgent(name: string): Agent | null | 'no-conversation' {
    const sa = this.loadedSession?.agents.find((a) => a.name.toLowerCase() === name.toLowerCase());
    if (!sa) return 'no-conversation';
    if (!sa.conversation || !fs.existsSync(sa.conversation)) return 'no-conversation';
    let history: any[];
    try {
      history = fs
        .readFileSync(sa.conversation, 'utf8')
        .split('\n')
        .filter(Boolean)
        .map((l) => JSON.parse(l));
    } catch {
      return 'no-conversation';
    }
    if (history.length === 0) return 'no-conversation';
    return this.spawnAgent(sa.task, sa.name, sa.model, undefined, undefined, history, sa.mode ?? 'task');
  }

  pauseAgent(name: string): boolean {
    const a = this.findAgent(name);
    if (!a) return false;
    a.pause();
    return true;
  }

  resumeAgent(name: string): boolean {
    const a = this.findAgent(name);
    if (!a) return false;
    a.resume();
    return true;
  }

  stopAgent(name: string): boolean {
    const a = this.findAgent(name);
    if (!a) return false;
    a.stop();
    return true;
  }

  stopAll(): void {
    for (const a of this.agents.values()) a.stop();
    for (const req of this.approvals.splice(0)) req.resolve(false);
    for (const q of this.questions.splice(0)) q.resolve(q.options[q.recommended] ?? '');
  }

  sendToAgent(name: string, content: string): boolean {
    const a = this.findAgent(name);
    if (!a) return false;
    a.instruct(content);
    return true;
  }

  broadcast(content: string): void {
    this.board.addNote('user', 'all', content);
  }

  hasRunningAgents(): boolean {
    return [...this.board.agents.values()].some((a) =>
      ['working', 'thinking', 'listening', 'waiting', 'paused', 'idle'].includes(a.state),
    );
  }

  /** Find a live agent by name OR alias (@a1, @a2, …). */
  findAgent(name: string): Agent | undefined {
    const info = this.board.getAgentByName(name);
    return info ? this.agents.get(info.id) : undefined;
  }

  // ---------- checkpoints (/undo) ----------

  /**
   * Revert the LAST file change of an agent by restoring the `before` content
   * recorded on the blackboard. Returns the path reverted, plus a conflict
   * flag when a LATER change by another agent touched the same file (the
   * restore then also wipes that other agent's work — the user must know).
   */
  undoAgent(name: string): { path: string; conflict: boolean } | 'none' | null {
    const info = this.board.getAgentByName(name);
    if (!info) return null;
    for (let i = this.board.changes.length - 1; i >= 0; i--) {
      const c = this.board.changes[i];
      if (c.agentId !== info.id) continue;
      const conflict = this.board.changes.some(
        (c2) => c2.id > c.id && c2.path === c.path && c2.agentId !== info.id,
      );
      try {
        const abs = path.resolve(this.projectRoot, c.path);
        if (!abs.startsWith(path.resolve(this.projectRoot))) return 'none';
        fs.writeFileSync(abs, c.before);
      } catch {
        return 'none';
      }
      this.board.changes.splice(i, 1);
      this.board.log('', 'system', `↩ undo ${info.name}: ${c.path} restored to its previous content.`);
      this.board.addNote('user', 'all', `The user reverted ${info.name}'s last change on ${c.path}. Re-read it before touching it.`);
      this.emit('update');
      return { path: c.path, conflict };
    }
    return 'none';
  }

  // ---------- git (/commit, /autocommit) ----------

  /** Session toggle: commit each agent's files automatically at task_complete. */
  autoCommit = false;

  /**
   * Commit the files touched by ONE agent (or by everyone with 'all'),
   * staged by explicit path — never `git add -A`. The commit is signed
   * `parallel(<agent>)` with a Co-Authored-By trailer per agent.
   */
  commitFor(
    ref: string,
    message?: string,
  ): { ok: true; files: number } | { ok: false; reason: 'not-found' | 'no-changes' | 'git'; detail?: string } {
    const all = ref.toLowerCase() === 'all';
    const info = all ? undefined : this.board.getAgentByName(ref);
    if (!all && !info) return { ok: false, reason: 'not-found' };
    const changes = this.board.changes.filter((c) => all || c.agentId === info!.id);
    const files = [...new Set(changes.map((c) => c.path))];
    if (files.length === 0) return { ok: false, reason: 'no-changes' };
    const agents = all ? [...new Set(changes.map((c) => c.agentName))] : [info!.name];
    const subject =
      message?.trim() ||
      (all
        ? `parallel: work of ${agents.join(', ')}`
        : `parallel(${info!.name}): ${info!.task.replace(/\s+/g, ' ').slice(0, 60)}`);
    const trailers = agents.map((n) => `Co-Authored-By: ${n} (Parallel agent) <agents@parallel-cli>`);
    try {
      execFileSync('git', ['add', '--', ...files], { cwd: this.projectRoot, stdio: 'pipe' });
      execFileSync('git', ['commit', '-m', `${subject}\n\n${trailers.join('\n')}`], {
        cwd: this.projectRoot,
        stdio: 'pipe',
      });
      return { ok: true, files: files.length };
    } catch (e: any) {
      const detail = String(e?.stderr ?? e?.stdout ?? e?.message ?? e)
        .trim()
        .split('\n')
        .slice(-3)
        .join(' ')
        .slice(0, 200);
      return { ok: false, reason: 'git', detail };
    }
  }

  // ---------- user hooks (.parallel/hooks.json → { "afterWrite": "<command>" }) ----------

  private hookTimer: NodeJS.Timeout | null = null;
  private hookRunning = false;

  private hooksConfig(): { afterWrite?: string } | null {
    try {
      const f = path.join(this.projectRoot, '.parallel', 'hooks.json');
      if (!fs.existsSync(f)) return null;
      return JSON.parse(fs.readFileSync(f, 'utf8'));
    } catch {
      return null;
    }
  }

  /** Debounced (1.5s after the LAST write): one test run per burst of edits, not per file. */
  private scheduleAfterWriteHook(): void {
    const cmd = this.hooksConfig()?.afterWrite;
    if (!cmd || typeof cmd !== 'string') return;
    if (this.hookTimer) clearTimeout(this.hookTimer);
    this.hookTimer = setTimeout(() => {
      this.hookTimer = null;
      if (this.hookRunning) return this.scheduleAfterWriteHook();
      this.hookRunning = true;
      exec(cmd, { cwd: this.projectRoot, timeout: 120_000 }, (err, stdout, stderr) => {
        this.hookRunning = false;
        const out = `${stdout ?? ''}${stderr ?? ''}`.trim().split('\n').slice(-6).join('\n');
        this.board.log('', 'system', `⚓ hook afterWrite ${err ? '✗' : '✓'} (${cmd})${out ? `\n${out}` : ''}`);
      });
    }, 1500);
    this.hookTimer.unref?.();
  }

  // ---------- GitHub Issues (/issue <n>, via the gh CLI) ----------

  fetchIssue(n: number): { title: string; body: string; number: number } | { error: string } {
    try {
      const raw = execFileSync('gh', ['issue', 'view', String(n), '--json', 'title,body,number'], {
        cwd: this.projectRoot,
        stdio: 'pipe',
        timeout: 15_000,
      });
      const data = JSON.parse(String(raw));
      return { title: String(data.title ?? ''), body: String(data.body ?? ''), number: Number(data.number ?? n) };
    } catch (e: any) {
      if (e?.code === 'ENOENT') return { error: 'gh-missing' };
      const detail = String(e?.stderr ?? e?.message ?? e).trim().split('\n')[0].slice(0, 160);
      return { error: detail || 'gh failed' };
    }
  }

  // ---------- sessions (save / resume) ----------

  private sessionsDir(): string {
    return path.join(this.projectRoot, '.parallel', 'sessions');
  }

  /**
   * Save the session to a STABLE file (one per run, overwritten by the 30s
   * autosave) — `/save <name>` additionally gives it a friendly name.
   */
  saveSession(name?: string): string | null {
    if (name) this.sessionName = name;
    if (this.board.agents.size === 0 && this.board.notes.length === 0) return null;
    try {
      const dir = this.sessionsDir();
      fs.mkdirSync(dir, { recursive: true });
      const data: SessionData = {
        savedAt: new Date().toISOString(),
        name: this.sessionName,
        projectRoot: this.projectRoot,
        agents: [...this.board.agents.values()].map((a) => ({
          name: a.name,
          task: a.task,
          mode: a.mode,
          state: a.state,
          lastResult: a.lastResult,
          steps: a.steps,
          tokensIn: a.tokensIn,
          tokensOut: a.tokensOut,
          cost: a.cost,
          model: a.model,
          conversation: this.conversationFiles.get(a.id),
        })),
        notes: this.board.notes.slice(-200),
        changedFiles: [...new Set(this.board.changes.map((c) => c.path))],
      };
      const file = path.join(dir, `session-${this.sessionStamp}.json`);
      fs.writeFileSync(file, JSON.stringify(data, null, 2));
      return file;
    } catch {
      return null;
    }
  }

  static listSessions(projectRoot: string): { file: string; data: SessionData }[] {
    try {
      const dir = path.join(projectRoot, '.parallel', 'sessions');
      if (!fs.existsSync(dir)) return [];
      return fs
        .readdirSync(dir)
        .filter((f) => f.endsWith('.json'))
        .map((f) => {
          const file = path.join(dir, f);
          return { file, data: JSON.parse(fs.readFileSync(file, 'utf8')) as SessionData };
        })
        .sort((a, b) => (a.data.savedAt < b.data.savedAt ? 1 : -1))
        .slice(0, 8);
    } catch {
      return [];
    }
  }

  /** Restore the memory of a previous session into the blackboard. */
  loadSession(data: SessionData): void {
    this.loadedSession = data;
    if (data.name) this.sessionName = data.name;
    const tasks = data.agents.map((a) => `${a.name} [${a.state}] : ${a.task}${a.lastResult ? ` → ${a.lastResult}` : ''}`);
    this.board.addNote(
      'system',
      'all',
      `Previous session restored (${data.savedAt}). Past work:\n${tasks.join('\n')}\nFiles changed then: ${data.changedFiles.join(', ') || '(none)'}`,
    );
    for (const n of data.notes.slice(-50)) {
      this.board.notes.push({ ...n, id: this.board.notes.length + 1 });
    }
    this.board.log('', 'system', t('m.sessionRestored', { date: new Date(data.savedAt).toLocaleString() }));
    // Financial history: per-agent cost/steps/tokens of the restored session.
    const withCost = data.agents.filter((a) => a.cost !== undefined || a.tokensIn !== undefined);
    if (withCost.length > 0) {
      const fmt = (n: number | null | undefined) => (n === null || n === undefined ? '—' : fmtCost(n));
      const lines = withCost.map(
        (a) =>
          `  ${a.name} (${a.model ?? '?'}) · ${a.steps ?? 0} steps · ${Math.round(((a.tokensIn ?? 0) + (a.tokensOut ?? 0)) / 1000)}k tok · ${fmt(a.cost)}`,
      );
      const total = withCost.reduce((s, a) => s + (a.cost ?? 0), 0);
      this.board.log('', 'system', t('m.costHistory', { total: fmtCost(total) }) + '\n' + lines.join('\n'));
    }
    this.emit('update');
  }

  // ---------- SESSION settings (/settings-session, /model) — never persisted ----------

  setSessionModel(spec: string): { provider: string; model: string } | null {
    const r = this.resolveModel(spec);
    if (!r) return null;
    this.session.providerName = r.provider.name;
    this.session.model = r.model;
    this.emit('update');
    return { provider: r.provider.name, model: r.model };
  }

  setSessionProvider(name: string): boolean {
    const p = getProvider(this.config, name);
    if (!p) return false;
    this.session.providerName = p.name;
    this.session.model = p.defaultModel;
    this.emit('update');
    return true;
  }

  setSessionApprovalMode(mode: ShellApprovalMode): void {
    this.session.approvalMode = mode;
    this.emit('update');
  }

  setSessionSound(enabled: boolean): void {
    this.session.soundEnabled = enabled;
    this.emit('update');
  }

  // ---------- GLOBAL settings (/settings) — persisted ----------

  saveProvider(p: ProviderConfig): void {
    upsertProvider(this.config, p);
    this.llmCache.clear();
    // if the session points at this provider, refresh its view
    if (this.session.providerName.toLowerCase() === p.name.toLowerCase()) {
      this.session.providerName = p.name;
      if (!p.models.includes(this.session.model)) this.session.model = p.defaultModel;
    }
    if (!this.session.providerName) {
      this.session.providerName = p.name;
      this.session.model = p.defaultModel;
    }
    this.emit('update');
  }

  setDefaultProvider(name: string): boolean {
    const p = getProvider(this.config, name);
    if (!p) return false;
    this.config.defaultProvider = p.name;
    saveConfig(this.config);
    this.emit('update');
    return true;
  }

  /** Set the API key of the CURRENT session provider (persisted globally). */
  setApiKey(key: string): boolean {
    const p = this.sessionProvider();
    if (!p) return false;
    p.apiKey = key;
    saveConfig(this.config);
    this.llmCache.clear();
    this.emit('update');
    return true;
  }

  /** Remove a provider by name. Clears the default if it was the removed one. */
  removeProvider(name: string): boolean {
    const idx = this.config.providers.findIndex(p => p.name.toLowerCase() === name.toLowerCase());
    if (idx < 0) return false;
    this.config.providers.splice(idx, 1);
    if (this.config.defaultProvider.toLowerCase() === name.toLowerCase()) {
      this.config.defaultProvider = this.config.providers[0]?.name ?? '';
    }
    // If the session was using the removed provider, reset it
    if (this.session.providerName.toLowerCase() === name.toLowerCase()) {
      const fallback = this.config.providers[0];
      this.session.providerName = fallback?.name ?? '';
      this.session.model = fallback?.defaultModel ?? '';
    }
    saveConfig(this.config);
    this.llmCache.clear();
    this.emit('update');
    return true;
  }

  setGlobalApprovalMode(mode: ShellApprovalMode): void {
    this.config.approvalMode = mode;
    saveConfig(this.config);
    this.emit('update');
  }

  setGlobalSound(enabled: boolean): void {
    this.config.soundEnabled = enabled;
    saveConfig(this.config);
    this.emit('update');
  }

  setLanguage(lang: ParallelConfig['language']): void {
    this.config.language = lang;
    saveConfig(this.config);
    this.emit('update');
  }
}
