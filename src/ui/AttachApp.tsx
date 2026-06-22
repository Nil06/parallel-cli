import React, { useEffect, useRef, useState } from 'react';
import net from 'node:net';
import { Box, Static, Text, useApp } from 'ink';
import type { AgentInfo, AgentMode, AgentQuestion, ApprovalRequest, LogEntry } from '../types.js';
import { ApprovalPrompt } from './ApprovalPrompt.js';
import { CommandInput } from './CommandInput.js';
import { formatAgentTelemetry, KIND_COLOR, KIND_DIM } from './AgentPanel.js';
import { Md } from './Md.js';
import { QuestionPrompt } from './QuestionPrompt.js';
import { Spinner } from './Spinner.js';
import { Timeline } from './Timeline.js';
import { stateLabel, elapsed, truncate } from './theme.js';
import { fmtCost } from '../pricing.js';
import { t } from '../i18n.js';
import { STATE_META, UI, middleTruncate } from './tokens.js';

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

export type AttachCommand =
  | { type: 'detach' }
  | { type: 'raw' }
  | { type: 'spawn'; text: string; mode: AgentMode }
  | { type: 'input'; text: string };

export function parseAttachCommand(text: string): AttachCommand | null {
  const v = text.trim();
  if (!v) return null;
  if (v === '/quit' || v === '/exit' || v === '/detach') return { type: 'detach' };
  if (v === '/raw') return { type: 'raw' };
  const m = v.match(/^\/(ask|a|task|t|plan|p)\s+(.+)$/s);
  if (m) {
    const mode: AgentMode = m[1] === 'ask' || m[1] === 'a' ? 'ask' : m[1] === 'plan' || m[1] === 'p' ? 'plan' : 'task';
    return { type: 'spawn', text: m[2].trim(), mode };
  }
  return { type: 'input', text: v };
}

export function formatAttachFooter(info: AgentInfo | null): string {
  if (!info) return 'Waiting for agent · /quit';
  return `${middleTruncate(info.model, 28)} · ${formatAgentTelemetry(info)} · plain text steers · /task new · /quit`;
}

export function AttachApp({ agentRef, sock }: { agentRef: string; sock: string }) {
  const { exit } = useApp();
  const [info, setInfo] = useState<AgentInfo | null>(null);
  const [others, setOthers] = useState<OtherAgent[]>([]);
  const [lines, setLines] = useState<StaticLine[]>([]);
  const [approval, setApproval] = useState<WireApproval | null>(null);
  const [question, setQuestion] = useState<WireQuestion | null>(null);
  const [gone, setGone] = useState(false);
  const [raw, setRaw] = useState(false);
  const socketRef = useRef<net.Socket | null>(null);
  const keySeq = useRef(0);
  const lastBellId = useRef('');

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
    // /task|/ask|/plan <text> — launch agent N+1 from this terminal.
    if (cmd.type === 'spawn') {
      wire({ type: 'spawn', text: cmd.text, mode: cmd.mode });
      return;
    }
    wire({ type: 'input', agent: agentRef, text: cmd.text });
  };

  const st = info ? STATE_META[info.state] : null;
  const busy = info ? ['thinking', 'working', 'listening'].includes(info.state) : false;
  const interacting = Boolean(approval || question);

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
      {raw ? (
        <Static items={lines}>
          {(item) => (
            <Text
              key={item.key}
              color={KIND_COLOR[item.log.kind] ?? 'white'}
              italic={KIND_DIM[item.log.kind] ?? false}
              wrap="wrap"
            >
              {item.log.text}
            </Text>
          )}
        </Static>
      ) : null}

      {busy && info && st && !interacting ? (
        /* COMPACT region while the agent runs: small + borderless, so Ink's
         * constant repaints (spinner ticks) never erase tall zones — this is
         * what used to leave stray blank lines in the native scrollback. */
        <Box flexDirection="column" marginTop={1}>
          <Text wrap="truncate-end">
            <Text color={info.color} bold>{info.alias || info.name}</Text>{' '}
            <Text color={st.color} bold>{st.mark} {st.label}</Text>{' '}
            <Spinner color={info.color} />
            <Text color={UI.muted}>
              {' '}· {elapsed(info.startedAt)} · {info.steps} st ·{' '}
              {Math.round((info.tokensIn + info.tokensOut) / 1000)}k ·{' '}
            </Text>
            <Text color={UI.ok}>{info.cost === null ? '$-' : fmtCost(info.cost)}</Text>
          </Text>
          {info.currentAction ? (
            <Text color={info.color} wrap="truncate-end">
              Current  {truncate(info.currentAction, 120)}
            </Text>
          ) : null}
          {others.length > 0 ? (
            <Text color={UI.muted} wrap="truncate-end">
              Others  {' '}
              {others
                .map((o) => `${o.name} [${stateLabel(o.state)}] ${truncate(o.currentAction || o.task, 40)}`)
                .join(' · ')}
            </Text>
          ) : null}
          {!raw ? (
            <Box flexDirection="column" marginTop={1}>
              <Text color={UI.muted} bold>
                {t('timeline.activity')}
              </Text>
              <Timeline logs={lines.map((l) => l.log)} />
            </Box>
          ) : null}
        </Box>
      ) : (
        /* FULL panel when idle / waiting / done — repaints are rare here. */
        <Box borderStyle="single" borderColor={info?.color ?? 'gray'} flexDirection="column" paddingX={1} marginTop={1}>
          {info && st ? (
            <>
              <Box justifyContent="space-between">
                <Box>
                  {banner}
                  <Text color={st.color} bold>
                    {' '}{st.mark} {st.label}
                  </Text>
                </Box>
                <Text color={UI.muted} wrap="truncate-end">
                  {middleTruncate(info.model, 18)} · {elapsed(info.startedAt)} · {info.steps} st ·{' '}
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
              {!raw ? (
                <Box flexDirection="column" marginTop={1}>
                  <Text color={UI.muted} bold>
                    {t('timeline.activity')}
                  </Text>
                  <Timeline logs={lines.map((l) => l.log)} />
                </Box>
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

      <CommandInput
        active={!gone && !interacting}
        placeholder={t('attach.placeholder', { agent: info?.name ?? agentRef })}
        onSubmit={send}
        onEscape={() => exit()}
      />
      <Box marginTop={1} marginBottom={1}>
        <Text color="yellowBright" wrap="truncate-end">
          {formatAttachFooter(info)}
        </Text>
      </Box>
    </Box>
  );
}
