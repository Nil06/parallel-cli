import type { AgentState } from '../types.js';
import { t } from '../i18n.js';

/** Strong visual cues: icon + label (i18n key) + color per state. */
export const STATE_LABEL: Record<AgentState, { icon: string; labelKey: string; color: string }> = {
  idle: { icon: '◇', labelKey: 'st.idle', color: 'gray' },
  thinking: { icon: '🧠', labelKey: 'st.thinking', color: 'yellow' },
  listening: { icon: '👂', labelKey: 'st.listening', color: 'cyanBright' },
  working: { icon: '🔨', labelKey: 'st.working', color: 'green' },
  waiting: { icon: '✋', labelKey: 'st.waiting', color: 'magenta' },
  paused: { icon: '⏸', labelKey: 'st.paused', color: 'blue' },
  done: { icon: '✅', labelKey: 'st.done', color: 'greenBright' },
  error: { icon: '✖', labelKey: 'st.error', color: 'red' },
  stopped: { icon: '⏹', labelKey: 'st.stopped', color: 'redBright' },
};

export function stateLabel(state: AgentState): string {
  return t(STATE_LABEL[state].labelKey);
}

export function elapsed(since: number): string {
  const s = Math.floor((Date.now() - since) / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  return `${m}m${String(s % 60).padStart(2, '0')}s`;
}

export function truncate(text: string, max: number): string {
  const oneLine = text.replace(/\s+/g, ' ').trim();
  return oneLine.length > max ? oneLine.slice(0, max - 1) + '…' : oneLine;
}
