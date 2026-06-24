import React, { useEffect, useRef, useState } from 'react';
import net from 'node:net';
import { Box, Static, Text, useApp, useInput, useStdout } from 'ink';
import type { AgentInfo, AgentMode, AgentQuestion, ApprovalRequest, LogEntry } from '../types.js';
import { ApprovalPrompt } from './ApprovalPrompt.js';
import { CommandInput } from './CommandInput.js';
import { formatAgentTelemetry, KIND_COLOR, KIND_DIM, modeBadge, ProgressSteps } from './AgentPanel.js';
import { Md } from './Md.js';
import { QuestionPrompt } from './QuestionPrompt.js';
import { Timeline } from './Timeline.js';
import { toUIEvents } from './events.js';
import { stateLabel, elapsed, truncate } from './theme.js';
import { fmtCost } from '../pricing.js';
import { t } from '../i18n.js';
import { COLOR, STATE_META, UI, middleTruncate } from './tokens.js';

/**
 * `parallel attach <agent>` — one DEDICATED terminal per agent.
 *
 * Connects to the session socket of the main TUI and streams this agent's
 * log in the terminal's NATIVE scrollback (Ink <Static>): scrolling works
 * exactly like any other terminal program. The input at the bottom steers
 * the agent in real time, like `@a1 <message>` in the main TUI.
 *
 * Approvals & questions for THIS agent are answerable HERE too: the server
 * includes the pending interaction in every state push, and the first answer
 * (hub or attached terminal) wins — the controller guards by id.
 */

interface StaticLine {
  key: number;
  log: LogEntry;
}

interface LaunchCard {
  key: number;
  info: AgentInfo;
}

interface ResultCard {
  key: number;
  info: AgentInfo;
  result: string;
}

interface OtherAgent {
  name: string;
  alias: string;
  state: AgentInfo['state'];
  task: string;
  currentAction: string;
}

/** Pending interaction as forwarded over the socket (no resolve callback). */
interface WireApproval {
  id: number;
  agentName: string;
  command: string;
}
interface WireQuestion {
  id: number;
  agentName: string;
  question: string;
  options: string[];
  recommended: number;
}

const noop = (): void => {};
const TERMINAL_STATES = new Set<AgentInfo['state']>(['done', 'error', 'stopped']);

export type AttachCommand =
  | { type: 'detach' }
  | { type: 'raw' }
  | { type: 'stop'; target?: string }
  | { type: 'spawn'; text: string; mode: AgentMode }
  | { type: 'send'; target: string; text: string }
  | { type: 'input'; text: string };

export function parseAttachCommand(text: string): AttachCommand | null {
  const v = text.trim();
  if (!v) return null;
  if (v === '/quit' || v === '/exit' || v === '/detach') return { type: 'detach' };
  if (v === '/raw') return { type: 'raw' };
  const stop = v.match(/^\/stop(?:\s+(\S+))?$/s);
  if (stop) return { type: 'stop', target: stop[1]?.trim() };
  const at = v.match(/^@(\S+)\s+(.+)$/s);
  if (at) return { type: 'send', target: at[1], text: at[2].trim() };
  const send = v.match(/^\/send\s+(\S+)\s+(.+)$/s);
  if (send) return { type: 'send', target: send[1], text: send[2].trim() };
  const review = v.match(/^\/review\s+(.+)$/s);
  if (review) {
    return {
      type: 'spawn',
      text: `Review current shared-tree work: ${review[1].trim()}. Return Verdict: APPROVE | REVISE | BLOCK, Risks, Tests to run, Files to inspect, and Notes.`,
      mode: 'ask',
    };
  }
  const m = v.match(/^\/(ask|a|task|t|plan|p)\s+(.+)$/s);
  if (m) {
    const mode: AgentMode = m[1] === 'ask' || m[1] === 'a' ? 'ask' : m[1] === 'plan' || m[1] === 'p' ? 'plan' : 'task';
    return { type: 'spawn', text: m[2].trim(), mode };
  }
  return { type: 'input', text: v };
}

export function formatAttachFooter(info: AgentInfo | null): string {
  if (!info) return 'Waiting for agent · /quit';
  const control = ['thinking', 'working', 'listening', 'waiting', 'paused'].includes(info.state) ? ' · /stop' : '';
  return `${middleTruncate(info.model, 28)} · ${formatAgentTelemetry(info)} · plain text steers${control} · /task new · /quit`;
}

function AttachStaticLine({ item, raw }: { item: StaticLine; raw: boolean }) {
  if (raw) {
    return (
      <Text
        color={KIND_COLOR[item.log.kind] ?? 'white'}
        italic={KIND_DIM[item.log.kind] ?? false}
        wrap="wrap"
      >
        {item.log.text}
      </Text>
    );
  }
  const event = toUIEvents([item.log])[0];
  if (!event || event.kind === 'thought') return <Text color={UI.muted}> </Text>;
  const color = event.kind === 'error' ? UI.danger : event.kind === 'note' ? UI.note : event.kind === 'command' ? UI.accent : UI.muted;
  const detail = event.detail.replace(/\r/g, '').split('\n').filter(Boolean).slice(0, 3).join(' ↳ ');
  return (
    <Text color={color} wrap="truncate-end">
      <Text color={UI.muted}>• </Text>
      <Text bold>{event.label}</Text>
      {detail ? <Text color={event.kind === 'command_output' ? UI.muted : color}> {truncate(detail, process.stdout.columns ? process.stdout.columns - 8 : 120)}</Text> : null}
    </Text>
  );
}

export function isLaunchSystemLog(log: LogEntry): boolean {
  return log.kind === 'system' && /\bAgent\s+.+\slaunched\b|Terminal dédié ouvert|Dedicated terminal/i.test(log.text);
}

function AttachLaunchHeader({ item }: { item: LaunchCard }) {
  const { info } = item;
  const mode = modeBadge(info.mode);
  return (
    <Box flexDirection="column" borderStyle="single" borderColor={info.color} paddingX={1} marginBottom={1}>
      <Text color={UI.brand} bold>
        Parallel agent terminal
      </Text>
      <Text wrap="truncate-end">
        <Text color={info.color} bold>{info.name}</Text>
        {info.alias && info.alias !== info.name ? <Text color={UI.muted}> @{info.alias}</Text> : null}
        <Text color={mode.color}> [{mode.label}]</Text>
        <Text color={UI.muted}> · </Text>
        <Text color={UI.text}>{middleTruncate(info.model, 36)}</Text>
      </Text>
      <Text color={UI.muted} wrap="wrap">
        Task  <Text color={UI.text}>{info.task}</Text>
      </Text>
      <Text color={COLOR.creamMuted}>Dedicated terminal is ready.</Text>
      <Text> </Text>
      <Text> </Text>
    </Box>
  );
}

function AttachResultCard({ item }: { item: ResultCard }) {
  const st = STATE_META[item.info.state];
  return (
    <Box borderStyle="single" borderColor={st.color} flexDirection="column" paddingX={1} marginTop={1}>
      <Text color={COLOR.cream} bold>
        Result · {item.info.name} [{st.label}]
      </Text>
      <Md text={item.result} />
    </Box>
  );
}

export function AttachApp({ agentRef, sock }: { agentRef: string; sock: string }) {
  const { exit } = useApp();
  const { stdout } = useStdout();
  const [info, setInfo] = useState<AgentInfo | null>(null);
  const [others, setOthers] = useState<OtherAgent[]>([]);
  const [launchCards, setLaunchCards] = useState<LaunchCard[]>([]);
  const [resultCards, setResultCards] = useState<ResultCard[]>([]);
  const [lines, setLines] = useState<StaticLine[]>([]);
  const [timelineScroll, setTimelineScroll] = useState(0);
  const [timelineFollowTail, setTimelineFollowTail] = useState(true);
  const [approval, setApproval] = useState<WireApproval | null>(null);
  const [question, setQuestion] = useState<WireQuestion | null>(null);
  const [gone, setGone] = useState(false);
  const [raw, setRaw] = useState(false);
  const socketRef = useRef<net.Socket | null>(null);
  const keySeq = useRef(0);
  const lastBellId = useRef('');
  const launchRendered = useRef(false);
  const renderedResultKey = useRef('');

  useEffect(() => {
    const socket = net.connect(sock);
    socketRef.current = socket;
    let buffer = '';
    socket.setEncoding('utf8');
    socket.on('connect', () => {
      socket.write(JSON.stringify({ type: 'hello', agent: agentRef }) + '\n');
    });
    socket.on('data', (chunk: string) => {
      buffer += chunk;
      let nl: number;
      while ((nl = buffer.indexOf('\n')) !== -1) {
        const line = buffer.slice(0, nl).trim();
        buffer = buffer.slice(nl + 1);
        if (!line) continue;
        let msg: any;
        try {
          msg = JSON.parse(line);
        } catch {
          continue;
        }
        if (msg.type === 'state') {
          setInfo(msg.info ?? null);
          setOthers(Array.isArray(msg.others) ? msg.others : []);
          setApproval(msg.approval ?? null);
          setQuestion(msg.question ?? null);
          if (Array.isArray(msg.logs) && msg.logs.length > 0) {
            setLines((prev) => [...prev, ...msg.logs.map((l: LogEntry) => ({ key: ++keySeq.current, log: l }))]);
          }
        } else if (msg.type === 'bye') {
          setGone(true);
        }
      }
    });
    const drop = () => setGone(true);
    socket.on('close', drop);
    socket.on('error', drop);
    return () => {
      socket.destroy();
    };
  }, [agentRef, sock]);

  useEffect(() => {
    if (!info || launchRendered.current) return;
    launchRendered.current = true;
    setLaunchCards([{ key: ++keySeq.current, info }]);
  }, [info?.id]);

  useEffect(() => {
    if (!info || !TERMINAL_STATES.has(info.state) || !info.lastResult) return;
    const key = `${info.id}:${info.state}:${info.lastResult.length}:${info.lastResult.slice(0, 24)}`;
    if (renderedResultKey.current === key) return;
    renderedResultKey.current = key;
    setResultCards((prev) => [...prev, { key: ++keySeq.current, info: { ...info }, result: info.lastResult ?? '' }]);
  }, [info?.id, info?.state, info?.lastResult]);

  // Audible alert in THIS terminal when a new interaction arrives — the hub
  // also rings, but the user may well be looking at the agent's terminal.
  useEffect(() => {
    const id = approval ? `a${approval.id}` : question ? `q${question.id}` : '';
    if (id && id !== lastBellId.current) {
      lastBellId.current = id;
      process.stdout.write('\x07');
      setTimeout(() => process.stdout.write('\x07'), 300);
    }
    if (!id) lastBellId.current = '';
  }, [approval?.id, question?.id]);

  const wire = (msg: unknown) => {
    socketRef.current?.write(JSON.stringify(msg) + '\n');
  };

  const send = (text: string) => {
    const cmd = parseAttachCommand(text);
    if (!cmd) return;
    if (cmd.type === 'detach') {
      exit();
      return;
    }
    if (cmd.type === 'raw') {
      setRaw((r) => !r);
      return;
    }
    if (cmd.type === 'stop') {
      wire({ type: 'stop', target: cmd.target || agentRef });
      return;
    }
    // /task|/ask|/plan|/review <text> — launch agent N+1 from this terminal.
    if (cmd.type === 'spawn') {
      wire({ type: 'spawn', text: cmd.text, mode: cmd.mode });
      return;
    }
    if (cmd.type === 'send') {
      wire({ type: 'send', target: cmd.target, text: cmd.text });
      return;
    }
    wire({ type: 'input', agent: agentRef, text: cmd.text });
  };

  const st = info ? STATE_META[info.state] : null;
  const busy = info ? ['thinking', 'working', 'listening'].includes(info.state) : false;
  const terminal = info ? TERMINAL_STATES.has(info.state) : false;
  const interacting = Boolean(approval || question);
  const logs = lines.map((l) => l.log);
  const staticLines = raw ? lines : lines.filter((l) => l.log.kind !== 'llm' && !isLaunchSystemLog(l.log));
  const timelineVisibleLogs = Math.max(8, (stdout?.rows ?? 30) - 14);
  const maxTimelineScroll = Math.max(0, logs.length - timelineVisibleLogs);
  const clampedTimelineScroll = Math.min(timelineScroll, maxTimelineScroll);
  const timelineWindow = logs.slice(
    Math.max(0, logs.length - timelineVisibleLogs - clampedTimelineScroll),
    logs.length - clampedTimelineScroll,
  );
  const liveTimelineLogs = logs.slice(-Math.max(6, Math.min(14, Math.floor((stdout?.rows ?? 30) / 2))));

  useEffect(() => {
    if (timelineFollowTail) setTimelineScroll(0);
  }, [logs.length, timelineFollowTail]);

  const scrollTimeline = (direction: 'up' | 'down') => {
    if (direction === 'up') {
      setTimelineFollowTail(false);
      setTimelineScroll((s) => Math.min(Math.min(s, maxTimelineScroll) + Math.max(1, Math.floor(timelineVisibleLogs / 2)), maxTimelineScroll));
      return;
    }
    setTimelineScroll((s) => {
      const next = Math.max(0, Math.min(s, maxTimelineScroll) - Math.max(1, Math.floor(timelineVisibleLogs / 2)));
      if (next === 0) setTimelineFollowTail(true);
      return next;
    });
  };

  useInput(
    (_input, key) => {
      if (!busy || interacting || raw) return;
      if (key.pageUp) scrollTimeline('up');
      if (key.pageDown) scrollTimeline('down');
    },
    { isActive: Boolean(busy && !interacting && !raw) },
  );

  const banner = (
    <Text wrap="truncate-end">
      <Text color={UI.brand} bold>
        {t('attach.banner')}
      </Text>
      {info ? (
        <Text color={info.color} bold>
          {' '}
          {info.name}
          {info.alias && info.alias !== info.name ? <Text color={UI.muted}> @{info.alias}</Text> : null}
        </Text>
      ) : null}
    </Text>
  );

  return (
    <Box flexDirection="column">
      {!raw ? (
        <Static items={launchCards}>
          {(item) => <AttachLaunchHeader key={item.key} item={item} />}
        </Static>
      ) : null}

      <Static items={staticLines}>
        {(item) => (
          <AttachStaticLine key={item.key} item={item} raw={raw} />
        )}
      </Static>

      {!raw ? (
        <Static items={resultCards}>
          {(item) => <AttachResultCard key={item.key} item={item} />}
        </Static>
      ) : null}

      {!raw && staticLines.length > 0 ? <Text color={UI.muted}>{'─'.repeat(Math.min(Math.max(20, (stdout?.columns ?? 100) - 4), 80))}</Text> : null}

      {(busy || terminal) && info && st && !interacting ? (
        /* While running, keep the native terminal scrollback stable: activity is
         * appended once above via <Static>, and this live region stays tiny. */
        <Box flexDirection="column" marginTop={1}>
          <Text wrap="truncate-end">
            <Text color={info.color} bold>{info.alias || info.name}</Text>{' '}
            <Text color={modeBadge(info.mode).color}>[{modeBadge(info.mode).label}]</Text>{' '}
            <Text color={st.color} bold>{st.mark} {st.label}</Text>
            <Text color={UI.muted}>
              {' '}· {elapsed(info.startedAt, info.endedAt)} · {info.steps} st ·{' '}
              {Math.round((info.tokensIn + info.tokensOut) / 1000)}k ·{' '}
            </Text>
            <Text color={UI.ok}>{info.cost === null ? '$-' : fmtCost(info.cost)}</Text>
          </Text>
          {info.currentAction ? (
            <Text color={info.color} wrap="truncate-end">
              Current  {truncate(info.currentAction, 120)}
            </Text>
          ) : null}
          <ProgressSteps agent={info} max={6} cols={process.stdout.columns || 100} />
          {busy && timelineFollowTail && liveTimelineLogs.length > 0 ? (
            <Box flexDirection="column" marginTop={1}>
              <Text color={UI.muted} bold>Live activity</Text>
              <Timeline logs={liveTimelineLogs} cols={process.stdout.columns || 100} />
            </Box>
          ) : null}
          {terminal && info.lastResult ? (
            <Text color={COLOR.creamMuted}>Result was appended above; native mouse scroll stays available.</Text>
          ) : null}
          {others.length > 0 ? (
            <Text color={UI.muted} wrap="truncate-end">
              Others  {' '}
              {others
                .map((o) => `${o.name} [${stateLabel(o.state)}] ${truncate(o.currentAction || o.task, 40)}`)
                .join(' · ')}
            </Text>
          ) : null}
          {!timelineFollowTail ? (
            <Box flexDirection="column" marginTop={1}>
              <Text color={UI.warn}>Viewing older activity · ↓/PgDn to latest</Text>
              <Timeline logs={timelineWindow} cols={process.stdout.columns || 100} />
            </Box>
          ) : null}
        </Box>
      ) : (
        /* FULL panel for idle/waiting/interactions — terminal states stay compact. */
        <Box borderStyle="single" borderColor={info?.color ?? 'gray'} flexDirection="column" paddingX={1} marginTop={1}>
          {info && st ? (
            <>
              <Box justifyContent="space-between">
                <Box>
                  {banner}
                  <Text color={modeBadge(info.mode).color}> [{modeBadge(info.mode).label}]</Text>
                  <Text color={st.color} bold>
                    {' '}{st.mark} {st.label}
                  </Text>
                </Box>
                <Text color={UI.muted} wrap="truncate-end">
                  {middleTruncate(info.model, 18)} · {elapsed(info.startedAt, info.endedAt)} · {info.steps} st ·{' '}
                  {Math.round((info.tokensIn + info.tokensOut) / 1000)}k ·{' '}
                  {info.ctxPct !== undefined ? (
                    <Text color={info.ctxPct >= 90 ? UI.danger : info.ctxPct >= 70 ? UI.warn : UI.muted}>
                      {info.ctxPct}% ·{' '}
                    </Text>
                  ) : null}
                  <Text color={UI.ok}>{info.cost === null ? '$-' : fmtCost(info.cost)}</Text>
                </Text>
              </Box>
              <Text color={UI.muted} wrap="wrap">
                Task  <Text color={UI.text}>{info.task}</Text>
              </Text>
              {info.currentAction ? (
                <Text color={info.color} wrap="truncate-end">
                  Current  {truncate(info.currentAction, 160)}
                </Text>
              ) : null}
              <ProgressSteps agent={info} max={6} cols={process.stdout.columns || 100} />
              {others.length > 0 ? (
                // The session's shared awareness, visible here too: what the
                // OTHER agents are doing right now (live, same feed the agents get).
                <Text color={UI.muted} wrap="truncate-end">
                  Others  {' '}
                  {others
                    .map((o) => `${o.name} [${stateLabel(o.state)}] ${truncate(o.currentAction || o.task, 40)}`)
                    .join(' · ')}
                </Text>
              ) : null}
              {info.lastResult && (info.state === 'done' || info.state === 'error' || info.state === 'stopped') ? (
                <Box borderStyle="single" borderColor="gray" flexDirection="column" paddingX={1} marginTop={1}>
                  <Text color={UI.ok} bold>
                    Result
                  </Text>
                  <Md text={info.lastResult} />
                </Box>
              ) : null}
            </>
          ) : (
            <Text color="gray">{gone ? t('attach.gone') : t('attach.waiting', { agent: agentRef })}</Text>
          )}
          {gone && info ? <Text color={UI.danger}>{t('attach.gone')}</Text> : null}
        </Box>
      )}

      {/* Pending interaction — answerable RIGHT HERE (first answer wins vs the hub). */}
      {approval ? (
        <ApprovalPrompt
          request={{ ...approval, agentId: info?.id ?? '', resolve: noop } as ApprovalRequest}
          pendingCount={1}
          onAnswer={(id, ok, always) => {
            wire({ type: 'approve', id, approved: ok, always: !!always });
            setApproval(null);
          }}
        />
      ) : question ? (
        <QuestionPrompt
          key={question.id}
          question={{ ...question, agentId: info?.id ?? '', resolve: noop } as AgentQuestion}
          pendingCount={1}
          onAnswer={(id, answer) => {
            wire({ type: 'answer', id, text: answer });
            setQuestion(null);
          }}
        />
      ) : null}

      <Text> </Text>
      <CommandInput
        active={!gone && !interacting}
        placeholder={t('attach.placeholder', { agent: info?.name ?? agentRef })}
        context="attach"
        targetAgent={info?.name ?? agentRef}
        modelLabel={info?.model}
        agentNames={[info?.alias, info?.name, ...others.flatMap((o) => [o.alias, o.name])].filter(
          (n): n is string => Boolean(n),
        )}
        agents={info ? [info] : []}
        width={process.stdout.columns || 100}
        onIdleNavigation={busy && !raw ? scrollTimeline : undefined}
        onSubmit={send}
        onEscape={() => exit()}
      />
      <Text> </Text>
      <Box marginBottom={1}>
        <Text color={COLOR.creamMuted} wrap="truncate-end">
          {formatAttachFooter(info)}
        </Text>
      </Box>
    </Box>
  );
}
