import type { AgentInfo, LogEntry } from '../types.js';
import { oneLine } from './tokens.js';

export type UIEventKind =
  | 'thought'
  | 'tool'
  | 'file'
  | 'command'
  | 'approval'
  | 'question'
  | 'result'
  | 'error'
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

function classify(log: LogEntry): UIEvent {
  const text = oneLine(log.text);
  const lower = text.toLowerCase();
  if (log.kind === 'error') return { agentId: log.agentId, kind: 'error', label: 'error', detail: text, ts: log.ts, seq: log.seq };
  if (log.kind === 'note') return { agentId: log.agentId, kind: 'note', label: 'note', detail: text, ts: log.ts, seq: log.seq };
  if (log.kind === 'system') return { agentId: log.agentId, kind: 'system', label: 'system', detail: text, ts: log.ts, seq: log.seq };
  if (log.kind === 'llm') return { agentId: log.agentId, kind: 'thought', label: 'thinking', detail: text, ts: log.ts, seq: log.seq };
  if (/^(read|opened)\s+/i.test(text)) return { agentId: log.agentId, kind: 'file', label: 'read', detail: text.replace(/^(read|opened)\s+/i, ''), ts: log.ts, seq: log.seq };
  if (/^(write|edit|patch|claim|claims?)\s+/i.test(text)) {
    const label = lower.startsWith('claim') ? 'claim' : lower.startsWith('write') ? 'write' : 'edit';
    return { agentId: log.agentId, kind: 'file', label, detail: text.replace(/^(write|edit|patch|claim|claims?)\s*/i, ''), ts: log.ts, seq: log.seq };
  }
  if (/^(run|exec|shell|npm|pnpm|yarn|git)\b/i.test(text)) {
    return { agentId: log.agentId, kind: 'command', label: 'run', detail: text, ts: log.ts, seq: log.seq };
  }
  if (lower.includes('approval') || lower.includes('approve')) {
    return { agentId: log.agentId, kind: 'approval', label: 'approval', detail: text, ts: log.ts, seq: log.seq };
  }
  if (lower.includes('ask') || lower.includes('question')) {
    return { agentId: log.agentId, kind: 'question', label: 'question', detail: text, ts: log.ts, seq: log.seq };
  }
  return { agentId: log.agentId, kind: log.kind === 'tool' ? 'tool' : 'system', label: log.kind === 'tool' ? 'tool' : 'info', detail: text, ts: log.ts, seq: log.seq };
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

export function latestSignal(agent: AgentInfo, events: UIEvent[]): string {
  if (agent.currentAction) return agent.currentAction;
  const last = [...events].reverse().find((e) => e.kind !== 'thought' && e.detail);
  if (last) return `${last.label} ${last.detail}`;
  return agent.lastResult ? 'result ready' : agent.task;
}
