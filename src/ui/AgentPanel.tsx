import React, { useRef, useState, useEffect } from 'react';
import { Box, Text } from 'ink';
import type { AgentInfo, LogEntry } from '../types.js';
import { fmtCost } from '../pricing.js';
import { elapsed, truncate } from './theme.js';
import { Md } from './Md.js';
import { Spinner } from './Spinner.js';
import { Timeline } from './Timeline.js';
import { MARK, MODE, STATE_META, UI, ANIM } from './tokens.js';

export const KIND_COLOR: Record<string, string> = {
  tool: UI.accent,
  llm: UI.muted,
  error: UI.danger,
  note: UI.note,
  system: UI.warn,
  info: UI.text,
};

export const KIND_DIM: Record<string, boolean> = { llm: true };

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
  return `${elapsed(agent.startedAt)} · ${agent.cost === null ? '$-' : fmtCost(agent.cost)}`;
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

const SPINNER_STATES: Set<AgentInfo['state']> = new Set(['thinking', 'working', 'listening', 'waiting']);

function spinnerColor(state: AgentInfo['state']): string {
  if (state === 'working') return 'cyan';
  return 'yellow'; // thinking, listening, waiting
}

function modeChar(mode: AgentInfo['mode']): { char: string; color: string | undefined } | null {
  if (mode === 'ask') return { char: '?', color: MODE.ask };
  if (mode === 'plan') return { char: '△', color: MODE.plan };
  return null; // task = no mark
}

function agentDisplayName(agent: AgentInfo): string {
  return agent.alias && agent.alias !== agent.name ? `${agent.alias} ${agent.name}` : agent.alias || agent.name;
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

  // ── State transition pulse (Phase 5) ──
  const prevState = useRef(agent.state);
  const [pulse, setPulse] = useState(false);
  useEffect(() => {
    if (agent.state !== prevState.current) {
      setPulse(true);
      const timer = setTimeout(() => setPulse(false), ANIM.pulseMs);
      prevState.current = agent.state;
      return () => clearTimeout(timer);
    }
  }, [agent.state]);

  // Pulse bumps the mark/spinner color to whiteBright for 400ms
  const pulseColor = pulse ? 'whiteBright' : null;

  const name = agentDisplayName(agent);
  const mode = modeChar(agent.mode);
  const taskMax = Math.max(10, cols - 18);
  const line2Max = Math.max(10, cols - 2);
  const telemetry = formatAgentTelemetry(agent);

  // Line 2 content
  let line2: { text: string; color: string } | null = null;
  if (agent.lastResult) {
    line2 = { text: `✓ ${truncate(cleanHubSummary(agent.lastResult), line2Max)}`, color: UI.ok };
  } else if (agent.currentAction) {
    line2 = { text: `▸ ${truncate(agent.currentAction, line2Max)}`, color: UI.accent };
  } else {
    line2 = { text: meta.label, color: meta.color };
  }

  return (
    <Box flexDirection="column" marginBottom={0} paddingLeft={1}>
      {/* Line 1: mark/spinner + name + mode + task */}
      <Text wrap="truncate-end">
        {SPINNER_STATES.has(agent.state) ? (
          <Spinner color={pulseColor ?? spinnerColor(agent.state)} />
        ) : (
          <Text color={pulseColor ?? meta.color} bold>{meta.mark}</Text>
        )}
        <Text> </Text>
        <Text color={agent.color} bold>{name}</Text>
        {mode ? (
          <Text color={mode.color}> {mode.char}</Text>
        ) : null}
        <Text color={UI.text}>  {truncate(agent.task, taskMax)}</Text>
      </Text>
      {/* Line 2: status + right-aligned telemetry */}
      <Box flexDirection="row" justifyContent="space-between">
        <Text color={line2.color} wrap="truncate-end">
          {line2.text}
        </Text>
        <Text color={UI.muted}>
          {telemetry}
        </Text>
      </Box>
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
    </Box>
  );
}
