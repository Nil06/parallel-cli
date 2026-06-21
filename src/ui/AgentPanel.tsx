import React from 'react';
import { Box, Text } from 'ink';
import type { AgentInfo, LogEntry } from '../types.js';
import { fmtCost } from '../pricing.js';
import { elapsed, truncate } from './theme.js';
import { Md } from './Md.js';
import { compactEvents, latestSignal, toUIEvents, type UIEvent } from './events.js';
import { MARK, STATE_META, UI, middleTruncate } from './tokens.js';

export const KIND_COLOR: Record<string, string> = {
  tool: UI.accent,
  llm: UI.muted,
  error: UI.danger,
  note: UI.note,
  system: UI.warn,
  info: UI.text,
};

export const KIND_DIM: Record<string, boolean> = { llm: true };

function eventColor(kind: UIEvent['kind']): string {
  if (kind === 'error') return UI.danger;
  if (kind === 'note') return UI.note;
  if (kind === 'command' || kind === 'tool') return UI.accent;
  if (kind === 'file') return UI.warn;
  if (kind === 'thought') return UI.muted;
  return UI.text;
}

function ResultBlock({ agent, compact = false }: { agent: AgentInfo; compact?: boolean }) {
  if (!agent.lastResult) return null;
  if (compact) {
    return (
      <Text wrap="truncate-end">
        <Text color={UI.ok}>{MARK.done} </Text>
        <Text>{truncate(agent.lastResult, 110)}</Text>
      </Text>
    );
  }
  return (
    <Box borderStyle="single" borderColor="gray" flexDirection="column" paddingX={1} marginTop={1}>
      <Text color={UI.ok} bold>
        Result
      </Text>
      <Md text={agent.lastResult} />
    </Box>
  );
}

export function AgentRow({
  agent,
  logs,
  cols,
}: {
  agent: AgentInfo;
  logs: LogEntry[];
  cols: number;
}) {
  const meta = STATE_META[agent.state];
  const events = compactEvents(toUIEvents(logs));
  const signalMax = cols < 90 ? 36 : cols < 130 ? 58 : 82;
  const modelMax = cols < 110 ? 14 : 22;
  const signal = truncate(latestSignal(agent, events), signalMax);
  const tokens = Math.round((agent.tokensIn + agent.tokensOut) / 1000);
  return (
    <Text wrap="truncate-end">
      <Text color={meta.color} bold>
        {meta.mark}
      </Text>
      <Text color={agent.color} bold>
        {' '}
        {agent.alias || agent.name}
      </Text>
      <Text color={UI.muted}> {middleTruncate(agent.name, 12).padEnd(12)} </Text>
      <Text color={meta.color}>{meta.label.padEnd(11)} </Text>
      <Text>{signal}</Text>
      <Text color={UI.muted}>
        {' '}
        {elapsed(agent.startedAt)} · {agent.steps} st · {tokens}k
        {agent.ctxPct !== undefined ? ` · ${agent.ctxPct}%` : ''} · {middleTruncate(agent.model, modelMax)}
      </Text>
      <Text color={UI.ok}> {agent.cost === null ? '$-' : fmtCost(agent.cost)}</Text>
    </Text>
  );
}

export function AgentTranscript({
  agent,
  logs,
  raw = false,
  scrolled = 0,
}: {
  agent: AgentInfo;
  logs: LogEntry[];
  raw?: boolean;
  scrolled?: number;
}) {
  const meta = STATE_META[agent.state];
  const events = raw ? toUIEvents(logs) : compactEvents(toUIEvents(logs));
  const tokens = Math.round((agent.tokensIn + agent.tokensOut) / 1000);
  return (
    <Box flexDirection="column">
      <Box justifyContent="space-between">
        <Text>
          <Text color={agent.color} bold>
            {agent.name}
          </Text>
          {agent.alias && agent.alias !== agent.name ? <Text color={UI.muted}> @{agent.alias}</Text> : null}
          <Text color={UI.muted}>  </Text>
          <Text color={meta.color} bold>
            {meta.mark} {meta.label}
          </Text>
        </Text>
        <Text color={UI.muted} wrap="truncate-end">
          {agent.model} · {elapsed(agent.startedAt)} · {agent.steps} st · {tokens}k
          {agent.ctxPct !== undefined ? ` · ctx ${agent.ctxPct}%` : ''} · {agent.cost === null ? '$-' : fmtCost(agent.cost)}
        </Text>
      </Box>
      <Text color={UI.muted} wrap="wrap">
        Task  <Text color={UI.text}>{agent.task}</Text>
      </Text>
      {agent.claims && agent.claims.length > 0 ? (
        <Text color={UI.warn} wrap="truncate-end">
          Claims  {agent.claims.join(' ')}
        </Text>
      ) : null}
      {agent.currentAction ? (
        <Text color={UI.accent} wrap="truncate-end">
          Current  {truncate(agent.currentAction, 140)}
        </Text>
      ) : null}
      {agent.state === 'done' || agent.lastResult ? <ResultBlock agent={agent} /> : null}
      <Box flexDirection="column" marginTop={1}>
        <Text color={UI.muted} bold>
          Activity{raw ? ' raw' : ''}
        </Text>
        {events.length === 0 ? (
          <Text color={UI.muted}>No activity yet.</Text>
        ) : (
          events.map((e, i) => (
            <Text key={`${e.seq ?? i}-${i}`} color={eventColor(e.kind)} italic={e.kind === 'thought'} wrap="truncate-end">
              <Text color={UI.muted}>{e.label.padEnd(10)}</Text>
              {truncate(e.detail, 180)}
            </Text>
          ))
        )}
      </Box>
      <Text color={UI.muted} wrap="truncate-end">
        PgUp/PgDn scroll · /raw toggles detail · Esc returns
        {scrolled > 0 ? ` · ${scrolled} older` : ''}
      </Text>
    </Box>
  );
}

export function AgentPanel({
  agent,
  logs,
  width,
  expanded = false,
}: {
  agent: AgentInfo;
  logs: LogEntry[];
  width: string;
  expanded?: boolean;
}) {
  return (
    <Box width={width} flexDirection="column">
      {expanded ? <AgentTranscript agent={agent} logs={logs} /> : <AgentRow agent={agent} logs={logs} cols={100} />}
      {!expanded && agent.lastResult ? <ResultBlock agent={agent} compact /> : null}
    </Box>
  );
}
