import type { AgentState } from '../types.js';

export const MARK = {
  active: '●',
  idle: '◌',
  done: '✓',
  error: '!',
  waiting: '?',
  arrow: '▸',
};

export const UI = {
  brand: 'cyanBright',
  accent: 'cyan',
  muted: 'gray',
  text: 'white',
  ok: 'greenBright',
  warn: 'yellow',
  danger: 'redBright',
  note: 'magentaBright',
};

export const STATE_META: Record<AgentState, { mark: string; label: string; color: string; rank: number }> = {
  waiting: { mark: MARK.waiting, label: 'needs input', color: UI.warn, rank: 0 },
  paused: { mark: MARK.waiting, label: 'paused', color: UI.warn, rank: 1 },
  listening: { mark: MARK.active, label: 'listening', color: UI.accent, rank: 2 },
  thinking: { mark: MARK.active, label: 'thinking', color: UI.accent, rank: 3 },
  working: { mark: MARK.active, label: 'working', color: UI.accent, rank: 4 },
  error: { mark: MARK.error, label: 'error', color: UI.danger, rank: 5 },
  stopped: { mark: MARK.error, label: 'stopped', color: UI.danger, rank: 6 },
  done: { mark: MARK.done, label: 'done', color: UI.ok, rank: 7 },
  idle: { mark: MARK.idle, label: 'idle', color: UI.muted, rank: 8 },
};

export function middleTruncate(text: string, max: number): string {
  if (text.length <= max) return text;
  if (max <= 3) return text.slice(0, max);
  const left = Math.ceil((max - 1) / 2);
  const right = Math.floor((max - 1) / 2);
  return `${text.slice(0, left)}…${text.slice(text.length - right)}`;
}

export function oneLine(text: string): string {
  return text.replace(/\s+/g, ' ').trim();
}
