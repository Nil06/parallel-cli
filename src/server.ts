import net from 'node:net';
import fs from 'node:fs';
import path from 'node:path';
import type { Controller } from './controller.js';
import type { AgentInfo, AgentMode, LogEntry } from './types.js';

/**
 * Session server — the bridge that makes MULTI-TERMINAL Parallel possible.
 *
 * The main TUI starts a tiny server on a Unix socket (.parallel/session.sock).
 * Each `parallel attach <agent>` opens its own terminal, connects to the
 * socket and receives a live stream of that agent's state + log lines.
 * Typed input in the attached terminal is routed back to the agent as a
 * real-time instruction — exactly like `@a1 <message>` in the main TUI.
 *
 * Protocol (newline-delimited JSON):
 *   client → server  {type:'hello', agent}          subscribe to one agent
 *   client → server  {type:'input', agent, text}    steer the agent
 *   client → server  {type:'send', target, text}    steer one agent or broadcast
 *   client → server  {type:'stop', target}          stop one agent or all
 *   client → server  {type:'spawn', text, mode?}    launch agent N+1 from ANY terminal
 *   client → server  {type:'approve', id, approved, always}  answer an approval
 *   client → server  {type:'answer', id, text}      answer an agent question
 *   server → client  {type:'state', info, others, logs, approval?, question?}
 *                    throttled ≈120ms; `logs` only contains lines newer than
 *                    what this client has already received (per-connection
 *                    lastSeq). `approval`/`question` are the agent's PENDING
 *                    interaction, if any — answerable from the hub OR here
 *                    (first answer wins, controller guards by id).
 *   server → client  {type:'bye'}                   session is closing
 */

interface AttachedClient {
  socket: net.Socket;
  agent: string; // name or alias, as given by the client
  lastSeq: number;
}

export function socketPath(projectRoot: string): string {
  return path.join(projectRoot, '.parallel', 'session.sock');
}

/** Start the session server. Returns a stop function (closes socket + clients). */
export function startSessionServer(ctl: Controller): (() => void) | null {
  const sock = socketPath(ctl.projectRoot);
  try {
    fs.mkdirSync(path.dirname(sock), { recursive: true });
    // A previous run may have crashed without cleaning up: remove the stale socket.
    if (fs.existsSync(sock)) fs.unlinkSync(sock);
  } catch {
    return null;
  }

  const clients = new Set<AttachedClient>();

  const infoFor = (ref: string): AgentInfo | undefined => ctl.board.getAgentByName(ref);
  const spawnMode = (mode: unknown): AgentMode => (mode === 'ask' || mode === 'plan' || mode === 'task' ? mode : 'task');

  const send = (socket: net.Socket, msg: unknown): void => {
    try {
      socket.write(JSON.stringify(msg) + '\n');
    } catch {
      /* client gone — cleaned up on 'close' */
    }
  };

  const pushTo = (c: AttachedClient): void => {
    const info = infoFor(c.agent);
    if (!info) {
      send(c.socket, { type: 'state', info: null, others: [], logs: [] });
      return;
    }
    const fresh: LogEntry[] = [];
    for (const l of ctl.board.logs) {
      if ((l.seq ?? 0) > c.lastSeq && (l.agentId === info.id || l.agentId === '')) fresh.push(l);
    }
    if (fresh.length > 0) c.lastSeq = fresh[fresh.length - 1].seq ?? c.lastSeq;
    // Shared awareness, made VISIBLE: every attached terminal also sees what
    // the other agents are doing right now (same data the agents receive).
    const others = [...ctl.board.agents.values()]
      .filter((a) => a.id !== info.id)
      .map((a) => ({ name: a.name, alias: a.alias, state: a.state, task: a.task, currentAction: a.currentAction }));
    // Pending interaction for THIS agent (if any): the attached terminal can
    // answer it directly — no need to switch back to the hub.
    const appr = ctl.approvals.find((a) => a.agentId === info.id);
    const q = ctl.questions.find((x) => x.agentId === info.id);
    const approval = appr ? { id: appr.id, agentName: appr.agentName, command: appr.command } : undefined;
    const question = q
      ? { id: q.id, agentName: q.agentName, question: q.question, options: q.options, recommended: q.recommended }
      : undefined;
    send(c.socket, { type: 'state', info, others, logs: fresh, approval, question });
  };

  // Throttled broadcast: at most one push per ~120ms, on blackboard updates.
  let pending = false;
  const onUpdate = (): void => {
    if (pending || clients.size === 0) return;
    pending = true;
    setTimeout(() => {
      pending = false;
      for (const c of clients) pushTo(c);
    }, 120).unref?.();
  };
  ctl.on('update', onUpdate);

  const server = net.createServer((socket) => {
    const client: AttachedClient = { socket, agent: '', lastSeq: 0 };
    let buffer = '';
    socket.setEncoding('utf8');
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
        if (msg.type === 'hello' && typeof msg.agent === 'string') {
          client.agent = msg.agent;
          clients.add(client);
          pushTo(client); // immediate first snapshot (full backlog: lastSeq = 0)
        } else if (msg.type === 'input' && typeof msg.text === 'string' && client.agent) {
          const text = msg.text.trim();
          if (!text) continue;
          if (!ctl.sendToAgent(client.agent, text)) {
            send(socket, { type: 'state', info: infoFor(client.agent) ?? null, others: [], logs: [] });
          }
        } else if (msg.type === 'approve' && typeof msg.id === 'number') {
          // First answer wins (hub or any attached terminal) — the controller
          // ignores answers for ids that are no longer pending.
          ctl.answerApproval(msg.id, !!msg.approved, !!msg.always);
        } else if (msg.type === 'answer' && typeof msg.id === 'number' && typeof msg.text === 'string') {
          ctl.answerQuestion(msg.id, msg.text);
        } else if (msg.type === 'send' && typeof msg.target === 'string' && typeof msg.text === 'string') {
          const text = msg.text.trim();
          const target = msg.target.trim();
          if (!text || !target) continue;
          if (target.toLowerCase() === 'all') ctl.broadcast(text);
          else ctl.sendToAgent(target, text);
        } else if (msg.type === 'stop' && typeof msg.target === 'string') {
          const target = msg.target.trim();
          if (!target) continue;
          if (target.toLowerCase() === 'all') ctl.stopAll();
          else ctl.stopAgent(target);
        } else if (msg.type === 'spawn' && typeof msg.text === 'string') {
          // Agent N+1 can be launched from ANY terminal of the session —
          // its own dedicated terminal then opens automatically.
          const task = msg.text.trim();
          if (task) ctl.spawnAgent(task, undefined, undefined, undefined, undefined, undefined, spawnMode(msg.mode));
        }
      }
    });
    const drop = (): void => {
      clients.delete(client);
    };
    socket.on('close', drop);
    socket.on('error', drop);
  });

  try {
    server.listen(sock);
  } catch {
    return null;
  }
  server.on('error', () => {
    /* keep the TUI alive even if the server dies */
  });

  return () => {
    ctl.off('update', onUpdate);
    for (const c of clients) {
      send(c.socket, { type: 'bye' });
      c.socket.destroy();
    }
    clients.clear();
    server.close();
    try {
      fs.unlinkSync(sock);
    } catch {
      /* already gone */
    }
  };
}
