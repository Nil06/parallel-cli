import React from 'react';
import { Box, Text } from 'ink';
import type { AgentInfo, LogEntry } from '../types.js';
import { Spinner } from './Spinner.js';
import { fmtCost } from '../pricing.js';
import { STATE_LABEL, stateLabel, elapsed, truncate } from './theme.js';
import { Md } from './Md.js';
import { t } from '../i18n.js';

export const KIND_COLOR: Record<string, string> = {
  tool: 'cyanBright',
  llm: 'gray',
  error: 'red',
  note: 'magentaBright',
  system: 'yellow',
  info: 'white',
};

/** Thinking/commentary lines (kind 'llm') are dimmed + italic, à la Codex/Claude Code. */
export const KIND_DIM: Record<string, boolean> = { llm: true };

export function AgentPanel({
  agent,
  logs,
  width,
  expanded = false,
}: {
  agent: AgentInfo;
  logs: LogEntry[];
  width: string;
  /** Focus mode: full task/summary (wrapped, not truncated), claims, longer logs. */
  expanded?: boolean;
}) {
  const st = STATE_LABEL[agent.state];
  const busy = agent.state === 'thinking' || agent.state === 'working' || agent.state === 'listening';
  return (
    <Box width={width} paddingX={0}>
      <Box
        borderStyle={agent.state === 'listening' ? 'double' : 'round'}
        borderColor={agent.state === 'error' ? 'red' : agent.state === 'listening' ? 'cyanBright' : agent.color}
        flexDirection="column"
        paddingX={1}
        flexGrow={1}
      >
        <Box justifyContent="space-between">
          <Box>
            <Text color={agent.color} bold>
              ◆ {agent.name}
              {agent.alias && agent.alias !== agent.name ? <Text color="gray"> @{agent.alias}</Text> : null}{' '}
            </Text>
            <Text backgroundColor={st.color} color="black" bold>
              {' '}
              {st.icon} {stateLabel(agent.state)}{' '}
            </Text>
            {busy && (
              <Text>
                {' '}
                <Spinner color={agent.color} />
              </Text>
            )}
          </Box>
          <Text color="gray" wrap="truncate-end">
            {agent.specialist ? `🎓${agent.specialist} · ` : ''}
            {truncate(agent.model, 18)} · {elapsed(agent.startedAt)} · {agent.steps} st ·{' '}
            {Math.round((agent.tokensIn + agent.tokensOut) / 1000)}k ·{' '}
            {agent.ctxPct !== undefined ? (
              <Text color={agent.ctxPct >= 90 ? 'redBright' : agent.ctxPct >= 70 ? 'yellowBright' : 'gray'}>
                ◔{agent.ctxPct}% ·{' '}
              </Text>
            ) : null}
            <Text color="greenBright">{agent.cost === null ? '$—' : fmtCost(agent.cost)}</Text>
          </Text>
        </Box>
        <Text color="gray" wrap={expanded ? 'wrap' : 'truncate-end'}>
          ◦ {expanded ? agent.task : truncate(agent.task, 120)}
        </Text>
        {agent.claims && agent.claims.length > 0 ? (
          <Text color="yellowBright" wrap="truncate-end">
            🚩 {agent.claims.join(' ')}
          </Text>
        ) : null}
        {agent.currentAction ? (
          <Text color={agent.color} wrap="truncate-end">
            ▸ {truncate(agent.currentAction, 120)}
          </Text>
        ) : null}
        {agent.lastResult ? (
          <Box borderStyle="single" borderColor="gray" flexDirection="column" paddingX={1} marginTop={1}>
            <Text color="greenBright" bold>
              {t('agent.summary')}
            </Text>
            {expanded || agent.state === 'done' ? (
              // A finished agent's summary is the deliverable: show it ENTIRELY,
              // wrapped and lightly formatted — never truncated.
              <Md text={agent.lastResult} />
            ) : (
              <Text color="white" wrap="truncate-end">
                {truncate(agent.lastResult, 260)}
              </Text>
            )}
          </Box>
        ) : null}
        <Box flexDirection="column" marginTop={0}>
          {logs.map((l, i) => (
            <Text
              key={i}
              color={KIND_COLOR[l.kind] ?? 'white'}
              italic={KIND_DIM[l.kind] ?? false}
              wrap="truncate-end"
            >
              {truncate(l.text, expanded ? 220 : 140)}
            </Text>
          ))}
        </Box>
      </Box>
    </Box>
  );
}
