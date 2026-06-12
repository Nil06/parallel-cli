import { EventEmitter } from 'node:events';
import fs from 'node:fs';
import path from 'node:path';
import type {
  AgentInfo,
  AgentState,
  FileActivity,
  FileChange,
  LogEntry,
  LogKind,
  Note,
} from '../types.js';

/**
 * The Blackboard is the shared, real-time awareness space of Parallel.
 *
 * Philosophy: NOTHING here ever blocks an agent. Files are never locked.
 * Instead, every agent sees — before every single model call — what the
 * others are doing right now: their status, the files they touch, and the
 * actual diffs of their recent edits. Each agent adapts continuously,
 * integrates the others' work, and communicates through notes.
 */
export class Blackboard extends EventEmitter {
  agents = new Map<string, AgentInfo>();
  fileActivity = new Map<string, FileActivity>(); // path -> last touch
  notes: Note[] = [];
  changes: FileChange[] = [];
  logs: LogEntry[] = [];

  private noteSeq = 0;
  private changeSeq = 0;
  private logSeq = 0;
  private persistTimer: NodeJS.Timeout | null = null;

  constructor(public projectRoot: string) {
    super();
    this.setMaxListeners(64);
  }

  private touch(): void {
    this.emit('update');
    this.schedulePersist();
  }

  // ---------- agents ----------

  registerAgent(info: AgentInfo): void {
    this.agents.set(info.id, info);
    this.log('', 'system', `Agent ${info.name} launched — task: ${info.task}`);
    this.emit('agent-event', { type: 'spawn', id: info.id });
    this.touch();
  }

  updateAgent(id: string, patch: Partial<AgentInfo>): void {
    const a = this.agents.get(id);
    if (!a) return;
    Object.assign(a, patch);
    this.touch();
  }

  setAgentState(id: string, state: AgentState, action?: string): void {
    const a = this.agents.get(id);
    if (!a) return;
    const prev = a.state;
    a.state = state;
    if (action !== undefined) a.currentAction = action;
    // A finished agent no longer holds any declared work area.
    if (state === 'done' || state === 'stopped' || state === 'error') a.claims = undefined;
    if (prev !== state) this.emit('agent-event', { type: 'state', id, state, prev });
    this.touch();
  }

  /** Find an agent by its name OR its short alias (@a1, @a2, …). */
  getAgentByName(name: string): AgentInfo | undefined {
    const lower = name.toLowerCase();
    for (const a of this.agents.values()) {
      if (a.name.toLowerCase() === lower || a.alias?.toLowerCase() === lower) return a;
    }
    return undefined;
  }

  // ---------- file activity (awareness, never blocking) ----------

  recordActivity(relPath: string, agentId: string, op: 'write' | 'edit'): void {
    const agent = this.agents.get(agentId);
    this.fileActivity.set(relPath, {
      path: relPath,
      agentId,
      agentName: agent?.name ?? agentId,
      op,
      ts: Date.now(),
    });
    this.touch();
  }

  // ---------- notes (inter-agent messages) ----------

  addNote(from: string, to: string, content: string): Note {
    // Normalize alias recipients (@a1 → canonical name) so notesFor() matches.
    if (to !== 'all' && to !== 'user') {
      const target = this.getAgentByName(to);
      if (target) to = target.name;
    }
    const note: Note = { id: ++this.noteSeq, from, to, content, ts: Date.now() };
    this.notes.push(note);
    if (this.notes.length > 400) this.notes.splice(0, this.notes.length - 400);
    this.log('', 'note', `✉ ${from} → ${to}: ${content}`);
    // Lets the controller nudge the recipient so it reads the note NOW
    // instead of at its next natural turn.
    this.emit('note', note);
    this.touch();
    return note;
  }

  /** Notes addressed to a given agent (by name) or to everyone, newer than `sinceId`. */
  notesFor(agentName: string, sinceId: number): Note[] {
    const lower = agentName.toLowerCase();
    return this.notes.filter(
      (n) =>
        n.id > sinceId &&
        n.from.toLowerCase() !== lower &&
        (n.to === 'all' || n.to.toLowerCase() === lower),
    );
  }

  // ---------- file changes (real-time diff feed) ----------

  addChange(agentId: string, relPath: string, before: string, after: string): FileChange {
    const agent = this.agents.get(agentId);
    const change: FileChange = {
      id: ++this.changeSeq,
      agentId,
      agentName: agent?.name ?? agentId,
      path: relPath,
      before,
      after,
      ts: Date.now(),
    };
    this.changes.push(change);
    if (this.changes.length > 300) this.changes.splice(0, this.changes.length - 300);
    // User hooks (.parallel/hooks.json → afterWrite) listen to this event.
    this.emit('change', change);
    this.touch();
    return change;
  }

  /** Changes made by OTHER agents since a given change id — the live diff feed. */
  changesSince(agentId: string, sinceId: number): FileChange[] {
    return this.changes.filter((c) => c.id > sinceId && c.agentId !== agentId);
  }

  // ---------- conflict escalation (repeated co-edit collisions on one file) ----------

  private conflictCounts = new Map<string, number>();

  /**
   * Record a co-edit collision on a file (REAL-TIME ADAPTATION triggered).
   * Returns the running count so callers can escalate to the user when agents
   * keep stepping on each other (>= 3 collisions on the same file).
   */
  recordConflict(relPath: string): number {
    const n = (this.conflictCounts.get(relPath) ?? 0) + 1;
    this.conflictCounts.set(relPath, n);
    if (n === 3) this.emit('agent-event', { type: 'conflict', path: relPath });
    return n;
  }

  lastChangeId(): number {
    return this.changes.length > 0 ? this.changes[this.changes.length - 1].id : 0;
  }

  // ---------- logs ----------

  log(agentId: string, kind: LogKind, text: string): void {
    this.logs.push({ agentId, kind, text, ts: Date.now(), seq: ++this.logSeq });
    if (this.logs.length > 2000) this.logs.splice(0, this.logs.length - 2000);
    this.emit('update');
  }

  logsFor(agentId: string, count: number): LogEntry[] {
    const out: LogEntry[] = [];
    for (let i = this.logs.length - 1; i >= 0 && out.length < count; i--) {
      if (this.logs[i].agentId === agentId) out.push(this.logs[i]);
    }
    return out.reverse();
  }

  // ---------- live snapshot injected into every model call ----------

  snapshotFor(agentId: string): string {
    const me = this.agents.get(agentId);
    const lines: string[] = [];
    lines.push('=== REAL-TIME STATE OF THE OTHER AGENTS ===');

    const others = [...this.agents.values()].filter((a) => a.id !== agentId);
    if (others.length === 0) {
      lines.push('You are the only active agent for now.');
    } else {
      for (const a of others) {
        lines.push(
          `  • ${a.name}${a.alias !== a.name ? ` (alias ${a.alias})` : ''} [${a.state}] — task: ${a.task}` +
            (a.currentAction ? ` | right now: ${a.currentAction}` : '') +
            (a.claims && a.claims.length > 0 ? ` | declared work area: ${a.claims.join(', ')}` : ''),
        );
      }
    }

    const activities = [...this.fileActivity.values()]
      .sort((a, b) => b.ts - a.ts)
      .slice(0, 10);
    if (activities.length > 0) {
      lines.push('Recent file activity (who works where):');
      for (const act of activities) {
        const mine = act.agentId === agentId;
        const age = Math.round((Date.now() - act.ts) / 1000);
        lines.push(`  • ${act.path} — ${mine ? 'you' : act.agentName} (${act.op}, ${age}s ago)`);
      }
    }

    if (me) lines.push(`Reminder — your task: ${me.task}`);
    lines.push('=== END OF REAL-TIME STATE ===');
    return lines.join('\n');
  }

  // ---------- persistence (best effort, for inspection/debug) ----------

  private schedulePersist(): void {
    if (this.persistTimer) return;
    this.persistTimer = setTimeout(() => {
      this.persistTimer = null;
      try {
        const dir = path.join(this.projectRoot, '.parallel');
        fs.mkdirSync(dir, { recursive: true });
        const state = {
          updatedAt: new Date().toISOString(),
          agents: [...this.agents.values()].map(({ id, name, task, state, currentAction }) => ({
            id,
            name,
            task,
            state,
            currentAction,
          })),
          fileActivity: [...this.fileActivity.values()],
          notes: this.notes.slice(-100),
        };
        fs.writeFileSync(path.join(dir, 'state.json'), JSON.stringify(state, null, 2));
      } catch {
        // best effort only
      }
    }, 500);
  }
}
