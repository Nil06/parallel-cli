import type { AgentInfo, LogEntry } from '../types.js';
import { oneLine } from './tokens.js';
import { t } from '../i18n.js';

export type UIEventKind =
  | 'thought'
  | 'tool'
  | 'file'
  | 'command'
  | 'command_output'
  | 'approval'
  | 'question'
  | 'result'
  | 'error'
  | 'intent'
  | 'note'
  | 'system';

export interface UIEvent {
  agentId: string;
  kind: UIEventKind;
  label: string;
  detail: string;
  ts: number;
  seq?: number;
}

export type TimelineKind = 'section' | 'narration' | 'command' | 'files' | 'event' | 'thought';
export type TimelineCategory = 'inspect' | 'change' | 'validate' | 'publish' | 'coordinate' | 'result' | 'other';

export interface TimelineItem {
  kind: TimelineKind;
  category: TimelineCategory;
  label: string;
  detail?: string;
  command?: string;
  output?: string[];
  hiddenLines?: number;
  files?: string[];
  status?: 'ok' | 'error';
  ts: number;
  seq?: number;
}

export interface TimelineOptions {
  raw?: boolean;
  outputLines?: number;
}

function cleanToolText(text: string): string {
  return oneLine(text)
    .replace(/^[📖📁🔍🔎📚✏🚩🧠🧩📢☑⏳❓✉✅↳]+\s*/u, '')
    .trim();
}

function stripShellNoise(command: string): string {
  return command
    .replace(/\s+2>&1\b/g, '')
    .replace(/\s+\|\s*cat\b/g, '')
    .trim();
}

function classify(log: LogEntry): UIEvent {
  const text = oneLine(log.text);
  const cleaned = cleanToolText(log.text);
  const lower = cleaned.toLowerCase();
  if (log.kind === 'error') return { agentId: log.agentId, kind: 'error', label: 'error', detail: text, ts: log.ts, seq: log.seq };
  if (log.kind === 'tool_result') {
    return { agentId: log.agentId, kind: 'command_output', label: 'output', detail: log.text.trim(), ts: log.ts, seq: log.seq };
  }
  if (log.kind === 'tool' && /^\s*📢/u.test(log.text)) {
    return { agentId: log.agentId, kind: 'intent', label: 'next', detail: cleaned || text, ts: log.ts, seq: log.seq };
  }
  if (log.kind === 'tool' && /^\s*☑/u.test(log.text)) {
    return { agentId: log.agentId, kind: 'note', label: 'steps', detail: cleaned || text, ts: log.ts, seq: log.seq };
  }
  if (log.kind === 'note') return { agentId: log.agentId, kind: 'note', label: 'note', detail: cleaned || text, ts: log.ts, seq: log.seq };
  if (log.kind === 'system') return { agentId: log.agentId, kind: 'system', label: 'system', detail: cleaned || text, ts: log.ts, seq: log.seq };
  if (log.kind === 'llm') return { agentId: log.agentId, kind: 'thought', label: 'thinking', detail: cleaned.replace(/^✻\s*/, ''), ts: log.ts, seq: log.seq };
  if (/^\$\s*/.test(cleaned)) {
    return {
      agentId: log.agentId,
      kind: 'command',
      label: 'run',
      detail: stripShellNoise(cleaned.replace(/^\$\s*/, '')),
      ts: log.ts,
      seq: log.seq,
    };
  }
  if (/^(read|opened)\s+/i.test(cleaned)) {
    return { agentId: log.agentId, kind: 'file', label: 'read', detail: cleaned.replace(/^(read|opened)\s+/i, ''), ts: log.ts, seq: log.seq };
  }
  if (/^(ls|list)\s+/i.test(cleaned)) {
    return { agentId: log.agentId, kind: 'file', label: 'list', detail: cleaned.replace(/^(ls|list)\s+/i, ''), ts: log.ts, seq: log.seq };
  }
  if (/^(search)\s+/i.test(cleaned)) {
    return { agentId: log.agentId, kind: 'file', label: 'search', detail: cleaned.replace(/^search\s+/i, ''), ts: log.ts, seq: log.seq };
  }
  if (/^inspect project/i.test(cleaned)) {
    return { agentId: log.agentId, kind: 'file', label: 'search', detail: 'project', ts: log.ts, seq: log.seq };
  }
  if (/^(claim|claims?):?\s+/i.test(cleaned)) {
    return { agentId: log.agentId, kind: 'note', label: 'claim', detail: cleaned.replace(/^(claim|claims?):?\s*/i, ''), ts: log.ts, seq: log.seq };
  }
  if (/^(write|edit|patch)\s+/i.test(cleaned)) {
    const label = lower.startsWith('write') ? 'write' : 'edit';
    return { agentId: log.agentId, kind: 'file', label, detail: cleaned.replace(/^(write|edit|patch|claim|claims?)\s*/i, ''), ts: log.ts, seq: log.seq };
  }
  if (/^(run|exec|shell|npm|pnpm|yarn|git|node|npx)\b/i.test(cleaned)) {
    return { agentId: log.agentId, kind: 'command', label: 'run', detail: stripShellNoise(cleaned), ts: log.ts, seq: log.seq };
  }
  if (lower.includes('approval') || lower.includes('approve')) {
    return { agentId: log.agentId, kind: 'approval', label: 'approval', detail: cleaned || text, ts: log.ts, seq: log.seq };
  }
  if (lower.includes('ask') || lower.includes('question')) {
    return { agentId: log.agentId, kind: 'question', label: 'question', detail: cleaned || text, ts: log.ts, seq: log.seq };
  }
  return { agentId: log.agentId, kind: log.kind === 'tool' ? 'tool' : 'system', label: log.kind === 'tool' ? 'tool' : 'info', detail: cleaned || text, ts: log.ts, seq: log.seq };
}

export function toUIEvents(logs: LogEntry[]): UIEvent[] {
  return logs.map(classify);
}

export function compactEvents(events: UIEvent[]): UIEvent[] {
  const out: UIEvent[] = [];
  for (let i = 0; i < events.length; i++) {
    const e = events[i];
    if (e.kind !== 'file' || e.label !== 'read') {
      out.push(e);
      continue;
    }
    const reads = [e];
    while (i + 1 < events.length && events[i + 1].kind === 'file' && events[i + 1].label === 'read') {
      reads.push(events[++i]);
    }
    if (reads.length < 3) {
      out.push(...reads);
      continue;
    }
    const files = reads.flatMap((r) => r.detail.split(/\s+/).filter(Boolean));
    out.push({
      ...e,
      detail: `${files.slice(0, 5).join(', ')}${files.length > 5 ? ` +${files.length - 5}` : ''}`,
      label: `read ${files.length}`,
      ts: reads[reads.length - 1].ts,
      seq: reads[reads.length - 1].seq,
    });
  }
  return out;
}

function commandCategory(command: string): TimelineCategory {
  if (/\b(test|build|tsc|lint|check|node\s+--test)\b/i.test(command)) return 'validate';
  if (/\bgit\s+(add|commit|push|pull|fetch|merge|switch|checkout|branch)\b/i.test(command)) return 'publish';
  if (/\bgit\s+(status|log|show|diff)\b/i.test(command)) return 'inspect';
  if (/\b(find|pwd|ls|cat|sed|rg|grep|head|tail)\b/i.test(command)) return 'inspect';
  return 'validate';
}

function categoryFor(e: UIEvent): TimelineCategory {
  if (e.kind === 'error') return 'result';
  if (e.kind === 'note' || e.kind === 'approval' || e.kind === 'question') return 'coordinate';
  if (e.kind === 'intent') return 'other';
  if (e.kind === 'file') {
    if (e.label === 'write' || e.label === 'edit' || e.label === 'claim') return 'change';
    return 'inspect';
  }
  if (e.kind === 'command') {
    return commandCategory(e.detail);
  }
  return 'other';
}

function filesFrom(events: UIEvent[]): string[] {
  return events.flatMap((e) => e.detail.split(/[,\s]+/).filter(Boolean));
}

export function summarizeCommandOutput(output: string, command = '', maxLines = 6): { lines: string[]; hiddenLines: number; status: 'ok' | 'error' } {
  const rawLines = output
    .replace(/\r/g, '')
    .split('\n')
    .map((l) => l.trimEnd())
    .filter((l) => l.trim().length > 0);
  const status = /\b(error|failed|fatal|exit code: [1-9]|not found|denied)\b/i.test(output) ? 'error' : 'ok';
  if (/npm\s+test|node\s+--test|test:pty|tsc|npm\s+run\s+build/i.test(command) && status === 'ok') {
    const passed = rawLines.find((l) => /passed|pass|ok\b/i.test(l));
    return { lines: [passed ? `Passed: ${passed.replace(/^#\s*/, '')}` : 'Passed'], hiddenLines: Math.max(0, rawLines.length - 1), status };
  }
  if (rawLines.length <= maxLines) return { lines: rawLines.length > 0 ? rawLines : ['(no output, success)'], hiddenLines: 0, status };
  const head = Math.max(1, Math.floor(maxLines / 2));
  const tail = Math.max(1, maxLines - head);
  return {
    lines: [...rawLines.slice(0, head), ...rawLines.slice(rawLines.length - tail)],
    hiddenLines: rawLines.length - maxLines,
    status,
  };
}

function narrationFor(category: TimelineCategory, previous?: TimelineCategory): string {
  if (category === 'inspect' && previous === 'validate') return t('timeline.narration.inspectAfterValidate');
  return t(`timeline.narration.${category}`);
}

function pushSection(out: TimelineItem[], category: TimelineCategory, ts: number, seq?: number): void {
  const prev = [...out].reverse().find((i) => i.kind !== 'section');
  if (category === 'other') return;
  if (!prev) {
    out.push({ kind: 'narration', category, label: 'narration', detail: narrationFor(category), ts, seq });
    return;
  }
  if (prev.category === category) return;
  out.push({ kind: 'section', category, label: category, ts, seq });
  out.push({ kind: 'narration', category, label: 'narration', detail: narrationFor(category, prev.category), ts, seq });
}

export function presentTimeline(logs: LogEntry[], options: TimelineOptions = {}): TimelineItem[] {
  const events = options.raw ? toUIEvents(logs) : toUIEvents(logs).filter((e) => e.kind !== 'thought');
  const out: TimelineItem[] = [];
  for (let i = 0; i < events.length; i++) {
    const e = events[i];
    const category = categoryFor(e);
    pushSection(out, category, e.ts, e.seq);
    if (options.raw && e.kind === 'thought') {
      out.push({ kind: 'thought', category, label: e.label, detail: e.detail, ts: e.ts, seq: e.seq });
      continue;
    }
    if (e.kind === 'file') {
      const group = [e];
      while (i + 1 < events.length && events[i + 1].kind === 'file' && events[i + 1].label === e.label) {
        group.push(events[++i]);
      }
      const files = filesFrom(group);
      out.push({ kind: 'files', category, label: e.label, files, ts: group[group.length - 1].ts, seq: group[group.length - 1].seq });
      continue;
    }
    if (e.kind === 'command') {
      let output: ReturnType<typeof summarizeCommandOutput> | undefined;
      if (i + 1 < events.length && events[i + 1].kind === 'command_output') {
        output = summarizeCommandOutput(events[++i].detail, e.detail, options.outputLines ?? 6);
      }
      out.push({
        kind: 'command',
        category,
        label: 'run',
        command: e.detail,
        output: output?.lines,
        hiddenLines: output?.hiddenLines,
        status: output?.status,
        ts: e.ts,
        seq: e.seq,
      });
      continue;
    }
    if (e.kind === 'command_output' && options.raw) {
      const output = summarizeCommandOutput(e.detail, '', options.outputLines ?? 8);
      out.push({ kind: 'event', category, label: 'output', output: output.lines, hiddenLines: output.hiddenLines, status: output.status, ts: e.ts, seq: e.seq });
      continue;
    }
    out.push({ kind: 'event', category, label: e.label, detail: e.detail, status: e.kind === 'error' ? 'error' : 'ok', ts: e.ts, seq: e.seq });
  }
  return out;
}

export function latestSignal(agent: AgentInfo, events: UIEvent[] | TimelineItem[]): string {
  if (agent.currentAction) return agent.currentAction;
  const last = ([...events].reverse() as Array<UIEvent | TimelineItem>).find((e) => {
    const item = e as UIEvent & TimelineItem;
    return item.kind !== 'thought' && Boolean(item.detail || item.command || item.files?.length);
  }) as (UIEvent & TimelineItem) | undefined;
  if (last) return last.command ? `run ${last.command}` : last.files?.length ? `${last.label} ${last.files[0]}` : `${last.label} ${last.detail}`;
  return agent.lastResult ? 'result ready' : agent.task;
}
