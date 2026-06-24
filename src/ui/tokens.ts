import type { AgentState } from '../types.js';

export const MARK = {
  active: '●',
  idle: '◌',
  done: '✓',
  error: '!',
  waiting: '?',
  arrow: '▸',
};

export const COLOR = {
  cream: '#f3e7c7',
  creamMuted: '#c8bfa6',
  promptBackground: '#5f5963',
} as const;

export const UI = {
  brand: COLOR.cream,
  accent: COLOR.cream,
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

// ─── Hub redesign tokens (Phase 0) ───────────────────────────────────────────

/** Brand colors — logotype, borders, focus indicator. */
export const BRAND = {
  primary: COLOR.cream,
  muted: COLOR.creamMuted,
} as const;

/** Semantic state colors mapped to agent states. */
export const STATE = {
  working: COLOR.cream,
  thinking: 'yellow',
  listening: 'yellow',
  done: 'greenBright',
  error: 'redBright',
  waiting: 'yellow',
  idle: 'gray',
} as const;

/** Mode indicator colors. */
export const MODE = {
  ask: 'yellow',
  plan: COLOR.creamMuted,
  task: COLOR.cream,
} as const;

/** Chrome / UI element colors. */
export const CHROME = {
  separator: 'gray',
  muted: 'gray',
  dim: 'dim',
} as const;

/** Animation tokens. */
export const ANIM = {
  spinner: 'dots',
  pulseMs: 400,
  spinnerIntervalMs: 80,
} as const;

/** Plain 7-bit ASCII logotype — renders in every terminal. */
export const ASCII_LOGO = 'PARALLEL';

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
