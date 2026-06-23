import fs from 'node:fs';
import path from 'node:path';
import { exec } from 'node:child_process';
import * as Diff from 'diff';
import type { ChatCompletionTool } from 'openai/resources/chat/completions';
import { Blackboard } from '../coordination/blackboard.js';
import type { AgentMode, Skill } from '../types.js';

const IGNORED = new Set(['node_modules', '.git', '.parallel', 'dist', '__pycache__', '.venv', 'venv']);
const MAX_OUTPUT = 12_000;
const MUTATING_TOOLS = new Set(['write_file', 'edit_file', 'claim_files', 'remember']);

function isMutatingShell(command: string): boolean {
  const c = command.toLowerCase();
  if (/\b(rm|mv|cp|chmod|chown|mkdir|touch|truncate)\b/.test(c)) return true;
  if (/\b(git\s+(add|commit|push|pull|merge|rebase|checkout|switch|reset|clean|stash|tag))\b/.test(c)) return true;
  if (/\b(npm|pnpm|yarn)\s+(install|add|remove|update|audit\s+fix)\b/.test(c)) return true;
  if (/[>|]\s*(sh|bash)\b/.test(c) || /\b(curl|wget)\b.*\|\s*(sh|bash)/.test(c)) return true;
  return false;
}

export const TOOL_DEFINITIONS: ChatCompletionTool[] = [
  {
    type: 'function',
    function: {
      name: 'list_files',
      description:
        'List project files (recursive, ignores node_modules/.git/dist). Use it first to understand the structure.',
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
        },
        required: ['path'],
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

export class ToolExecutor {
  /** Last content this agent has seen for each file — basis of adaptive merging. */
  private lastRead = new Map<string, string>();
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

  async execute(name: string, args: any): Promise<string> {
    try {
      const guard = this.guardTool(name, args);
      if (guard) return guard;
      switch (name) {
        case 'list_files':
          return this.listFiles(args?.path ?? '.');
        case 'read_file':
          return this.readFile(args.path);
        case 'write_file':
          return this.writeFile(args.path, args.content);
        case 'edit_file':
          return this.editFile(args.path, args.old_string, args.new_string);
        case 'search':
          return this.search(args.pattern, args?.path ?? '.');
        case 'run_command':
          return await this.runCommand(args.command);
        case 'post_note':
          this.board.addNote(this.agentName, args.to ?? 'all', String(args.content ?? ''));
          return 'Note sent.';
        case 'update_status':
          this.board.updateAgent(this.agentId, { currentAction: String(args.status ?? '') });
          return 'Status updated, visible to the other agents.';
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
    fs.mkdirSync(path.dirname(file), { recursive: true });
    if (!fs.existsSync(file)) {
      fs.writeFileSync(file, '# Project memory\n\nDurable facts agents recorded. Injected into every agent\'s system prompt.\n\n');
    }
    const line = `- ${f} _(${this.agentName}, ${new Date().toISOString().slice(0, 10)})_\n`;
    fs.appendFileSync(file, line);
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

  private readFile(rel: string): string {
    const abs = this.resolve(rel);
    const content = fs.readFileSync(abs, 'utf8');
    this.lastRead.set(this.relOf(rel), content);
    const lines = content.split('\n');
    const numbered = lines.map((l, i) => `${String(i + 1).padStart(4)}|${l}`).join('\n');
    return numbered.length > MAX_OUTPUT
      ? numbered.slice(0, MAX_OUTPUT) + `\n... (truncated, ${lines.length} lines total)`
      : numbered;
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

    if (exists) {
      const current = fs.readFileSync(abs, 'utf8');
      if (seen === undefined) {
        const who = this.board.fileActivity.get(relPath);
        return (
          `WARNING: ${relPath} already exists${who && who.agentId !== this.agentId ? ` and agent ${who.agentName} is working on it` : ''}. ` +
          `Read it first (read_file) so you don't erase any work, then rewrite while integrating what exists.`
        );
      }
      if (current !== seen) {
        this.lastRead.set(relPath, current); // sync view so next write passes
        this.board.recordConflict(relPath); // repeated collisions escalate to the user
        const who = this.board.fileActivity.get(relPath);
        const author = who && who.agentId !== this.agentId ? who.agentName : 'another agent';
        const patch = Diff.createPatch(relPath, seen, current, 'your read version', 'current version', {
          context: 2,
        });
        const excerpt = patch.split('\n').slice(4, 40).join('\n');
        return (
          `REAL-TIME ADAPTATION: ${relPath} was modified by ${author} while you were working. ` +
          `Here are THEIR changes (to KEEP, do not erase them):\n${excerpt}\n` +
          `Your view is now synchronized. Rewrite the file by MERGING your changes with theirs ` +
          `(or use edit_file for targeted changes). If your work conflicts, send them a note.`
        );
      }
    }

    fs.mkdirSync(path.dirname(abs), { recursive: true });
    fs.writeFileSync(abs, content);
    this.lastRead.set(relPath, content);
    const before = exists ? (seen ?? '') : '';
    this.board.addChange(this.agentId, relPath, before, content);
    this.board.recordActivity(relPath, this.agentId, 'write');
    this.board.log(this.agentId, 'tool', `✏ write ${relPath} (${content.length}B)`);
    return `File written: ${relPath} (${content.split('\n').length} lines). The other agents see your diff in real time.`;
  }

  private editFile(rel: string, oldStr: string, newStr: string): string {
    const relPath = this.relOf(rel);
    const abs = this.resolve(rel);
    const before = fs.readFileSync(abs, 'utf8');
    const count = before.split(oldStr).length - 1;
    if (count === 0) {
      const seen = this.lastRead.get(relPath);
      const who = this.board.fileActivity.get(relPath);
      const collided = seen !== undefined && seen !== before && who && who.agentId !== this.agentId;
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
    this.lastRead.set(relPath, after);
    this.board.addChange(this.agentId, relPath, before, after);
    this.board.recordActivity(relPath, this.agentId, 'edit');
    this.board.log(this.agentId, 'tool', `✏ edit ${relPath}`);
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
      if (depth > 6 || results.length > 100) return;
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
          for (let i = 0; i < lines.length && results.length <= 100; i++) {
            if (re.test(lines[i])) {
              results.push(`${path.relative(this.projectRoot, full)}:${i + 1}: ${lines[i].trim().slice(0, 160)}`);
            }
          }
        }
      }
    };
    walk(root, 0);
    return results.length > 0 ? results.join('\n') : 'No results.';
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
    return new Promise((resolve) => {
      exec(
        command,
        { cwd: this.projectRoot, timeout: 120_000, maxBuffer: 4 * 1024 * 1024 },
        (err, stdout, stderr) => {
          let out = '';
          if (stdout) out += stdout;
          if (stderr) out += (out ? '\n--- stderr ---\n' : '') + stderr;
          if (err && (err as any).killed) out += '\n(process killed: 120s timeout)';
          else if (err) out += `\n(exit code: ${(err as any).code ?? 1})`;
          if (out.length > MAX_OUTPUT) out = out.slice(0, MAX_OUTPUT) + '\n... (output truncated)';
          const result = out || '(no output, success)';
          this.board.log(this.agentId, 'tool_result', result);
          resolve(result);
        },
      );
    });
  }
}
