import fs from 'node:fs';
import path from 'node:path';
import { exec } from 'node:child_process';
import * as Diff from 'diff';
import type { ChatCompletionTool } from 'openai/resources/chat/completions';
import { Blackboard } from '../coordination/blackboard.js';
import type { AgentMode, AgentProgressStep, ExecutionProfile, Skill } from '../types.js';
import { appendFilePrivate, ensurePrivateDir, sanitizeTerminalText, writeFileAtomicPrivate } from '../security.js';

const IGNORED = new Set(['node_modules', '.git', '.parallel', '.cursor', 'dist', '__pycache__', '.venv', 'venv']);
const MAX_OUTPUT = 12_000;
const MUTATING_TOOLS = new Set(['write_file', 'edit_file', 'claim_files', 'remember']);

function isMutatingShell(command: string): boolean {
  const c = command.toLowerCase();
  if (/\b(rm|mv|cp|chmod|chown|mkdir|touch|truncate)\b/.test(c)) return true;
  if (/\b(git\s+(add|commit|push|pull|merge|rebase|checkout|switch|reset|clean|stash|tag))\b/.test(c)) return true;
  if (/\b(npm|pnpm|yarn)\s+(install|add|remove|update|audit\s+fix)\b/.test(c)) return true;
  if (/[>|]\s*(sh|bash)\b/.test(c) || /\b(curl|wget)\b.*\|\s*(sh|bash)/.test(c)) return true;
  if (/\b(curl|wget)\b.*(&&|;)\s*(sh|bash|zsh|python|node)\b/.test(c)) return true;
  if (/\b(nc|ncat|netcat|socat|telnet|ssh|scp|rsync)\b/.test(c)) return true;
  if (/\b(bash|sh|zsh)\s+-c\b|\b(python|python3|node|perl|ruby)\s+(-c|-e)\b/.test(c)) return true;
  return false;
}

export const TOOL_DEFINITIONS: ChatCompletionTool[] = [
  {
    type: 'function',
    function: {
      name: 'list_files',
      description:
        'List project files (recursive, ignores node_modules/.git/dist). Use only when shared project context does not already identify the relevant area.',
      parameters: {
        type: 'object',
        properties: {
          path: { type: 'string', description: 'Relative subfolder (default: project root)' },
        },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'read_file',
      description:
        'Read the current content of a file (with line numbers). Always re-read a file another agent just modified before relying on it.',
      parameters: {
        type: 'object',
        properties: {
          path: { type: 'string', description: 'Relative file path' },
          startLine: { type: 'integer', description: 'Optional first line, 1-based' },
          endLine: { type: 'integer', description: 'Optional last line, inclusive' },
        },
        required: ['path'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'read_many',
      description:
        'Read several known files in one tool call. Use this instead of many sequential read_file calls when the files are independent. Max 8 files.',
      parameters: {
        type: 'object',
        properties: {
          paths: {
            type: 'array',
            items: { type: 'string' },
            description: 'Relative file paths to read',
          },
        },
        required: ['paths'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'read_artifact',
      description: 'Read a targeted line range from a long tool output previously stored as an artifact.',
      parameters: {
        type: 'object',
        properties: {
          id: { type: 'string', description: 'Artifact id returned by a previous tool result' },
          startLine: { type: 'integer', description: 'First line, 1-based' },
          lineCount: { type: 'integer', description: 'Number of lines, max 200' },
        },
        required: ['id'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'write_file',
      description:
        'Create or fully replace a file. NO locks: you may write to files other agents are working on. BUT if the file changed since your last read, the tool shows you the other agent’s diff and asks you to re-read so you INTEGRATE their changes (never erase them). Prefer edit_file for targeted changes.',
      parameters: {
        type: 'object',
        properties: {
          path: { type: 'string', description: 'Relative file path' },
          content: { type: 'string', description: 'Full file content' },
        },
        required: ['path', 'content'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'edit_file',
      description:
        'Modify a file by replacing exactly old_string with new_string (old_string must be unique). Ideal tool for parallel co-editing: your targeted edits coexist with other agents’ edits in the same file.',
      parameters: {
        type: 'object',
        properties: {
          path: { type: 'string' },
          old_string: { type: 'string', description: 'Exact text to replace (unique in the file)' },
          new_string: { type: 'string', description: 'New text' },
        },
        required: ['path', 'old_string', 'new_string'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'search',
      description: 'Search a pattern (regex) across project files. Returns file:line.',
      parameters: {
        type: 'object',
        properties: {
          pattern: { type: 'string', description: 'Regular expression to search' },
          path: { type: 'string', description: 'Subfolder to search in (default: root)' },
        },
        required: ['pattern'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'inspect_project',
      description:
        'Batch targeted read-only inspection: list files under task-relevant paths and/or run several regex searches in one call. Prefer this over generic repository exploration or cascades of grep/head/tail/wc/awk.',
      parameters: {
        type: 'object',
        properties: {
          paths: {
            type: 'array',
            items: { type: 'string' },
            description: 'Folders or files to inspect, default ["."], max 5',
          },
          patterns: {
            type: 'array',
            items: { type: 'string' },
            description: 'Regex patterns to search, max 5',
          },
        },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'run_command',
      description:
        'Run a shell command at the project root (tests, build, install...). May require user approval. 120s timeout.',
      parameters: {
        type: 'object',
        properties: {
          command: { type: 'string', description: 'Shell command to run' },
        },
        required: ['command'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'post_note',
      description:
        "Send a note/instruction to another agent ('all' for everyone, an agent name, or 'user'). This is your coordination channel: announce your intentions on a shared file, ask another agent to adapt their approach, flag a problem in their work, align your interfaces.",
      parameters: {
        type: 'object',
        properties: {
          to: { type: 'string', description: "'all', 'user' or an agent name" },
          content: { type: 'string', description: 'Note content (concise and actionable)' },
        },
        required: ['to', 'content'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'update_status',
      description:
        'Update your current action, visible in real time by the other agents. Call it whenever your focus changes (e.g. "refactoring the auth function in src/api.ts").',
      parameters: {
        type: 'object',
        properties: {
          status: { type: 'string', description: 'Short description of your current action' },
        },
        required: ['status'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'update_steps',
      description:
        'Update the visible Cursor-style task checklist. At task start create 3-6 outcome-oriented steps; do not add a generic project-exploration step when shared context already covers it. Keep exactly one active step.',
      parameters: {
        type: 'object',
        properties: {
          steps: {
            type: 'array',
            minItems: 1,
            maxItems: 6,
            items: {
              type: 'object',
              properties: {
                text: { type: 'string' },
                status: { type: 'string', enum: ['pending', 'active', 'done'] },
              },
              required: ['text', 'status'],
            },
          },
        },
        required: ['steps'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'ask_user',
      description:
        'Ask the user a multiple-choice question when you are BLOCKED or need direction (ambiguous requirement, irreversible decision, several valid approaches). Provide 2-4 options and mark the one you recommend: if the user does not answer within 30 seconds, your recommended option is chosen automatically, so always make it a safe default you can act on. Use sparingly — at most 3 questions for the whole task. Never use it for things you can decide or verify yourself.',
      parameters: {
        type: 'object',
        properties: {
          question: { type: 'string', description: 'The question, short and specific' },
          options: {
            type: 'array',
            items: { type: 'string' },
            description: '2 to 4 possible answers, concise',
          },
          recommended: {
            type: 'integer',
            description: 'Index (0-based) of the option you recommend — auto-selected after 30s',
          },
        },
        required: ['question', 'options', 'recommended'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'load_skill',
      description:
        'Load a skill by name: returns its full instructions (conventions, checklists, procedures written by the user). The available skills are listed in your system prompt. Load a skill BEFORE working on anything its description covers.',
      parameters: {
        type: 'object',
        properties: {
          name: { type: 'string', description: 'Skill name, as listed in the catalog' },
        },
        required: ['name'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'claim_files',
      description:
        'Declare the files/areas you are about to work on (e.g. ["src/auth/", "src/api.ts"]). This NEVER locks anything — it is a visible signal so the other agents avoid collisions and coordinate with you. Call it when you start a work area, and again when you move to another one (it replaces your previous claim).',
      parameters: {
        type: 'object',
        properties: {
          paths: {
            type: 'array',
            items: { type: 'string' },
            description: '1 to 5 file paths or folder prefixes you are working on',
          },
        },
        required: ['paths'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'wait_for_agent',
      description:
        'Wait until another agent finishes (state done/error/stopped), then get its result summary. Use ONLY when you genuinely cannot progress without their output (e.g. you consume an interface they are still defining). Max 120s — if they are not done by then, you get their current status and must continue with another part of your task. Prefer making progress over waiting.',
      parameters: {
        type: 'object',
        properties: {
          name: { type: 'string', description: 'Name of the agent to wait for (e.g. "Agent-A")' },
          timeout_s: { type: 'integer', description: 'Max seconds to wait (default 60, max 120)' },
        },
        required: ['name'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'remember',
      description:
        'Append a durable fact to the shared project memory (.parallel/memory.md), injected into every future agent\'s system prompt. Use for non-obvious, lasting knowledge: conventions ("tests must run with --pool=forks"), decisions ("auth uses JWT in cookies, not headers"), pitfalls ("never edit dist/, it is generated"). NOT for task progress or temporary state.',
      parameters: {
        type: 'object',
        properties: {
          fact: { type: 'string', description: 'One concise, self-contained fact (1-2 sentences)' },
        },
        required: ['fact'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'task_complete',
      description:
        'Call when your task is finished and verified. The summary is user-facing: write it for humans, explain the logic of your conclusion, include technical details only after the outcome is clear, and follow the section structure requested by your current agent mode.',
      parameters: {
        type: 'object',
        properties: {
          summary: { type: 'string', description: 'Summary of what was accomplished' },
        },
        required: ['summary'],
      },
    },
  },
];

export type ApprovalCallback = (agentId: string, command: string) => Promise<boolean>;
export type QuestionCallback = (
  agentId: string,
  question: string,
  options: string[],
  recommended: number,
) => Promise<{ answer: string; auto: boolean }>;

interface FileReadBaseline {
  content: string;
  revision: number;
}

export class ToolExecutor {
  /** Last content this agent has seen for each file — basis of adaptive merging. */
  private lastRead = new Map<string, FileReadBaseline>();
  /** Questions already asked — capped at 3 per task. */
  private questionsAsked = 0;
  private planApproved = false;

  constructor(
    private board: Blackboard,
    private agentId: string,
    private agentName: string,
    private projectRoot: string,
    private requestApproval: ApprovalCallback,
    private requestQuestion: QuestionCallback,
    private skills: Skill[],
    private mode: AgentMode = 'task',
    private onInspect?: (agentId: string, relPath: string, content: string) => void,
    private profile: ExecutionProfile = 'standard',
    private maxOutput = MAX_OUTPUT,
  ) {}

  private resolve(rel: string): string {
    const root = path.resolve(this.projectRoot);
    const abs = path.resolve(root, rel);
    const relative = path.relative(root, abs);
    if (relative.startsWith('..') || path.isAbsolute(relative)) {
      throw new Error(`Path outside the project refused: ${rel}`);
    }
    return abs;
  }

  private relOf(p: string): string {
    return path.relative(this.projectRoot, this.resolve(p)) || '.';
  }

  private rememberRead(relPath: string, content: string): void {
    this.lastRead.set(relPath, { content, revision: this.board.fileRevision(relPath) });
    this.onInspect?.(this.agentId, relPath, content);
  }

  private adaptationMessage(relPath: string, seen: FileReadBaseline, current: string, verb = 'was modified'): string {
    this.board.recordConflict(relPath);
    const who = this.board.fileActivity.get(relPath);
    const author = who && who.agentId !== this.agentId ? who.agentName : 'another agent or a shell command';
    const patch = Diff.createPatch(relPath, seen.content, current, `your read version r${seen.revision}`, `current version r${this.board.fileRevision(relPath)}`, {
      context: 2,
    });
    const excerpt = patch.split('\n').slice(4, 40).join('\n');
    return (
      `REAL-TIME ADAPTATION: ${relPath} ${verb} by ${author} after your last read. ` +
      `Here are THEIR changes (to KEEP, do not erase them):\n${excerpt}\n` +
      `Call read_file on ${relPath} before editing or rewriting it, then merge your change on top of the current version. ` +
      `If your work conflicts, send them a note.`
    );
  }

  private snapshotProject(): Map<string, string> {
    const snapshot = new Map<string, string>();
    const walk = (dir: string, depth: number) => {
      if (depth > 8) return;
      let entries: fs.Dirent[];
      try {
        entries = fs.readdirSync(dir, { withFileTypes: true });
      } catch {
        return;
      }
      for (const e of entries) {
        if (IGNORED.has(e.name) || e.name.startsWith('.git')) continue;
        const full = path.join(dir, e.name);
        const relPath = path.relative(this.projectRoot, full);
        if (e.isDirectory()) {
          walk(full, depth + 1);
          continue;
        }
        if (!e.isFile()) continue;
        try {
          const stat = fs.statSync(full);
          if (stat.size > 750_000) continue;
          snapshot.set(relPath, fs.readFileSync(full, 'utf8'));
        } catch {
          /* binary/unreadable files are ignored for diff tracking */
        }
      }
    };
    walk(this.projectRoot, 0);
    return snapshot;
  }

  private recordShellMutations(before: Map<string, string>): number {
    const after = this.snapshotProject();
    const paths = new Set([...before.keys(), ...after.keys()]);
    let count = 0;
    for (const relPath of [...paths].sort()) {
      const oldContent = before.get(relPath);
      const newContent = after.get(relPath);
      if (oldContent === newContent) continue;
      const change = this.board.addChange(this.agentId, relPath, oldContent ?? '', newContent ?? '');
      this.board.recordActivity(relPath, this.agentId, 'shell');
      if (count < 5) {
        const op = oldContent === undefined ? 'write' : 'edit';
        this.board.log(this.agentId, 'tool', `✏ ${op} ${relPath} via shell`, { changeId: change.id });
      }
      count++;
    }
    if (count > 0) this.board.log(this.agentId, 'tool', `✏ shell changed ${count} file${count === 1 ? '' : 's'}${count > 5 ? ' (first 5 patches shown live; use /diff for all)' : ''}`);
    return count;
  }

  async execute(name: string, args: any): Promise<string> {
    try {
      const guard = this.guardTool(name, args);
      if (guard) return guard;
      switch (name) {
        case 'list_files':
          return this.listFiles(args?.path ?? '.');
        case 'read_file':
          return this.readFile(args.path, args?.startLine, args?.endLine);
        case 'read_many':
          return this.readMany(args.paths);
        case 'read_artifact':
          return this.readArtifact(args.id, args?.startLine, args?.lineCount);
        case 'write_file':
          return this.writeFile(args.path, args.content);
        case 'edit_file':
          return this.editFile(args.path, args.old_string, args.new_string);
        case 'search':
          return this.search(args.pattern, args?.path ?? '.');
        case 'inspect_project':
          return this.inspectProject(args);
        case 'run_command':
          return await this.runCommand(args.command);
        case 'post_note':
          this.board.addNote(this.agentName, args.to ?? 'all', String(args.content ?? ''));
          return 'Note sent.';
        case 'update_status':
          this.board.updateAgent(this.agentId, { currentAction: String(args.status ?? '') });
          return 'Status updated, visible to the other agents.';
        case 'update_steps':
          return this.updateSteps(args);
        case 'ask_user':
          return await this.askUser(args);
        case 'load_skill':
          return this.loadSkill(String(args.name ?? ''));
        case 'claim_files':
          return this.claimFiles(args);
        case 'wait_for_agent':
          return await this.waitForAgent(args);
        case 'remember':
          return this.remember(String(args.fact ?? ''));
        case 'task_complete':
          // handled by the agent loop; return marker
          return '__TASK_COMPLETE__';
        default:
          return `Unknown tool: ${name}`;
      }
    } catch (err: any) {
      return `ERROR: ${err?.message ?? String(err)}`;
    }
  }

  private guardTool(name: string, args: any): string | null {
    if (this.mode === 'ask') {
      if (MUTATING_TOOLS.has(name) || name === 'run_command') {
        return `DENIED: this agent is in /ask mode. It can inspect and advise, but cannot modify files, run shell commands, claim files, or write memory.`;
      }
    }
    if (this.mode === 'plan' && !this.planApproved) {
      if (MUTATING_TOOLS.has(name)) {
        return `DENIED: this agent is in /plan mode and the plan has not been approved yet. Present the plan with ask_user and wait for "Approve" before modifying project state.`;
      }
      if (name === 'run_command' && isMutatingShell(String(args?.command ?? ''))) {
        return `DENIED: this shell command looks mutating. In /plan mode, run only read-only inspection before approval; ask_user for plan approval first.`;
      }
    }
    return null;
  }

  /**
   * Ask the user a multiple-choice question. NEVER blocks forever: the UI shows
   * a visible 30s countdown and falls back to the recommended option (auto-run).
   */
  private async askUser(args: any): Promise<string> {
    const question = String(args.question ?? '').trim();
    const options = Array.isArray(args.options) ? args.options.map((o: any) => String(o)).slice(0, 4) : [];
    let recommended = Number.isInteger(args.recommended) ? args.recommended : 0;
    if (recommended < 0 || recommended >= options.length) recommended = 0;
    if (!question || options.length < 2) {
      return 'ERROR: ask_user needs a question and 2-4 options. Decide yourself if you can.';
    }
    if (this.questionsAsked >= 3) {
      return `Question limit reached (3 per task). Choose the most reasonable option yourself and continue: I suggest "${options[recommended]}".`;
    }
    this.questionsAsked++;
    this.board.setAgentState(this.agentId, 'waiting', `question: ${question.slice(0, 60)}`);
    this.board.log(this.agentId, 'note', `❓ ${question}`);
    const response = await this.requestQuestion(this.agentId, question, options, recommended);
    const answer = response.answer;
    if (this.mode === 'plan' && !response.auto && answer.trim().toLowerCase().startsWith('approve')) {
      this.planApproved = true;
    }
    this.board.setAgentState(this.agentId, 'working');
    const source = response.auto ? 'The timeout auto-selected' : 'The user answered';
    return `${source}: "${answer}". Act on this choice now (${3 - this.questionsAsked} question(s) left for this task).`;
  }

  /** Declare (advisory) work areas — visible to the user and the other agents. */
  private claimFiles(args: any): string {
    const paths = Array.isArray(args.paths) ? args.paths.map((p: any) => String(p)).slice(0, 5) : [];
    if (paths.length === 0) return 'ERROR: claim_files needs 1-5 paths.';
    this.board.updateAgent(this.agentId, { claims: paths });
    this.board.log(this.agentId, 'tool', `🚩 claims: ${paths.join(', ')}`);
    return `Work area declared: ${paths.join(', ')}. The other agents see it in real time. Remember: this never locks anything — keep adapting to their diffs.`;
  }

  /** Wait (bounded) for another agent to finish, then return its summary. */
  private async waitForAgent(args: any): Promise<string> {
    const target = this.board.getAgentByName(String(args.name ?? ''));
    if (!target) return `ERROR: no agent named "${args.name}".`;
    if (target.id === this.agentId) return 'ERROR: you cannot wait for yourself.';
    const timeoutS = Math.min(Math.max(Number(args.timeout_s) || 60, 5), 120);
    const TERMINAL = ['done', 'error', 'stopped'];
    if (TERMINAL.includes(target.state)) {
      return `${target.name} already finished [${target.state}]. Result: ${target.lastResult ?? '(no summary)'}`;
    }
    this.board.setAgentState(this.agentId, 'waiting', `waiting for ${target.name} (${timeoutS}s max)`);
    const deadline = Date.now() + timeoutS * 1000;
    while (Date.now() < deadline) {
      await new Promise((r) => setTimeout(r, 1000));
      const cur = this.board.agents.get(target.id);
      if (!cur || TERMINAL.includes(cur.state)) {
        this.board.setAgentState(this.agentId, 'working');
        return `${target.name} finished [${cur?.state ?? 'gone'}]. Result: ${cur?.lastResult ?? '(no summary)'}. Re-read any file they touched before relying on it.`;
      }
    }
    this.board.setAgentState(this.agentId, 'working');
    return `${target.name} is still [${target.state}] after ${timeoutS}s (current action: ${target.currentAction || '?'}). Do NOT wait again — progress on another part of your task, or coordinate by note.`;
  }

  /** Append a durable fact to the shared project memory. */
  private remember(fact: string): string {
    const f = fact.trim();
    if (!f) return 'ERROR: remember needs a non-empty fact.';
    const file = path.join(this.projectRoot, '.parallel', 'memory.md');
    ensurePrivateDir(path.dirname(file));
    if (!fs.existsSync(file)) {
      writeFileAtomicPrivate(file, '# Project memory\n\nDurable facts agents recorded. Injected into every agent\'s system prompt.\n\n');
    }
    const line = `- ${f} _(${this.agentName}, ${new Date().toISOString().slice(0, 10)})_\n`;
    appendFilePrivate(file, line);
    this.board.log(this.agentId, 'tool', `🧠 remember: ${f.slice(0, 80)}`);
    return 'Fact saved to the project memory. Every future agent will see it.';
  }

  /** Return the full body of a user-defined skill. */
  private loadSkill(name: string): string {
    const lower = name.trim().toLowerCase();
    const skill = this.skills.find((s) => s.name === lower);
    if (!skill) {
      const list = this.skills.map((s) => s.name).join(', ') || '(none)';
      return `ERROR: unknown skill "${name}". Available skills: ${list}.`;
    }
    this.board.log(this.agentId, 'tool', `🧩 skill loaded: ${skill.name}`);
    return `[SKILL: ${skill.name}] (${skill.scope})\n${skill.body}\n[END SKILL — follow these instructions for the rest of your task]`;
  }

  private updateSteps(args: any): string {
    const raw = Array.isArray(args.steps) ? args.steps : [];
    const steps: AgentProgressStep[] = raw
      .slice(0, 6)
      .map((s: any) => ({
        text: String(s?.text ?? '').replace(/\s+/g, ' ').trim().slice(0, 100),
        status: s?.status === 'done' || s?.status === 'active' ? s.status : 'pending',
      }))
      .filter((s: AgentProgressStep) => s.text.length > 0);
    if (steps.length === 0) return 'ERROR: update_steps needs 1-6 non-empty steps.';
    const activeCount = steps.filter((s) => s.status === 'active').length;
    if (activeCount > 1) return 'ERROR: update_steps must have at most one active step.';
    this.board.updateAgent(this.agentId, { progressSteps: steps });
    this.board.log(this.agentId, 'tool', `☑ steps ${steps.filter((s) => s.status === 'done').length}/${steps.length}`);
    return `Visible steps updated (${steps.length} step${steps.length === 1 ? '' : 's'}).`;
  }

  private listFiles(rel: string): string {
    const root = this.resolve(rel);
    const out: string[] = [];
    const walk = (dir: string, depth: number) => {
      if (depth > 6 || out.length > 500) return;
      let entries: fs.Dirent[];
      try {
        entries = fs.readdirSync(dir, { withFileTypes: true });
      } catch {
        return;
      }
      for (const e of entries) {
        if (IGNORED.has(e.name) || e.name.startsWith('.git')) continue;
        const full = path.join(dir, e.name);
        const relPath = path.relative(this.projectRoot, full);
        if (e.isDirectory()) {
          out.push(relPath + '/');
          walk(full, depth + 1);
        } else {
          let size = 0;
          try {
            size = fs.statSync(full).size;
          } catch {}
          out.push(`${relPath} (${size}B)`);
        }
      }
    };
    walk(root, 0);
    if (out.length === 0) return '(empty folder)';
    return out.join('\n');
  }

  private readFile(rel: string, requestedStart?: number, requestedEnd?: number): string {
    const abs = this.resolve(rel);
    const relPath = this.relOf(rel);
    const content = fs.readFileSync(abs, 'utf8');
    this.rememberRead(relPath, content);
    this.board.resolveConflict(relPath);
    const lines = content.split('\n');
    const start = Math.max(1, Math.floor(Number(requestedStart) || 1));
    const end = Math.min(lines.length, Math.max(start, Math.floor(Number(requestedEnd) || lines.length)));
    const numbered = lines.slice(start - 1, end).map((l, i) => `${String(start + i).padStart(4)}|${l}`).join('\n');
    return numbered.length > this.maxOutput
      ? numbered.slice(0, this.maxOutput) + `\n... (truncated; requested ${start}-${end}, ${lines.length} lines total)`
      : numbered;
  }

  private readMany(paths: any): string {
    const relPaths = Array.isArray(paths) ? paths.map((p: any) => String(p)).slice(0, 8) : [];
    if (relPaths.length === 0) return 'ERROR: read_many needs 1-8 paths.';
    const chunks: string[] = [];
    for (const rel of relPaths) {
      try {
        const abs = this.resolve(rel);
        const relPath = this.relOf(rel);
        const content = fs.readFileSync(abs, 'utf8');
        this.rememberRead(relPath, content);
        this.board.resolveConflict(relPath);
        const lines = content.split('\n');
        const numbered = lines.map((l, i) => `${String(i + 1).padStart(4)}|${l}`).join('\n');
        const perFile = Math.max(1_000, Math.floor(this.maxOutput / relPaths.length));
        const body = numbered.length > perFile
          ? numbered.slice(0, perFile) + `\n... (truncated, ${lines.length} lines total)`
          : numbered;
        chunks.push(`--- ${relPath} (${lines.length} lines) ---\n${body}`);
      } catch (err: any) {
        chunks.push(`--- ${rel} ---\nERROR: ${err?.message ?? String(err)}`);
      }
    }
    return chunks.join('\n\n');
  }

  private readArtifact(id: string, requestedStart?: number, requestedCount?: number): string {
    const safeId = String(id ?? '');
    if (!/^artifact-\d+\.txt$/.test(safeId)) return 'ERROR: invalid artifact id.';
    const file = path.join(this.projectRoot, '.parallel', 'runs', this.agentId, 'artifacts', safeId);
    if (!fs.existsSync(file)) return `ERROR: artifact not found: ${safeId}`;
    const lines = fs.readFileSync(file, 'utf8').split('\n');
    const start = Math.max(1, Math.floor(Number(requestedStart) || 1));
    const count = Math.min(200, Math.max(1, Math.floor(Number(requestedCount) || 80)));
    const end = Math.min(lines.length, start + count - 1);
    return lines.slice(start - 1, end).map((line, index) => `${String(start + index).padStart(4)}|${line}`).join('\n');
  }

  /**
   * Adaptive co-editing: writing is NEVER blocked by another agent.
   * But if the file changed under you since your last read, you first get
   * the other agent's diff so you can integrate it instead of erasing it.
   */
  private writeFile(rel: string, content: string): string {
    const relPath = this.relOf(rel);
    const abs = this.resolve(rel);
    const exists = fs.existsSync(abs);
    const seen = this.lastRead.get(relPath);
    const current = exists ? fs.readFileSync(abs, 'utf8') : '';

    if (exists) {
      if (seen === undefined) {
        const who = this.board.fileActivity.get(relPath);
        return (
          `WARNING: ${relPath} already exists${who && who.agentId !== this.agentId ? ` and agent ${who.agentName} is working on it` : ''}. ` +
          `Read it first (read_file) so you don't erase any work, then rewrite while integrating what exists.`
        );
      }
      if (current !== seen.content || this.board.fileRevision(relPath) !== seen.revision) {
        return this.adaptationMessage(relPath, seen, current);
      }
    }

    fs.mkdirSync(path.dirname(abs), { recursive: true });
    fs.writeFileSync(abs, content);
    const before = exists ? current : '';
    const change = this.board.addChange(this.agentId, relPath, before, content);
    this.rememberRead(relPath, content);
    this.board.resolveConflict(relPath);
    this.board.recordActivity(relPath, this.agentId, 'write');
    this.board.log(this.agentId, 'tool', `✏ write ${relPath} (${content.length}B)`, { changeId: change.id });
    return `File written: ${relPath} (${content.split('\n').length} lines). The other agents see your diff in real time.`;
  }

  private editFile(rel: string, oldStr: string, newStr: string): string {
    const relPath = this.relOf(rel);
    const abs = this.resolve(rel);
    const before = fs.readFileSync(abs, 'utf8');
    const seen = this.lastRead.get(relPath);
    if (seen === undefined) {
      const who = this.board.fileActivity.get(relPath);
      return (
        `WARNING: ${relPath} has not been read by you yet${who && who.agentId !== this.agentId ? ` and agent ${who.agentName} touched it recently` : ''}. ` +
        `Call read_file first so your targeted edit is based on the current version.`
      );
    }
    if (before !== seen.content || this.board.fileRevision(relPath) !== seen.revision) {
      return this.adaptationMessage(relPath, seen, before, 'changed');
    }
    const count = before.split(oldStr).length - 1;
    if (count === 0) {
      const who = this.board.fileActivity.get(relPath);
      const collided = who && who.agentId !== this.agentId;
      if (collided) this.board.recordConflict(relPath);
      const hint = collided
        ? ` The file was modified by ${who.agentName} in the meantime — re-read it (read_file) to see its current version and adapt your edit.`
        : ' Re-read the file (read_file) to check the exact text.';
      return `ERROR: old_string not found in ${relPath}.${hint}`;
    }
    if (count > 1) {
      return `ERROR: old_string appears ${count} times in ${relPath}. Provide a longer, unique excerpt.`;
    }
    const after = before.replace(oldStr, newStr);
    fs.writeFileSync(abs, after);
    const change = this.board.addChange(this.agentId, relPath, before, after);
    this.rememberRead(relPath, after);
    this.board.resolveConflict(relPath);
    this.board.recordActivity(relPath, this.agentId, 'edit');
    this.board.log(this.agentId, 'tool', `✏ edit ${relPath}`, { changeId: change.id });
    return `File modified: ${relPath}. The other agents see your diff in real time.`;
  }

  private search(pattern: string, rel: string): string {
    const root = this.resolve(rel);
    let re: RegExp;
    try {
      re = new RegExp(pattern);
    } catch {
      return `ERROR: invalid regex: ${pattern}`;
    }
    const results: string[] = [];
    const walk = (dir: string, depth: number) => {
      const resultLimit = this.profile === 'quick' ? 40 : this.profile === 'standard' ? 80 : 150;
      if (depth > 6 || results.length >= resultLimit) return;
      let entries: fs.Dirent[];
      try {
        entries = fs.readdirSync(dir, { withFileTypes: true });
      } catch {
        return;
      }
      for (const e of entries) {
        if (IGNORED.has(e.name) || e.name.startsWith('.git')) continue;
        const full = path.join(dir, e.name);
        if (e.isDirectory()) {
          walk(full, depth + 1);
        } else {
          let content: string;
          try {
            const stat = fs.statSync(full);
            if (stat.size > 1_000_000) continue;
            content = fs.readFileSync(full, 'utf8');
          } catch {
            continue;
          }
          const lines = content.split('\n');
          let matched = false;
          for (let i = 0; i < lines.length && results.length < resultLimit; i++) {
            if (re.test(lines[i])) {
              matched = true;
              results.push(`${path.relative(this.projectRoot, full)}:${i + 1}: ${lines[i].trim().slice(0, 160)}`);
            }
          }
          if (matched) this.onInspect?.(this.agentId, path.relative(this.projectRoot, full), content);
        }
      }
    };
    walk(root, 0);
    return results.length > 0 ? results.join('\n') : 'No results.';
  }

  private inspectProject(args: any): string {
    const paths = Array.isArray(args?.paths) && args.paths.length > 0 ? args.paths.map((p: any) => String(p)).slice(0, 5) : ['.'];
    const patterns = Array.isArray(args?.patterns) ? args.patterns.map((p: any) => String(p)).filter(Boolean).slice(0, 5) : [];
    const files: string[] = [];
    const matches: string[] = [];
    const regexes: Array<{ raw: string; re: RegExp }> = [];
    for (const raw of patterns) {
      try {
        regexes.push({ raw, re: new RegExp(raw) });
      } catch {
        matches.push(`INVALID REGEX: ${raw}`);
      }
    }
    const visit = (full: string, depth: number) => {
      if (depth > 5 || files.length > 400 || matches.length > 200) return;
      let stat: fs.Stats;
      try {
        stat = fs.statSync(full);
      } catch {
        return;
      }
      if (stat.isDirectory()) {
        let entries: fs.Dirent[];
        try {
          entries = fs.readdirSync(full, { withFileTypes: true });
        } catch {
          return;
        }
        for (const e of entries) {
          if (IGNORED.has(e.name) || e.name.startsWith('.git')) continue;
          visit(path.join(full, e.name), depth + 1);
        }
        return;
      }
      if (!stat.isFile() || stat.size > 1_000_000) return;
      const relPath = path.relative(this.projectRoot, full);
      files.push(`${relPath} (${stat.size}B)`);
      if (regexes.length === 0) return;
      let content = '';
      try {
        content = fs.readFileSync(full, 'utf8');
      } catch {
        return;
      }
      const lines = content.split('\n');
      let matched = false;
      for (let i = 0; i < lines.length && matches.length <= 200; i++) {
        for (const { raw, re } of regexes) {
          if (re.test(lines[i])) {
            matched = true;
            matches.push(`${raw} :: ${relPath}:${i + 1}: ${lines[i].trim().slice(0, 140)}`);
          }
        }
      }
      if (matched) this.onInspect?.(this.agentId, relPath, content);
    };
    for (const rel of paths) visit(this.resolve(rel), 0);
    const fileBlock = files.length > 0 ? files.slice(0, 80).join('\n') : '(no files)';
    const matchBlock = patterns.length > 0 ? (matches.length > 0 ? matches.slice(0, 120).join('\n') : 'No matches.') : '(no patterns requested)';
    return `FILES (${files.length} found, first ${Math.min(files.length, 80)} shown)\n${fileBlock}\n\nMATCHES\n${matchBlock}`;
  }

  private async runCommand(command: string): Promise<string> {
    this.board.setAgentState(this.agentId, 'waiting', `approval: ${command.slice(0, 60)}`);
    const approved = await this.requestApproval(this.agentId, command);
    if (!approved) {
      this.board.setAgentState(this.agentId, 'working');
      return 'DENIED by the user. Do not retry this command; find another approach or continue without it.';
    }
    this.board.setAgentState(this.agentId, 'working', `$ ${command.slice(0, 60)}`);
    this.board.log(this.agentId, 'tool', `$ ${command}`);
    const before = this.snapshotProject();
    return new Promise((resolve) => {
      exec(
        command,
        { cwd: this.projectRoot, timeout: 120_000, maxBuffer: 4 * 1024 * 1024 },
        (err, stdout, stderr) => {
          let out = '';
          if (stdout) out += sanitizeTerminalText(stdout);
          if (stderr) out += (out ? '\n--- stderr ---\n' : '') + sanitizeTerminalText(stderr);
          if (err && (err as any).killed) out += '\n(process killed: 120s timeout)';
          else if (err) out += `\n(exit code: ${(err as any).code ?? 1})`;
          const result = out || '(no output, success)';
          const changed = this.recordShellMutations(before);
          const logged = result.length > this.maxOutput
            ? `${result.slice(0, this.maxOutput)}\n... (${result.length.toLocaleString()} characters; full output retained as an agent artifact)`
            : result;
          this.board.log(this.agentId, 'tool_result', logged);
          resolve(changed > 0 ? `${result}\n\nTracked shell mutations: ${changed} file${changed === 1 ? '' : 's'}.` : result);
        },
      );
    });
  }
}
