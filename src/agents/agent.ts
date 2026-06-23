import fs from 'node:fs';
import * as Diff from 'diff';
import type { ChatCompletionMessageParam } from 'openai/resources/chat/completions';
import { LLMClient } from '../llm/client.js';
import { Blackboard } from '../coordination/blackboard.js';
import { ToolExecutor, TOOL_DEFINITIONS, ApprovalCallback, QuestionCallback } from './tools.js';
import { costOf } from '../pricing.js';
import { skillsCatalog } from '../skills.js';
import { getLang, LANG_NAME_EN } from '../i18n.js';
import type { AgentInfo, AgentMode, ModelPrice, Skill, Specialist } from '../types.js';

// Agent-facing prompts stay in English (canonical for models). Only notes
// addressed to the user follow the configured UI language.
const SYSTEM_PROMPT = (
  name: string,
  task: string,
  mode: AgentMode,
  userLang: string,
  skillsList: string,
  specialist?: Specialist,
  projectMemory?: string,
) => `You are agent "${name}", an autonomous software engineer inside PARALLEL, an environment where SEVERAL agents work at the same time on the SAME project, each on its own task given by the user.
${
  specialist
    ? `
YOUR ROLE — you are the "${specialist.name}" specialist:
${specialist.role}
`
    : ''
}
YOUR TASK: ${task}

AGENT MODE: ${mode}
${
  mode === 'ask'
    ? `ASK MODE:
- You are advisory only. Do not modify files.
- You may inspect with list_files/read_file/search and safe read-only commands when useful.
- Do not run mutating commands, write files, edit files, claim files, or commit.
- Finish with task_complete using this user-facing structure in ${userLang}: "Réponse courte", "Recommandation", "Pourquoi", "Prochaines étapes".`
    : mode === 'plan'
      ? `PLAN MODE:
- Explore first with read-only tools.
- Before modifying any file or running mutating commands, call ask_user with a concrete implementation plan.
- The plan must include steps, files you expect to touch, risks, and validation.
- Use options ["Approve", "Revise"], recommended "Revise" so timeout never approves changes.
- Start editing only after explicit "Approve".
- Finish with task_complete using this user-facing structure in ${userLang}: "Plan appliqué", "Ce que j’ai modifié", "Validation", "Risques restants".`
      : `TASK MODE:
- Execute the user's objective end-to-end.
- Explore, edit, validate, and summarize.
- Ask the user only when blocked or when a risky product decision cannot be inferred.
- Finish with task_complete using this user-facing structure in ${userLang}: "Ce que j’ai fait", "Ce que j’ai vérifié", "Résultat", "Détails techniques".`
}
${
  skillsList
    ? `
SKILLS — instructions written by the user, loadable on demand (load_skill):
${skillsList}
If a skill's description matches your task, load it BEFORE starting the related work and follow it.
`
    : ''
}${
  projectMemory
    ? `
PROJECT MEMORY — durable facts recorded by previous agents on this project. Trust them, but verify in the code when critical:
${projectMemory}
`
    : ''
}

PARALLEL'S PHILOSOPHY — REAL-TIME CO-EDITING, NEVER ANY BLOCKING:
1. No file is ever locked. You MAY modify a file another agent is working on, if it moves your task forward.
2. In return, you must NEVER break another agent's work: before every call you receive the live state of the other agents and the DIFFS of their recent changes. Read them and understand what they imply for your task.
3. If another agent modified a file you rely on: re-read it (read_file), integrate their changes, overwrite NOTHING of their work. Build ON TOP.
4. Continuously announce what you are doing (update_status) and your intentions on shared areas (post_note): the others adapt to you just as you adapt to them.
5. If your work may conflict with someone else's (same function, same interface), coordinate by note BEFORE editing: propose a contract (signatures, formats), or ask them to adjust.
6. If you receive a note (from an agent or the user), take it into account immediately and adapt your plan.
7. Always make progress: never sit waiting for another agent. There is always a part of your task doable right now.
8. MAKE THE SHARED AWARENESS VISIBLE: when another agent's work influenced a decision of yours (you reused their function, adapted to their diff, avoided their work area), SAY IT explicitly — in a post_note to them ("I saw you changed X, so I did Y") and in your task_complete summary (name the agent and what you built on). The user must be able to SEE that you worked as a team, not as isolated bots.

WORK METHOD:
- Explore first (list_files, read_file, search) before modifying.
- Declare your work area with claim_files when you start (and when it changes): it prevents collisions without ever locking anything.
- If you discover a durable, non-obvious fact about the project (convention, decision, pitfall), save it with remember(fact) for future agents.
- wait_for_agent exists for hard dependencies only — prefer progressing on another part of your task over waiting.
- Prefer edit_file (targeted changes) over write_file (full rewrite): targeted edits coexist better in parallel.
- Make minimal changes; do not rewrite what already works.
- Verify your work when relevant (run_command for tests/build), then finish with task_complete.
- The task_complete summary is user-facing. Make it structured and specific in ${userLang}, not just "done":
  1. What I did — concrete outcome in 1-2 sentences.
  2. Files changed or inspected — mention paths when relevant.
  3. Validation — exact command(s) run and result, or say what was not run.
  4. Remaining caveats / next step — only if useful.
- Never invent a file's content: read it. And re-read it if it changed.

LANGUAGE: write notes addressed to "user" and your task_complete summary in ${userLang}. Notes to other agents and code stay in English.`;

export interface AgentOptions {
  id: string;
  name: string;
  /** Short stable handle (a1, a2, …) — addressable via @a1 even with a custom name. */
  alias: string;
  color: string;
  task: string;
  mode: AgentMode;
  model: string;
  llm: LLMClient;
  board: Blackboard;
  projectRoot: string;
  maxSteps: number;
  requestApproval: ApprovalCallback;
  requestQuestion: QuestionCallback;
  /** PNG data URIs (data:image/png;base64,...) pasted by the user — multimodal models only. */
  images?: string[];
  /** Resolved pricing of the model — null = unknown (cost displayed as —). */
  price: ModelPrice | null;
  /** Skills available to this agent (loaded at spawn time). */
  skills: Skill[];
  /** Optional specialist persona (role appended to the system prompt, may pin a model). */
  specialist?: Specialist;
  /** Shared project memory (.parallel/memory.md) injected into the system prompt. */
  projectMemory?: string;
  /** JSONL file where the full conversation is appended (enables /restore). */
  historyFile?: string;
  /** Previous conversation to resume from (loaded from a saved session's JSONL). */
  initialHistory?: ChatCompletionMessageParam[];
}

/** Assumed context window (tokens) when the provider does not advertise one. */
const CONTEXT_WINDOW = 128_000;

export class Agent {
  readonly id: string;
  readonly name: string;
  private history: ChatCompletionMessageParam[] = [];
  private executor: ToolExecutor;
  private llm: LLMClient;
  private board: Blackboard;
  private maxSteps: number;
  private abort = new AbortController();
  private paused = false;
  private stopped = false;
  private lastNoteId = 0;
  private lastChangeId = 0;

  constructor(private opts: AgentOptions) {
    this.id = opts.id;
    this.name = opts.name;
    this.llm = opts.llm;
    this.board = opts.board;
    this.maxSteps = opts.maxSteps;
    this.executor = new ToolExecutor(
      opts.board,
      opts.id,
      opts.name,
      opts.projectRoot,
      opts.requestApproval,
      opts.requestQuestion,
      opts.skills,
      opts.mode,
    );

    const info: AgentInfo = {
      id: opts.id,
      name: opts.name,
      alias: opts.alias,
      color: opts.color,
      task: opts.task,
      mode: opts.mode,
      model: opts.model,
      state: 'idle',
      currentAction: '',
      steps: 0,
      tokensIn: 0,
      tokensOut: 0,
      cost: opts.price ? 0 : null,
      startedAt: Date.now(),
      specialist: opts.specialist?.name,
    };
    this.board.registerAgent(info);
    // Skip notes/changes that existed before this agent was born
    this.lastNoteId = this.board.notes.length > 0 ? this.board.notes[this.board.notes.length - 1].id : 0;
    this.lastChangeId = this.board.lastChangeId();
  }

  pause(): void {
    this.paused = true;
    this.board.setAgentState(this.id, 'paused');
  }

  resume(): void {
    this.paused = false;
    this.board.setAgentState(this.id, 'working');
  }

  stop(): void {
    this.stopped = true;
    this.abort.abort();
    this.board.setAgentState(this.id, 'stopped');
  }

  // ---------- real-time steering (User → Agent N) ----------

  private steerQueue: string[] = [];
  private llmAbort: AbortController | null = null;
  private steered = false;

  /** True once the run loop has exited (done / error / stopped / step limit). */
  private finished = false;

  /**
   * Inject a user instruction mid-run (from @Agent or /send).
   * REAL steering: if the agent is thinking, the in-flight model call is
   * aborted so the message is handled NOW, not several steps later.
   * If the agent already FINISHED, the conversation simply continues: the
   * follow-up reopens the run loop with the full history intact.
   */
  instruct(content: string): void {
    this.steerQueue.push(content);
    this.board.log(this.id, 'note', `📨 user → ${this.name}: ${content}`);
    if (this.finished) {
      this.finished = false;
      this.stopped = false;
      this.paused = false;
      this.abort = new AbortController();
      this.board.setAgentState(this.id, 'working', 'follow-up');
      void this.loop();
      return;
    }
    this.steered = true;
    this.llmAbort?.abort();
  }

  /**
   * A note addressed to this agent just arrived: interrupt the current model
   * call so the next turn (which injects unread notes) starts immediately.
   */
  nudge(): void {
    this.steered = true;
    this.llmAbort?.abort();
  }

  /**
   * Append a message to the in-memory history AND to the conversation file
   * (JSONL, one message per line) — the file is what makes /restore possible.
   */
  private record(msg: ChatCompletionMessageParam): void {
    this.history.push(msg);
    if (this.opts.historyFile) {
      try {
        fs.appendFileSync(this.opts.historyFile, JSON.stringify(msg) + '\n');
      } catch {
        // best effort — never let persistence break the agent
      }
    }
  }

  private async waitWhilePaused(): Promise<void> {
    while (this.paused && !this.stopped) {
      await new Promise((r) => setTimeout(r, 300));
    }
  }

  /**
   * Build the live context injected before EVERY model call:
   * other agents' status + their fresh diffs + unread notes.
   * Returns { text, hasNews } — hasNews drives the 'listening' state.
   */
  private liveContext(): { text: string; hasNews: boolean } {
    let hasNews = false;
    const parts: string[] = ['[REAL TIME]', this.board.snapshotFor(this.id)];

    const changes = this.board.changesSince(this.id, this.lastChangeId);
    if (changes.length > 0) {
      this.lastChangeId = changes[changes.length - 1].id;
      hasNews = true;
      parts.push('\n[LIVE DIFFS — changes made by the other agents since your last turn]');
      // group by file, keep the most recent change per file, max 4 files
      const byFile = new Map<string, (typeof changes)[number]>();
      for (const c of changes) byFile.set(c.path, c);
      let shown = 0;
      for (const c of byFile.values()) {
        if (shown >= 4) {
          parts.push(`  … and ${byFile.size - shown} more modified file(s).`);
          break;
        }
        const patch = Diff.createPatch(c.path, c.before, c.after, '', '', { context: 1 });
        const excerpt = patch.split('\n').slice(4, 22).join('\n');
        parts.push(`--- ${c.agentName} modified ${c.path}:\n${excerpt}`);
        shown++;
      }
      parts.push(
        'Analyze these diffs: if any of them touches your work area, re-read the affected file and adapt. NEVER undo these changes.',
      );
    }

    const notes = this.board.notesFor(this.name, this.lastNoteId);
    if (notes.length > 0) {
      this.lastNoteId = notes[notes.length - 1].id;
      hasNews = true;
      parts.push('\n[NOTES RECEIVED — take them into account now]');
      for (const n of notes) {
        parts.push(`  • from ${n.from}: ${n.content}`);
      }
    }

    parts.push('\nContinue your task taking the above into account. Use tools, or task_complete if finished.');
    return { text: parts.join('\n'), hasNews };
  }

  async run(): Promise<void> {
    this.board.setAgentState(this.id, 'working', 'starting');
    if (this.opts.initialHistory && this.opts.initialHistory.length > 0) {
      // Resume a previous conversation (/restore): re-record everything into
      // the new conversation file, then tell the agent the world may have moved.
      this.history = [];
      for (const m of this.opts.initialHistory) this.record(m);
      this.record({
        role: 'user',
        content:
          '[SESSION RESTORED] This conversation was saved and has just been restored. Time has passed: files may have changed on disk. Re-read the files you rely on before editing them, then continue your task from where you left off.',
      });
    } else {
      this.record({
        role: 'system',
        content: SYSTEM_PROMPT(
          this.name,
          this.opts.task,
          this.opts.mode,
          LANG_NAME_EN[getLang()],
          skillsCatalog(this.opts.skills),
          this.opts.specialist,
          this.opts.projectMemory,
        ),
      });
      // Pasted images (multimodal models): attached to the very first user turn.
      if (this.opts.images && this.opts.images.length > 0) {
        this.record({
          role: 'user',
          content: [
            { type: 'text', text: 'The user attached the following image(s) to the task. Use them as visual context.' },
            ...this.opts.images.map((url) => ({ type: 'image_url' as const, image_url: { url } })),
          ],
        });
      }
    }

    await this.loop();
  }

  /**
   * The agent's action loop. Extracted from run() so a user follow-up can
   * REOPEN a finished conversation (fresh step budget, same history).
   */
  private async loop(): Promise<void> {
    let steps = 0;
    try {
      this.finished = false;
      while (!this.stopped && steps < this.maxSteps) {
        await this.waitWhilePaused();
        if (this.stopped) break;
        steps++;
        this.board.updateAgent(this.id, { steps });

        // User steering messages first — they take priority over everything.
        for (const m of this.steerQueue.splice(0)) {
          this.record({
            role: 'user',
            content: `[USER MESSAGE — priority] ${m}\nTake this into account NOW and adapt your plan. The user's word overrides your previous plan.`,
          });
        }

        // Fresh, real-time view of the other agents before EVERY model call.
        const live = this.liveContext();
        if (live.hasNews) {
          // Visible (and audible via state event) cue: the agent is listening to the others.
          this.board.setAgentState(this.id, 'listening', 'reading the other agents’ work…');
          await new Promise((r) => setTimeout(r, 600));
          if (this.stopped) break;
        }
        const messages: ChatCompletionMessageParam[] = [
          ...this.history,
          { role: 'user', content: live.text },
        ];

        this.board.setAgentState(this.id, 'thinking');
        // Per-call abort controller: instruct()/nudge() abort the in-flight
        // call so steering and fresh notes are handled IMMEDIATELY.
        this.llmAbort = new AbortController();
        const onStop = () => this.llmAbort?.abort();
        this.abort.signal.addEventListener('abort', onStop, { once: true });
        let res;
        try {
          res = await this.llm.chat(messages, TOOL_DEFINITIONS, this.llmAbort.signal);
        } catch (err) {
          if (!this.stopped && this.steered) {
            // Interrupted on purpose (steering/nudge): not an error — retry the
            // turn right away, with the new message/notes injected.
            this.steered = false;
            steps--;
            this.board.updateAgent(this.id, { steps });
            continue;
          }
          throw err;
        } finally {
          this.abort.signal.removeEventListener('abort', onStop);
          this.llmAbort = null;
        }
        this.steered = false;
        const a = this.board.agents.get(this.id);
        if (a) {
          // Real-time financial view: accrue the cost of this round immediately.
          const price = this.opts.price;
          this.board.updateAgent(this.id, {
            tokensIn: a.tokensIn + res.tokensIn,
            tokensOut: a.tokensOut + res.tokensOut,
            cost: price && a.cost !== null ? a.cost + costOf(price, res.tokensIn, res.tokensOut) : a.cost,
            // res.tokensIn = prompt tokens of THIS round = the whole conversation
            // sent to the model → direct estimate of context-window usage.
            ctxPct: Math.min(100, Math.round((res.tokensIn / CONTEXT_WINDOW) * 100)),
          });
        }

        const msg = res.message;
        // Persist this round into history (live context is NOT kept — rebuilt fresh each turn).
        this.record({ role: 'user', content: '[real-time state consulted]' });
        this.record(msg as ChatCompletionMessageParam);

        if (msg.content && msg.content.trim()) {
          // "✻" marks thinking/commentary steps — visually distinct from tool lines.
          this.board.log(this.id, 'llm', `✻ ${msg.content.trim().slice(0, 500)}`);
        }

        const toolCalls = msg.tool_calls ?? [];
        if (toolCalls.length === 0) {
          this.record({
            role: 'user',
            content:
              'No tool was called. If your task is finished and verified, call task_complete. Otherwise, continue with tool calls.',
          });
          continue;
        }

        this.board.setAgentState(this.id, 'working');
        let completed = false;
        for (const tc of toolCalls) {
          if (this.stopped) break;
          if (tc.type !== 'function') continue;
          let args: any = {};
          try {
            args = tc.function.arguments ? JSON.parse(tc.function.arguments) : {};
          } catch {
            this.record({
              role: 'tool',
              tool_call_id: tc.id,
              content: 'ERROR: invalid JSON arguments.',
            });
            continue;
          }
          const label = this.describeCall(tc.function.name, args);
          // run_command logs itself with its output; post_note is already
          // rendered as the note itself — logging "✉ note → user" next to the
          // actual note text was just visual noise.
          if (tc.function.name !== 'run_command' && tc.function.name !== 'post_note') {
            this.board.log(this.id, 'tool', label);
          }
          this.board.updateAgent(this.id, { currentAction: label.slice(0, 80) });

          const result = await this.executor.execute(tc.function.name, args);

          if (result === '__TASK_COMPLETE__') {
            completed = true;
            const summary = String(args.summary ?? 'Task complete.');
            this.board.updateAgent(this.id, { lastResult: summary });
            // ONE short headline note (the full summary lives in lastResult and
            // is rendered as the agent's recap) — no duplicated walls of text.
            const headline = summary.split('\n').find((l) => l.trim())?.trim() ?? 'Task complete.';
            this.board.addNote(this.name, 'all', `✅ ${headline.slice(0, 160)}`);
            this.record({ role: 'tool', tool_call_id: tc.id, content: 'OK, task closed.' });
            break;
          }
          this.record({ role: 'tool', tool_call_id: tc.id, content: result });
        }

        if (completed) {
          this.board.setAgentState(this.id, 'done', 'done ✅');
          return;
        }
        await this.compactHistory();
      }

      if (!this.stopped) {
        this.board.setAgentState(this.id, 'error', `step limit of ${this.maxSteps} reached`);
        this.board.addNote(this.name, 'all', `⚠ I reached my step limit without finishing.`);
      }
    } catch (err: any) {
      if (this.stopped) return;
      this.board.setAgentState(this.id, 'error', (err?.message ?? String(err)).slice(0, 80));
      this.board.log(this.id, 'error', `Fatal error: ${err?.message ?? String(err)}`);
    } finally {
      // The loop has exited (done / error / stopped / step limit): a future
      // instruct() must REVIVE the agent instead of just queueing the message.
      this.finished = true;
    }
  }

  private describeCall(name: string, args: any): string {
    switch (name) {
      case 'read_file':
        return `📖 read ${args.path}`;
      case 'write_file':
        return `✏ write ${args.path}`;
      case 'edit_file':
        return `✏ edit ${args.path}`;
      case 'list_files':
        return `📁 ls ${args.path ?? '.'}`;
      case 'search':
        return `🔍 search /${args.pattern}/`;
      case 'run_command':
        return `$ ${args.command}`;
      case 'post_note':
        return `✉ note → ${args.to}`;
      case 'update_status':
        return `📢 ${args.status}`;
      case 'ask_user':
        return `❓ ${String(args.question ?? '').slice(0, 60)}`;
      case 'load_skill':
        return `🧩 skill ${args.name}`;
      case 'claim_files':
        return `🚩 claim ${Array.isArray(args.paths) ? args.paths.join(' ') : ''}`;
      case 'wait_for_agent':
        return `⏳ wait ${args.name ?? ''}`;
      case 'remember':
        return `🧠 remember`;
      case 'task_complete':
        return '✅ task_complete';
      default:
        return name;
    }
  }

  // ---------- history compaction (LLM summary instead of blind truncation) ----------

  private compacting = false;

  /**
   * When the conversation grows too long, replace the oldest rounds with a
   * REAL summary produced by the model (files touched, commands run,
   * decisions, current state) — the agent keeps its memory instead of
   * forgetting its own past. Falls back to plain truncation on failure.
   */
  private async compactHistory(): Promise<void> {
    const MAX_MSGS = 80;
    const KEEP_RECENT = 40;
    if (this.history.length <= MAX_MSGS || this.compacting) return;
    this.compacting = true;
    try {
      // Remove whole rounds from index 1 (system prompt stays at 0) until
      // only ~KEEP_RECENT recent messages remain after it.
      const removed: ChatCompletionMessageParam[] = [];
      while (this.history.length > KEEP_RECENT + 1) {
        const m = this.history[1] as any;
        if (m.role === 'assistant' && m.tool_calls) {
          let j = 2;
          while (j < this.history.length && (this.history[j] as any).role === 'tool') j++;
          removed.push(...(this.history.splice(1, j - 1) as ChatCompletionMessageParam[]));
        } else {
          removed.push(this.history.splice(1, 1)[0]);
        }
      }
      if (removed.length === 0) return;

      // Compact transcript of what is being dropped (bounded).
      const lines: string[] = [];
      let total = 0;
      for (const m of removed as any[]) {
        let line = '';
        if (m.role === 'assistant') {
          const calls = (m.tool_calls ?? [])
            .map((tc: any) => `${tc.function?.name}(${String(tc.function?.arguments ?? '').slice(0, 120)})`)
            .join('; ');
          line = `ASSISTANT: ${String(m.content ?? '').slice(0, 300)}${calls ? ` [tools: ${calls}]` : ''}`;
        } else if (m.role === 'tool') {
          line = `TOOL RESULT: ${String(m.content ?? '').slice(0, 300)}`;
        } else {
          line = `${String(m.role).toUpperCase()}: ${String(m.content ?? '').slice(0, 300)}`;
        }
        if (total + line.length > 12000) break;
        lines.push(line);
        total += line.length;
      }

      this.board.log(this.id, 'system', '🗜 compacting history (LLM summary)…');
      const res = await this.llm.chat(
        [
          {
            role: 'system',
            content:
              'You compress an agent conversation. Produce a factual summary in AT MOST 15 bullet points covering: files read/modified (paths), commands run and their results, key decisions made, and the current state of the work. No fluff. English.',
          },
          { role: 'user', content: lines.join('\n') },
        ],
        undefined,
        this.abort.signal,
      );
      const a = this.board.agents.get(this.id);
      if (a) {
        const price = this.opts.price;
        this.board.updateAgent(this.id, {
          tokensIn: a.tokensIn + res.tokensIn,
          tokensOut: a.tokensOut + res.tokensOut,
          cost: price && a.cost !== null ? a.cost + costOf(price, res.tokensIn, res.tokensOut) : a.cost,
        });
      }
      const content = String(res.message.content ?? '').trim();
      this.history.splice(1, 0, {
        role: 'user',
        content: `[MEMORY — compacted summary of your earlier work in this task]\n${content || '(summary unavailable)'}`,
      });
    } catch {
      // Fallback: plain truncation note (the rounds are already dropped).
      this.history.splice(1, 0, {
        role: 'user',
        content:
          '(Note: the beginning of the conversation was truncated to save context. Your task is unchanged — re-read files if needed.)',
      });
    } finally {
      this.compacting = false;
    }
  }
}
