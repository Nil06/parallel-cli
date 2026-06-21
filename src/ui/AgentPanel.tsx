import React from 'react';
import { Box, Text } from 'ink';
import type { AgentInfo, LogEntry } from '../types.js';
import { fmtCost } from '../pricing.js';
import { elapsed, truncate } from './theme.js';
import { Md } from './Md.js';
import { latestSignal, presentTimeline } from './events.js';
import { Timeline } from './Timeline.js';
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

export function modeLabel(mode: AgentInfo['mode']): string {
  return mode === 'ask' ? 'Ask' : mode === 'plan' ? 'Plan' : 'Task';
}

export function cleanHubSummary(text: string): string {
  return text
    .replace(/^#{1,6}\s+/gm, '')
    .replace(/\*\*(.*?)\*\*/g, '$1')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/^\s*[-*]\s+/gm, '')
    .replace(/\s+/g, ' ')
    .trim();
}

export function formatAgentTelemetry(agent: AgentInfo): string {
  const tokens = Math.round((agent.tokensIn + agent.tokensOut) / 1000);
  return [
    elapsed(agent.startedAt),
    `${agent.steps} st`,
    `${tokens}k`,
    agent.ctxPct !== undefined ? `${agent.ctxPct}%` : '',
    agent.cost === null ? '$-' : fmtCost(agent.cost),
  ]
    .filter(Boolean)
    .join(' · ');
}

function agentDisplayName(agent: AgentInfo): string {
  return agent.alias && agent.alias !== agent.name ? `${agent.alias} ${agent.name}` : agent.alias || agent.name;
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
  const events = presentTimeline(logs);
  const signalMax = cols < 90 ? 70 : cols < 130 ? 100 : 130;
  const signal = truncate(cleanHubSummary(agent.lastResult || latestSignal(agent, events)), signalMax);
  return (
    <Box flexDirection="column" marginBottom={1} paddingLeft={1}>
      <Text wrap="truncate-end">
        <Text color={meta.color} bold>{meta.mark}</Text>
        <Text color={agent.color} bold> {agentDisplayName(agent)}</Text>
        <Text color={UI.muted}>  {modeLabel(agent.mode)} </Text>
        <Text color={meta.color} bold>{meta.label}</Text>
      </Text>
      <Text color={UI.muted} wrap="truncate-end">  {truncate(agent.task, signalMax)}</Text>
      <Text wrap="truncate-end">  {signal}</Text>
      <Text color={UI.muted} wrap="truncate-end">
        {'  '}
        {formatAgentTelemetry(agent)} · /focus {agent.alias || agent.name}
      </Text>
    </Box>
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
          {agent.model} · {formatAgentTelemetry(agent)}
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
        <Timeline logs={logs} raw={raw} />
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
