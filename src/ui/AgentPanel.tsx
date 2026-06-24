import React, { useRef, useState, useEffect } from 'react';
import { Box, Text } from 'ink';
import type { AgentInfo, LogEntry } from '../types.js';
import { fmtCost } from '../pricing.js';
import { elapsed, truncate } from './theme.js';
import { Md } from './Md.js';
import { Spinner } from './Spinner.js';
import { Timeline } from './Timeline.js';
import { MARK, MODE, STATE_META, UI, ANIM, COLOR } from './tokens.js';
import { latestSignal, toUIEvents } from './events.js';

export const KIND_COLOR: Record<string, string> = {
  tool: UI.accent,
  llm: UI.muted,
  error: UI.danger,
  note: UI.note,
  memory: COLOR.creamMuted,
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
  const ctx = agent.ctxPct !== undefined ? ` · ${agent.ctxPct}% ctx` : '';
  const perf = agent.perf ? ` · ${agent.perf.modelTurns}t/${agent.perf.toolCalls} tools` : '';
  const runtime = agent.endedAt ? `ended ${elapsed(agent.startedAt, agent.endedAt)}` : elapsed(agent.startedAt);
  return `${runtime}${ctx}${perf} · ${agent.cost === null ? '$-' : fmtCost(agent.cost)}`;
}

function firstSectionLine(text: string, labels: string[]): string | null {
  const lines = text.replace(/\r/g, '').split('\n');
  for (let i = 0; i < lines.length; i++) {
    const clean = lines[i].replace(/^#{1,6}\s+/, '').replace(/\*\*/g, '').trim();
    const match = clean.match(/^([^:]+):?\s*(.*)$/);
    if (!match) continue;
    const label = match[1].toLowerCase();
    if (!labels.some((l) => label.includes(l))) continue;
    const inline = cleanHubSummary(match[2] ?? '');
    if (inline) return inline;
    const next = cleanHubSummary(lines.slice(i + 1).find((l) => l.trim()) ?? '');
    if (next) return next;
  }
  return null;
}

function fileSummary(text: string): string | null {
  const paths = [...text.matchAll(/\b(?:src|test|tests|bin|scripts|docs|\.parallel|\.cursor)\/[A-Za-z0-9._/-]+|\b[A-Za-z0-9._-]+\.(?:ts|tsx|js|mjs|json|md|sh)\b/g)]
    .map((m) => m[0])
    .filter((p, i, arr) => arr.indexOf(p) === i)
    .slice(0, 3);
  if (paths.length === 0) return null;
  return paths.join(', ');
}

export function hubSummaryLines(text: string, maxLines = 4, maxWidth = 100): string[] {
  const cleanLines = text
    .replace(/\r/g, '')
    .split('\n')
    .map(cleanHubSummary)
    .filter(Boolean);
  const outcome = firstSectionLine(text, ['ce que j', 'résultat', 'outcome', 'what i did', 'réponse courte', 'mode task']) ?? cleanLines[0] ?? 'Task complete.';
  const validation = firstSectionLine(text, ['validation', 'vérifié', 'verified', 'tests']);
  const files = firstSectionLine(text, ['fichiers', 'files']) ?? fileSummary(text);
  const risks = firstSectionLine(text, ['risque', 'risk', 'caveat', 'problème', 'remaining']);
  const candidates = [
    outcome,
    validation ? `Validation: ${validation}` : null,
    files ? `Files: ${files}` : null,
    risks ? `Risks: ${risks}` : null,
  ].filter((line): line is string => Boolean(line));
  const out: string[] = [];
  for (const line of candidates) {
    const normalized = truncate(line.replace(/^[•\-✓]\s*/, ''), maxWidth);
    if (!out.includes(normalized)) out.push(normalized);
    if (out.length >= maxLines) break;
  }
  return out;
}

function ResultBlock({ agent, compact = false }: { agent: AgentInfo; compact?: boolean }) {
  if (!agent.lastResult) return null;
  if (compact) {
    return (
      <Text wrap="truncate-end">
        <Text color={COLOR.cream}>• </Text>
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
  if (state === 'working') return COLOR.cream;
  return 'yellow'; // thinking, listening, waiting
}

export function modeBadge(mode: AgentInfo['mode']): { label: string; color: string } {
  if (mode === 'ask') return { label: 'ASK', color: MODE.ask };
  if (mode === 'plan') return { label: 'PLAN', color: MODE.plan };
  return { label: 'TASK', color: MODE.task };
}

export function hiddenProgressCount(agent: AgentInfo, max: number): number {
  return Math.max(0, (agent.progressSteps?.length ?? 0) - max);
}

function agentDisplayName(agent: AgentInfo): string {
  return agent.alias && agent.alias !== agent.name ? `${agent.alias} ${agent.name}` : agent.alias || agent.name;
}

export function ProgressSteps({
  agent,
  max = 4,
  cols = 100,
  showRemaining = false,
}: {
  agent: AgentInfo;
  max?: number;
  cols?: number;
  showRemaining?: boolean;
}) {
  const steps = agent.progressSteps?.slice(0, max) ?? [];
  const total = agent.progressSteps?.length ?? 0;
  if (steps.length === 0) return null;
  const textMax = Math.max(20, cols - 8);
  const remaining = hiddenProgressCount(agent, max);
  const ref = agent.alias || agent.name;
  return (
    <Box flexDirection="column">
      {steps.map((step, i) => {
        const active = step.status === 'active';
        const done = step.status === 'done';
        return (
          <Text key={`${i}-${step.text}`} color={done ? UI.ok : active ? COLOR.cream : UI.muted} wrap="truncate-end">
            <Text color={done ? UI.ok : active ? COLOR.cream : UI.muted}>{done ? MARK.done : active ? MARK.active : MARK.idle} </Text>
            {truncate(step.text, textMax)}
          </Text>
        );
      })}
      {showRemaining && remaining > 0 ? (
        <Text color={COLOR.creamMuted} wrap="truncate-end">
          +{remaining} steps · full /focus {ref} · term /attach {ref}
        </Text>
      ) : null}
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
  const terminal = agent.state === 'done' || agent.state === 'error' || agent.state === 'stopped';

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
  const mode = modeBadge(agent.mode);
  const quickActions = terminal
    ? agent.state === 'error'
      ? `full /focus ${agent.alias || agent.name} · term /attach ${agent.alias || agent.name} · clear /clear`
      : `full /focus ${agent.alias || agent.name} · term /attach ${agent.alias || agent.name}`
    : `stop /stop ${agent.alias || agent.name} · full /focus ${agent.alias || agent.name} · term /attach ${agent.alias || agent.name}`;
  const actionBudget = Math.min(44, quickActions.length + 2);
  const taskMax = Math.max(10, cols - 18 - actionBudget);
  const line2Max = Math.max(10, cols - 2);
  const telemetry = formatAgentTelemetry(agent);
  const signal = latestSignal(agent, toUIEvents(logs));
  const specialist = agent.specialist ? ` #${agent.specialist}` : '';
  const claims = agent.claims && agent.claims.length > 0 ? `⚑ ${truncate(agent.claims.join(', '), Math.max(12, Math.floor(line2Max * 0.35)))}` : '';
  const summary = agent.lastResult ? hubSummaryLines(agent.lastResult, 4, Math.max(20, line2Max - 4)) : [];

  let line2: { text: string; color: string } | null = null;
  if (!agent.lastResult && signal && signal !== agent.task) {
    const detail = claims ? `${truncate(signal, Math.max(10, line2Max - claims.length - 4))} · ${claims}` : signal;
    line2 = { text: `▸ ${truncate(detail, line2Max)}`, color: UI.accent };
  } else if (claims) {
    line2 = { text: claims, color: UI.warn };
  }

  return (
    <Box flexDirection="column" marginBottom={0} paddingLeft={1}>
      {/* Line 1: mark/spinner + name + mode + task */}
      <Box flexDirection="row" justifyContent="space-between">
        <Text wrap="truncate-end">
          {SPINNER_STATES.has(agent.state) ? (
            <Spinner color={pulseColor ?? spinnerColor(agent.state)} />
          ) : (
            <Text color={pulseColor ?? meta.color} bold>{meta.mark}</Text>
          )}
          <Text> </Text>
          <Text color={agent.color} bold>{name}</Text>
          <Text color={mode.color}> [{mode.label}]</Text>
          {specialist ? <Text color={UI.note}>{specialist}</Text> : null}
          <Text color={UI.text}>  {truncate(agent.task, taskMax)}</Text>
        </Text>
        <Text color={UI.muted} wrap="truncate-end">
          {truncate(quickActions, actionBudget)}
        </Text>
      </Box>
      {summary.length > 0 ? (
        <Box flexDirection="column">
          {summary.map((line, i) => (
            <Box key={`${i}-${line}`} flexDirection="row" justifyContent={i === 0 ? 'space-between' : undefined}>
              <Text color={COLOR.cream} wrap="truncate-end">
                <Text color={COLOR.cream}>• </Text>
                {line}
              </Text>
              {i === 0 ? <Text color={UI.muted}>{telemetry}</Text> : null}
            </Box>
          ))}
        </Box>
      ) : line2 ? (
        <Box flexDirection="row" justifyContent="space-between">
          <Text color={line2.color} wrap="truncate-end">
            {line2.text}
          </Text>
          <Text color={UI.muted}>{telemetry}</Text>
        </Box>
      ) : null}
      {!agent.lastResult ? <ProgressSteps agent={agent} max={3} cols={line2Max} showRemaining /> : null}
    </Box>
  );
}

export function AgentTranscript({
  agent,
  logs,
  raw = false,
  scrolled = 0,
  cols = 100,
}: {
  agent: AgentInfo;
  logs: LogEntry[];
  raw?: boolean;
  scrolled?: number;
  cols?: number;
}) {
  const meta = STATE_META[agent.state];
  const mode = modeBadge(agent.mode);
  const shell = agent.perf && agent.perf.shellCommands > 0 ? ` · shell ${agent.perf.shellCommands}/${Math.round(agent.perf.shellMs / 1000)}s` : '';
  return (
    <Box flexDirection="column">
      <Box justifyContent="space-between">
        <Text>
          <Text color={agent.color} bold>
            {agent.name}
          </Text>
          {agent.alias && agent.alias !== agent.name ? <Text color={UI.muted}> @{agent.alias}</Text> : null}
          <Text color={mode.color}> [{mode.label}]</Text>
          <Text color={UI.muted}>  </Text>
          <Text color={meta.color} bold>
            {meta.mark} {meta.label}
          </Text>
        </Text>
        <Text color={UI.muted} wrap="truncate-end">
          {agent.model} · {formatAgentTelemetry(agent)}{shell}
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
      <ProgressSteps agent={agent} max={6} cols={cols} />
      {agent.state === 'done' || agent.lastResult ? <ResultBlock agent={agent} /> : null}
      <Box flexDirection="column" marginTop={1}>
        <Text color={UI.muted} bold>
          Activity{raw ? ' raw' : ''}
        </Text>
        <Timeline logs={logs} raw={raw} cols={cols} />
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
