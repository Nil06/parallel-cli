import React, { useState } from 'react';
import { Box, Text, useInput, useStdout } from 'ink';
import * as Diff from 'diff';
import { Blackboard } from '../coordination/blackboard.js';
import { COMMANDS } from '../commands.js';
import { Controller } from '../controller.js';
import { fmtCost } from '../pricing.js';
import { STATE_LABEL, stateLabel, truncate } from './theme.js';
import { t } from '../i18n.js';
import type { Skill, Specialist } from '../types.js';

/**
 * PgUp/PgDn window over a list — the TUI runs in the alternate screen, so
 * every long view needs its own scrolling. `anchor` decides what you see
 * first: 'top' (docs like /help) or 'bottom' (live feeds like /notes).
 */
function useScrollWindow<T>(items: T[], visible: number, anchor: 'top' | 'bottom' = 'top') {
  const [scroll, setScroll] = useState(0);
  const max = Math.max(0, items.length - visible);
  const s = Math.min(scroll, max);
  const step = Math.max(1, visible - 1);
  useInput((_input, key) => {
    const towardsAnchor = (v: number) => Math.max(0, Math.min(v, max) - step);
    const awayFromAnchor = (v: number) => Math.min(Math.min(v, max) + step, max);
    if (anchor === 'top') {
      if (key.pageDown) setScroll(awayFromAnchor);
      if (key.pageUp) setScroll(towardsAnchor);
    } else {
      if (key.pageUp) setScroll(awayFromAnchor);
      if (key.pageDown) setScroll(towardsAnchor);
    }
  });
  const start = anchor === 'top' ? s : Math.max(0, items.length - visible - s);
  const slice = items.slice(start, start + visible);
  return { slice, above: start, below: Math.max(0, items.length - start - slice.length) };
}

const Above = ({ n }: { n: number }) => (n > 0 ? <Text color="gray">▲ {n} · PgUp</Text> : null);
const Below = ({ n }: { n: number }) => (n > 0 ? <Text color="gray">▼ {n} · PgDn</Text> : null);

/** Usable rows for a view's list, from the REAL terminal height. */
function useVisibleRows(overhead: number, min = 6): number {
  const { stdout } = useStdout();
  return Math.max(min, (stdout?.rows ?? 30) - overhead);
}

export function BoardView({ board }: { board: Blackboard }) {
  const agents = [...board.agents.values()];
  const activities = [...board.fileActivity.values()].sort((a, b) => b.ts - a.ts).slice(0, 12);
  return (
    <Box borderStyle="round" borderColor="yellow" flexDirection="column" paddingX={1}>
      <Text bold color="yellow">
        {t('board.title')}
      </Text>
      <Text bold>{t('board.agents')}</Text>
      {agents.length === 0 ? (
        <Text color="gray"> {t('board.none')}</Text>
      ) : (
        agents.map((a) => (
          <Text key={a.id} wrap="truncate-end">
            {'  '}
            <Text color={a.color} bold>
              {a.name}
            </Text>
            <Text color={STATE_LABEL[a.state].color}>
              {' '}
              {STATE_LABEL[a.state].icon} {stateLabel(a.state)}
            </Text>
            <Text color="gray"> {truncate(a.currentAction || a.task, 110)}</Text>
          </Text>
        ))
      )}
      <Text bold>{t('board.activity')}</Text>
      {activities.length === 0 ? (
        <Text color="gray"> {t('board.noActivity')}</Text>
      ) : (
        activities.map((act) => (
          <Text key={act.path} wrap="truncate-end">
            {'  '}✏ {act.path} <Text color="gray">— {act.agentName} ({act.op}, {Math.round((Date.now() - act.ts) / 1000)}s)</Text>
          </Text>
        ))
      )}
      <Text bold>{t('board.notes')}</Text>
      {board.notes.slice(-8).map((n) => (
        <Text key={n.id} wrap="truncate-end">
          {'  '}
          <Text color="magenta">
            {n.from} → {n.to}
          </Text>
          <Text>: {truncate(n.content, 140)}</Text>
        </Text>
      ))}
    </Box>
  );
}

export function NotesView({ board }: { board: Blackboard }) {
  const visible = useVisibleRows(7);
  const { slice, above, below } = useScrollWindow(board.notes, visible, 'bottom');
  return (
    <Box borderStyle="round" borderColor="magenta" flexDirection="column" paddingX={1}>
      <Text bold color="magenta">
        {t('notes.title')}
      </Text>
      {board.notes.length === 0 ? (
        <Text color="gray">{t('notes.empty')}</Text>
      ) : (
        <>
          <Above n={above} />
          {slice.map((n) => (
            <Text key={n.id} wrap="truncate-end">
              <Text color="gray">{new Date(n.ts).toLocaleTimeString()} </Text>
              <Text color="magenta" bold>
                {n.from}
              </Text>
              <Text color="gray"> → {n.to}: </Text>
              <Text>{truncate(n.content, 200)}</Text>
            </Text>
          ))}
          <Below n={below} />
        </>
      )}
    </Box>
  );
}

export function DiffView({ board }: { board: Blackboard }) {
  // Each change renders up to ~33 rows (header + 30 patch lines + spacing):
  // window over WHOLE history, newest first, PgUp to walk back in time.
  const rows = useVisibleRows(8, 18);
  const perChange = Math.max(1, Math.floor(rows / 34));
  const { slice: changes, above, below } = useScrollWindow(board.changes, perChange, 'bottom');
  return (
    <Box borderStyle="round" borderColor="green" flexDirection="column" paddingX={1}>
      <Text bold color="green">
        {t('diff.title', { total: board.changes.length })}
      </Text>
      {board.changes.length === 0 ? (
        <Text color="gray">{t('diff.empty')}</Text>
      ) : (
        <>
        <Above n={above} />
        {changes.map((c) => {
          const patch = Diff.createPatch(c.path, c.before, c.after, '', '', { context: 2 });
          const lines = patch.split('\n').slice(4, 34);
          return (
            <Box key={c.id} flexDirection="column" marginTop={1}>
              <Text bold>
                <Text color="cyan">{c.path}</Text>
                <Text color="gray">
                  {' '}
                  {t('diff.by', { agent: c.agentName, time: new Date(c.ts).toLocaleTimeString() })}
                </Text>
              </Text>
              {lines.map((l, i) => (
                <Text
                  key={i}
                  color={l.startsWith('+') ? 'green' : l.startsWith('-') ? 'red' : l.startsWith('@') ? 'cyan' : 'gray'}
                  wrap="truncate-end"
                >
                  {l || ' '}
                </Text>
              ))}
              {patch.split('\n').length > 38 ? <Text color="gray">{t('diff.trunc')}</Text> : null}
            </Box>
          );
        })}
        <Below n={below} />
        </>
      )}
    </Box>
  );
}

/** Financial view: live cost / steps / tokens per agent + session total. */
export function CostView({ board }: { board: Blackboard }) {
  const agents = [...board.agents.values()];
  const total = agents.reduce((s, a) => s + (a.cost ?? 0), 0);
  const unknown = agents.some((a) => a.cost === null);
  return (
    <Box borderStyle="round" borderColor="greenBright" flexDirection="column" paddingX={1}>
      <Text bold color="greenBright">
        {t('cost.title')}
      </Text>
      {agents.length === 0 ? (
        <Text color="gray">{t('cost.empty')}</Text>
      ) : (
        <>
          {agents.map((a) => (
            <Text key={a.id} wrap="truncate-end">
              {'  '}
              <Text color={a.color} bold>
                {a.name.padEnd(12)}
              </Text>
              <Text color="gray">{a.model.padEnd(24).slice(0, 24)} </Text>
              <Text>{String(a.steps).padStart(3)} steps </Text>
              <Text color="cyan">
                {String(Math.round(a.tokensIn / 1000)).padStart(5)}k in {String(Math.round(a.tokensOut / 1000)).padStart(4)}k out{' '}
              </Text>
              <Text color="greenBright" bold>
                {a.cost === null ? '   $—' : fmtCost(a.cost).padStart(8)}
              </Text>
              {a.cost === null ? <Text color="gray"> {t('cost.unknown')}</Text> : null}
            </Text>
          ))}
          <Text> </Text>
          <Text bold>
            {'  '}
            {t('cost.total')} <Text color="greenBright">{fmtCost(total)}</Text>
            {unknown ? <Text color="gray"> {t('cost.partial')}</Text> : null}
          </Text>
        </>
      )}
      <Text color="gray">{t('cost.hint')}</Text>
    </Box>
  );
}

/** Skills catalog: user-authored markdown instructions agents can load. */
export function SkillsView({ skills }: { skills: Skill[] }) {
  return (
    <Box borderStyle="round" borderColor="blueBright" flexDirection="column" paddingX={1}>
      <Text bold color="blueBright">
        {t('skills.title')}
      </Text>
      {skills.length === 0 ? (
        <Text color="gray">{t('skills.empty')}</Text>
      ) : (
        skills.map((s) => (
          <Text key={s.file} wrap="truncate-end">
            {'  '}
            <Text color="blueBright" bold>
              #{s.name.padEnd(16)}
            </Text>
            <Text color={s.scope === 'global' ? 'yellow' : 'green'}>[{s.scope}] </Text>
            <Text color="gray">{truncate(s.description || s.file, 100)}</Text>
          </Text>
        ))
      )}
      <Text> </Text>
      <Text color="gray">{t('skills.hint1')}</Text>
      <Text color="gray">{t('skills.hint2')}</Text>
    </Box>
  );
}

/** Specialists catalog: personas (role + optional pinned model). */
export function SpecialistsView({ specialists }: { specialists: Specialist[] }) {
  return (
    <Box borderStyle="round" borderColor="magentaBright" flexDirection="column" paddingX={1}>
      <Text bold color="magentaBright">
        {t('spec.title')}
      </Text>
      {specialists.length === 0 ? (
        <Text color="gray">{t('spec.empty')}</Text>
      ) : (
        specialists.map((s) => (
          <Text key={s.file} wrap="truncate-end">
            {'  '}
            <Text color="magentaBright" bold>
              🎓{s.name.padEnd(16)}
            </Text>
            <Text color={s.scope === 'global' ? 'yellow' : 'green'}>[{s.scope}] </Text>
            {s.model ? <Text color="cyan">{s.model} </Text> : null}
            <Text color="gray">{truncate(s.description || s.file, 90)}</Text>
          </Text>
        ))
      )}
      <Text> </Text>
      <Text color="gray">{t('spec.hint1')}</Text>
      <Text color="gray">{t('spec.hint2')}</Text>
    </Box>
  );
}

/** Saved sessions: inspect available restore points; restore via /session. */
export function SessionsView({ projectRoot }: { projectRoot: string }) {
  const sessions = Controller.listSessions(projectRoot);
  return (
    <Box borderStyle="round" borderColor="yellow" flexDirection="column" paddingX={1}>
      <Text bold color="yellow">
        {t('sessions.title')}
      </Text>
      {sessions.length === 0 ? (
        <Text color="gray">{t('sessions.empty')}</Text>
      ) : (
        sessions.map((s, i) => (
          <Text key={s.file} wrap="truncate-end">
            {'  '}
            <Text color="yellow" bold>
              {String(i + 1).padStart(2)}.
            </Text>{' '}
            <Text>{t('sessions.item', { date: new Date(s.data.savedAt).toLocaleString(), agents: s.data.agents.length })}</Text>
            <Text color="gray"> {s.data.agents.map((a) => a.name).join(', ').slice(0, 80)}</Text>
          </Text>
        ))
      )}
      <Text> </Text>
      <Text color="gray">{t('sessions.hint')}</Text>
    </Box>
  );
}

export function HelpView() {
  // Intro (4) + title + blank lines (2) + footer (2) + border/input/status ≈ 16 rows of overhead.
  const visible = useVisibleRows(16);
  const { slice, above, below } = useScrollWindow(COMMANDS, visible, 'top');
  return (
    <Box borderStyle="round" borderColor="cyan" flexDirection="column" paddingX={1}>
      <Text bold color="cyan">
        {t('help.title')}
      </Text>
      <Text wrap="truncate-end">
        <Text bold>{t('help.l1a')}</Text>
        {t('help.l1b')}
        <Text bold>{t('help.l1c')}</Text>.
      </Text>
      <Text wrap="truncate-end">
        <Text bold>{t('help.l2a')}</Text>
        {t('help.l2b')}
        <Text bold>{t('help.l2c')}</Text>
        {t('help.l2d')}
      </Text>
      <Text wrap="truncate-end">{t('help.l3')}</Text>
      <Text> </Text>
      <Above n={above} />
      {slice.map((c) => (
        <Text key={c.name} wrap="truncate-end">
          <Text color="cyan" bold>
            {c.name.padEnd(18)}
          </Text>
          <Text color="yellow">{c.args.padEnd(24)}</Text>
          <Text color="gray">
            {t(c.descKey)}
            {c.aliases?.length ? ` (= ${c.aliases.join(', ')})` : ''}
          </Text>
        </Text>
      ))}
      <Below n={below} />
      <Text> </Text>
      <Text color="gray" wrap="truncate-end">{t('help.states')}</Text>
      <Text color="gray" wrap="truncate-end">{t('help.keys')}</Text>
    </Box>
  );
}
