import React, { useRef, useState, useEffect } from 'react';
import { Box, Text } from 'ink';
import type { AgentInfo, FileChange, LogEntry } from '../types.js';
import { fmtCost } from '../pricing.js';
import { elapsed, truncate } from './theme.js';
import { Md } from './Md.js';
import { Spinner } from './Spinner.js';
import { Timeline } from './Timeline.js';
import { MARK, MODE, STATE_META, UI, ANIM, COLOR } from './tokens.js';
import { latestSignal, toUIEvents } from './events.js';
import { changesForAgent, formatChangeStats, summarizeChanges } from './changeSummary.js';
import { t } from '../i18n.js';

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
  const llm = agent.perf?.llmMs ? ` · llm ${Math.round(agent.perf.llmMs / 1000)}s` : '';
  const runtime = agent.endedAt ? `ended ${elapsed(agent.startedAt, agent.endedAt)}` : elapsed(agent.startedAt);
  const cache = agent.perf?.cachedTokens ? ` · cache ${Math.round(agent.perf.cachedTokens / 1000)}k` : '';
  const profile = agent.profile ? ` · ${agent.profile}` : '';
  return `${runtime}${profile}${ctx}${perf}${llm}${cache} · ${agent.cost === null ? '$-' : fmtCost(agent.cost)}`;
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

function hubSummaryFields(text: string): { outcome: string; validation?: string; files?: string; risks?: string } {
  const cleanLines = text
    .replace(/\r/g, '')
    .split('\n')
    .map(cleanHubSummary)
    .filter(Boolean);
  return {
    outcome: firstSectionLine(text, ['ce que j', 'résultat', 'outcome', 'what i did', 'réponse courte', 'mode task']) ?? cleanLines[0] ?? 'Task complete.',
    validation: firstSectionLine(text, ['validation', 'vérifié', 'verified', 'tests']) ?? undefined,
    files: firstSectionLine(text, ['fichiers', 'files']) ?? fileSummary(text) ?? undefined,
    risks: firstSectionLine(text, ['risque', 'risk', 'caveat', 'problème', 'remaining']) ?? undefined,
  };
}

function wrapWords(text: string, width: number): string[] {
  const max = Math.max(10, width);
  const words = text.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let current = '';
  for (const word of words) {
    if (!current) {
      current = word;
      continue;
    }
    if (current.length + 1 + word.length <= max) {
      current += ` ${word}`;
      continue;
    }
    lines.push(current);
    current = word;
  }
  if (current) lines.push(current);
  return lines.length > 0 ? lines : [''];
}

export function hubWrappedLineCount(value: string, cols: number): number {
  const labelWidth = 10;
  const textWidth = Math.max(18, cols - labelWidth - 4);
  return wrapWords(value, textWidth).length;
}

function HubField({ label, value, color, cols }: { label: string; value: string; color: string; cols: number }) {
  const labelWidth = 10;
  const textWidth = Math.max(18, cols - labelWidth - 4);
  const lines = wrapWords(value, textWidth);
  return (
    <Box flexDirection="column">
      {lines.map((line, i) => (
        <Text key={`${label}-${i}`} wrap="wrap">
          <Text color={UI.muted}>  {i === 0 ? label.padEnd(labelWidth) : ''.padEnd(labelWidth)}</Text>
          <Text color={color}>{line}</Text>
        </Text>
      ))}
    </Box>
  );
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
  const airy = agent.lastResult
    .replace(/\n(?=(Ce que|Résultat|Détails|Validation|Risques|Plan appliqué|Réponse courte|Recommandation|Pourquoi|Prochaines étapes)\b)/g, '\n\n')
    .replace(/((?:Ce que|Résultat|Détails|Validation|Risques|Plan appliqué|Réponse courte|Recommandation|Pourquoi|Prochaines étapes)[^\n]*)\n(?!\n)/g, '$1\n\n');
  return (
    <Box borderStyle="single" borderColor={COLOR.creamMuted} flexDirection="column" paddingX={1} marginTop={1}>
      <Text color={COLOR.cream} bold>
        {t('agent.resultTitle')}
      </Text>
      <Text> </Text>
      <Md text={airy} />
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

function AgentRowView({
  agent,
  logs,
  changes = [],
  cols,
}: {
  agent: AgentInfo;
  logs: LogEntry[];
  changes?: FileChange[];
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
  const line2Max = Math.max(10, cols - 2);
  const telemetry = formatAgentTelemetry(agent);
  const signal = latestSignal(agent, toUIEvents(logs));
  const specialist = agent.specialist ? ` #${agent.specialist}` : '';
  const claims = agent.claims && agent.claims.length > 0 ? `⚑ ${agent.claims.join(', ')}` : '';
  const summary = agent.lastResult ? hubSummaryFields(agent.lastResult) : null;
  const ownChanges = changesForAgent(changes, agent.id);
  const changeStats = summarizeChanges(ownChanges);
  const changeLine = ownChanges.length > 0 || terminal ? formatChangeStats(changeStats) : '';
  const telemetryLine = `Session ${telemetry}`;

  let line2: { text: string; color: string } | null = null;
  if (!agent.lastResult && signal && signal !== agent.task) {
    const detail = claims ? `${signal} · ${claims}` : signal;
    line2 = { text: `▸ ${detail}`, color: UI.accent };
  } else if (claims) {
    line2 = { text: claims, color: UI.warn };
  }

  return (
    <Box flexDirection="column" marginBottom={0} paddingLeft={1}>
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
          {agent.profile ? <Text color={UI.muted}> [{agent.profile.toUpperCase()}]</Text> : null}
          {specialist ? <Text color={UI.note}>{specialist}</Text> : null}
          <Text color={meta.color}>  {meta.label}</Text>
        </Text>
        <Text color={UI.muted} wrap="truncate-end">
          {truncate(quickActions, actionBudget)}
        </Text>
      </Box>
      <HubField label="Task" value={agent.task} color={UI.text} cols={line2Max} />
      {summary ? (
        <Box flexDirection="column">
          <HubField label="Result" value={summary.outcome} color={COLOR.cream} cols={line2Max} />
          {summary.validation ? <HubField label="Verified" value={summary.validation} color={UI.ok} cols={line2Max} /> : null}
          {summary.files ? <HubField label="Files" value={summary.files} color={COLOR.creamMuted} cols={line2Max} /> : null}
          {summary.risks ? <HubField label="Risk" value={summary.risks} color={UI.warn} cols={line2Max} /> : null}
          {changeLine ? (
            <HubField label="Changes" value={changeLine} color={changeStats.files > 0 ? UI.ok : UI.warn} cols={line2Max} />
          ) : null}
          <Text color={COLOR.creamMuted} backgroundColor={COLOR.promptBackground} italic wrap="wrap">
            {'  '}{telemetryLine}
          </Text>
        </Box>
      ) : line2 ? (
        <Box flexDirection="column">
          <Text color={line2.color} wrap="wrap">
            {line2.text}
          </Text>
          <Text color={COLOR.creamMuted} backgroundColor={COLOR.promptBackground} italic wrap="wrap">
            {'  '}{telemetryLine}
          </Text>
        </Box>
      ) : null}
      {!agent.lastResult ? <ProgressSteps agent={agent} max={3} cols={line2Max} showRemaining /> : null}
      {!agent.lastResult && changeLine ? (
        <HubField label="Changes" value={changeLine} color={changeStats.files > 0 ? UI.ok : UI.warn} cols={line2Max} />
      ) : null}
    </Box>
  );
}

export function estimateAgentRowLines(agent: AgentInfo, logs: LogEntry[], changes: FileChange[] = [], cols: number): number {
  const terminal = agent.state === 'done' || agent.state === 'error' || agent.state === 'stopped';
  const line2Max = Math.max(10, cols - 2);
  const summary = agent.lastResult ? hubSummaryFields(agent.lastResult) : null;
  const ownChanges = changesForAgent(changes, agent.id);
  const changeStats = summarizeChanges(ownChanges);
  const changeLine = ownChanges.length > 0 || terminal ? formatChangeStats(changeStats) : '';
  let lines = 1 + hubWrappedLineCount(agent.task, line2Max);

  if (summary) {
    lines += hubWrappedLineCount(summary.outcome, line2Max);
    if (summary.validation) lines += hubWrappedLineCount(summary.validation, line2Max);
    if (summary.files) lines += hubWrappedLineCount(summary.files, line2Max);
    if (summary.risks) lines += hubWrappedLineCount(summary.risks, line2Max);
    if (changeLine) lines += hubWrappedLineCount(changeLine, line2Max);
    lines += hubWrappedLineCount(`Session ${formatAgentTelemetry(agent)}`, line2Max);
    return lines;
  }

  const signal = latestSignal(agent, toUIEvents(logs));
  const claims = agent.claims && agent.claims.length > 0 ? `⚑ ${agent.claims.join(', ')}` : '';
  if ((!agent.lastResult && signal && signal !== agent.task) || claims) {
    lines += hubWrappedLineCount(signal && signal !== agent.task ? `▸ ${signal}${claims ? ` · ${claims}` : ''}` : claims, line2Max);
    lines += hubWrappedLineCount(`Session ${formatAgentTelemetry(agent)}`, line2Max);
  }

  if (!agent.lastResult && agent.progressSteps && agent.progressSteps.length > 0) {
    lines += Math.min(3, agent.progressSteps.length);
    if (agent.progressSteps.length > 3) lines += 1;
  }
  if (!agent.lastResult && changeLine) lines += hubWrappedLineCount(changeLine, line2Max);
  return lines;
}

function sameAgentRowProps(prev: { agent: AgentInfo; logs: LogEntry[]; changes?: FileChange[]; cols: number }, next: { agent: AgentInfo; logs: LogEntry[]; changes?: FileChange[]; cols: number }): boolean {
  const a = prev.agent;
  const b = next.agent;
  const prevLast = prev.logs[prev.logs.length - 1]?.seq ?? 0;
  const nextLast = next.logs[next.logs.length - 1]?.seq ?? 0;
  return (
    prev.cols === next.cols &&
    prev.changes === next.changes &&
    prevLast === nextLast &&
    a.id === b.id &&
    a.name === b.name &&
    a.alias === b.alias &&
    a.state === b.state &&
    a.task === b.task &&
    a.currentAction === b.currentAction &&
    a.lastResult === b.lastResult &&
    a.steps === b.steps &&
    a.tokensIn === b.tokensIn &&
    a.tokensOut === b.tokensOut &&
    a.cost === b.cost &&
    a.ctxPct === b.ctxPct &&
    a.profile === b.profile &&
    a.specialist === b.specialist &&
    (a.claims ?? []).join('\0') === (b.claims ?? []).join('\0') &&
    (a.progressSteps ?? []).map((s) => `${s.status}:${s.text}`).join('\0') === (b.progressSteps ?? []).map((s) => `${s.status}:${s.text}`).join('\0')
  );
}

export const AgentRow = React.memo(AgentRowView, sameAgentRowProps);

export function AgentTranscript({
  agent,
  logs,
  changes,
  raw = false,
  scrolled = 0,
  cols = 100,
}: {
  agent: AgentInfo;
  logs: LogEntry[];
  changes?: FileChange[];
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
        <Timeline logs={logs} changes={changes} raw={raw} cols={cols} />
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
