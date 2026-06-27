import React, { useEffect, useState } from 'react';
import { Box, Text, useInput, useStdout } from 'ink';
import { Blackboard } from '../coordination/blackboard.js';
import { sortCommandsForPalette, visibleCommands } from '../commands.js';
import { Controller } from '../controller.js';
import { fmtCost } from '../pricing.js';
import { STATE_LABEL, stateLabel, truncate } from './theme.js';
import { t } from '../i18n.js';
import type { Skill, Specialist } from '../types.js';
import { BRAND, COLOR } from './tokens.js';
import { DiffPatch } from './DiffPatch.js';

function clampIndex(index: number, count: number): number {
  if (count <= 0) return 0;
  return Math.max(0, Math.min(index, count - 1));
}

function useSelectableIndex(count: number, pageSize: number) {
  const [selected, setSelected] = useState(0);
  const safeSelected = clampIndex(selected, count);
  useEffect(() => {
    if (safeSelected !== selected) setSelected(safeSelected);
  }, [safeSelected, selected]);
  const step = Math.max(1, pageSize - 1);
  useInput((_input, key) => {
    if (key.downArrow) setSelected((i) => clampIndex(i + 1, count));
    if (key.upArrow) setSelected((i) => clampIndex(i - 1, count));
    if (key.pageDown) setSelected((i) => clampIndex(i + step, count));
    if (key.pageUp) setSelected((i) => clampIndex(i - step, count));
  });
  return safeSelected;
}

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
    const towardsAnchor = (v: number, amount = step) => Math.max(0, Math.min(v, max) - amount);
    const awayFromAnchor = (v: number, amount = step) => Math.min(Math.min(v, max) + amount, max);
    if (anchor === 'top') {
      if (key.pageDown) setScroll(awayFromAnchor);
      if (key.pageUp) setScroll(towardsAnchor);
      if (key.downArrow) setScroll((v) => awayFromAnchor(v, 1));
      if (key.upArrow) setScroll((v) => towardsAnchor(v, 1));
    } else {
      if (key.pageUp) setScroll(awayFromAnchor);
      if (key.pageDown) setScroll(towardsAnchor);
      if (key.upArrow) setScroll((v) => awayFromAnchor(v, 1));
      if (key.downArrow) setScroll((v) => towardsAnchor(v, 1));
    }
  });
  const start = anchor === 'top' ? s : Math.max(0, items.length - visible - s);
  const slice = items.slice(start, start + visible);
  return { slice, above: start, below: Math.max(0, items.length - start - slice.length) };
}

const Above = ({ n }: { n: number }) => (n > 0 ? <Text color="gray">▲ {n} · PgUp</Text> : null);
const Below = ({ n }: { n: number }) => (n > 0 ? <Text color="gray">▼ {n} · PgDn</Text> : null);

function shortTime(ts: number): string {
  const seconds = Math.max(0, Math.round((Date.now() - ts) / 1000));
  if (seconds < 60) return t('board.secondsAgo', { n: seconds });
  const minutes = Math.round(seconds / 60);
  return t('board.minutesAgo', { n: minutes });
}

/** Usable rows for a view's list, from the REAL terminal height. */
function useVisibleRows(overhead: number, min = 6): number {
  const { stdout } = useStdout();
  return Math.max(min, (stdout?.rows ?? 30) - overhead);
}

export function BoardView({ board, bodyHeight }: { board: Blackboard; bodyHeight?: number }) {
  const agents = [...board.agents.values()];
  const fallbackVisible = useVisibleRows(12);
  const visibleAgents = bodyHeight ? Math.max(1, Math.floor((bodyHeight - 10) / 3)) : fallbackVisible;
  const { slice: agentSlice, above, below } = useScrollWindow(agents, visibleAgents, 'top');
  const sideRows = bodyHeight ? Math.max(1, Math.floor((bodyHeight - visibleAgents - 8) / 2)) : 8;
  const activities = [...board.fileActivity.values()].sort((a, b) => b.ts - a.ts).slice(0, sideRows);
  const notes = board.notes.slice(-sideRows);
  const warnings = board.workMapWarnings.slice(-Math.max(2, Math.min(4, sideRows)));
  return (
    <Box borderStyle="round" borderColor={BRAND.muted} flexDirection="column" paddingX={1}>
      <Text bold color={BRAND.primary}>
        {t('board.title')}
      </Text>
      <Text bold color={warnings.length > 0 ? COLOR.cream : BRAND.primary}>{t('board.workMap')}</Text>
      {warnings.length > 0 ? (
        warnings.map((w) => (
          <Box key={w.id} flexDirection="column">
            <Text wrap="truncate-end">
              {'  '}
              <Text color={w.level === 'conflict' ? 'redBright' : 'yellow'}>{w.level === 'conflict' ? '!' : '⚠'} </Text>
              <Text color={BRAND.primary}>{w.title}</Text>
              <Text color="gray"> — {truncate(w.detail, 100)}</Text>
            </Text>
            <Text color="gray" wrap="truncate-end">
              {'    '}
              {t('board.warningMeta', {
                agents: w.agentNames.join(', ') || 'agents',
                paths: w.paths.join(', ') || 'paths',
                time: shortTime(w.ts),
              })}
            </Text>
          </Box>
        ))
      ) : (
        <Text color="gray"> {t('board.workMapOk')}</Text>
      )}
      {warnings.length > 0 ? <Text color={COLOR.creamMuted}>  {t('board.warningSuggestion')}</Text> : null}
      <Text bold>{t('board.agents')}</Text>
      {agents.length === 0 ? (
        <Text color="gray"> {t('board.none')}</Text>
      ) : (
        <>
        <Above n={above} />
        {agentSlice.map((a) => (
          <Text key={a.id} wrap="truncate-end">
            {'  '}
            <Text color={a.color} bold>
              {a.name}
            </Text>
            <Text color={STATE_LABEL[a.state].color}>
              {' '}
              {STATE_LABEL[a.state].icon} {stateLabel(a.state)}
            </Text>
            <Text color="gray"> {truncate(a.currentAction || a.task, 80)}</Text>
            {a.claims && a.claims.length > 0 ? <Text color={COLOR.cream}> · ⚑ {truncate(a.claims.join(', '), 45)}</Text> : null}
          </Text>
        ))}
        <Below n={below} />
        </>
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
      {notes.map((n) => (
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

export function NotesView({ board, bodyHeight }: { board: Blackboard; bodyHeight?: number }) {
  const fallbackVisible = useVisibleRows(7);
  const visible = bodyHeight ? Math.max(3, bodyHeight - 4) : fallbackVisible;
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

export function DiffView({ board, bodyHeight }: { board: Blackboard; bodyHeight?: number }) {
  // Each change renders up to ~33 rows (header + 30 patch lines + spacing):
  // window over WHOLE history, newest first, PgUp to walk back in time.
  const fallbackRows = useVisibleRows(8, 18);
  const rows = bodyHeight ? Math.max(8, bodyHeight - 4) : fallbackRows;
  const perChange = Math.max(1, Math.floor(rows / 34));
  const { slice: changes, above, below } = useScrollWindow(board.changes, perChange, 'bottom');
  const warnings = board.workMapWarnings.filter((w) => w.level !== 'info').slice(-2);
  return (
    <Box borderStyle="round" borderColor="green" flexDirection="column" paddingX={1}>
      <Text bold color="green">
        {t('diff.title', { total: board.changes.length })}
      </Text>
      {warnings.map((w) => (
        <Text key={w.id} color={w.level === 'conflict' ? 'redBright' : 'yellow'} wrap="truncate-end">
          ⚠ {w.title}: {truncate(w.paths.join(', ') || w.detail, 110)}
        </Text>
      ))}
      {board.changes.length === 0 ? (
        <Text color="gray">{t('diff.empty')}</Text>
      ) : (
        <>
        <Above n={above} />
        {changes.map((c) => (
            <Box key={c.id} flexDirection="column" marginTop={1}>
              <Text bold>
                <Text color={BRAND.primary}>{c.path}</Text>
                <Text color="gray">
                  {' '}
                  {t('diff.by', { agent: c.agentName, time: new Date(c.ts).toLocaleTimeString() })}
                </Text>
              </Text>
              <DiffPatch change={c} maxLines={30} context={2} />
            </Box>
        ))}
        <Below n={below} />
        </>
      )}
    </Box>
  );
}

/** Financial view: live cost / steps / tokens per agent + session total. */
export function CostView({ ctl, bodyHeight }: { ctl: Controller; bodyHeight?: number }) {
  const board = ctl.board;
  const agents = [...board.agents.values()];
  const fallbackVisible = useVisibleRows(8);
  const visible = bodyHeight ? Math.max(3, bodyHeight - 7) : fallbackVisible;
  const { slice, above, below } = useScrollWindow(agents, visible, 'top');
  const total = agents.reduce((s, a) => s + (a.cost ?? 0), 0);
  const memory = ctl.projectContextStatus();
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
          <Above n={above} />
          {slice.map((a) => (
            <Text key={a.id} wrap="truncate-end">
              {'  '}
              <Text color={a.color} bold>
                {a.name.padEnd(12)}
              </Text>
              <Text color="gray">{a.model.padEnd(24).slice(0, 24)} </Text>
              <Text color="gray">{(a.profile ?? 'standard').padEnd(8)} </Text>
              <Text>{String(a.steps).padStart(3)} steps </Text>
              <Text color={BRAND.primary}>
                {String(Math.round(a.tokensIn / 1000)).padStart(5)}k in {String(Math.round(a.tokensOut / 1000)).padStart(4)}k out{' '}
              </Text>
              <Text color="greenBright" bold>
                {a.cost === null ? '   $—' : fmtCost(a.cost).padStart(8)}
              </Text>
              {a.cost === null ? <Text color="gray"> {t('cost.unknown')}</Text> : null}
            </Text>
          ))}
          <Below n={below} />
          <Text> </Text>
          <Text bold>
            {'  '}
            {t('cost.total')} <Text color="greenBright">{fmtCost(total)}</Text>
            {unknown ? <Text color="gray"> {t('cost.partial')}</Text> : null}
          </Text>
        </>
      )}
      <Text>
        {'  '}{t('cost.memory')} <Text color={BRAND.primary}>{memory.model ?? '—'}</Text>{' '}
        <Text color="greenBright">{memory.cost === null ? '$—' : fmtCost(memory.cost)}</Text>{' '}
        <Text color="gray">({memory.status}, {memory.tokensIn + memory.tokensOut} tokens)</Text>
      </Text>
      <Text color="gray">{t('cost.hint')}</Text>
    </Box>
  );
}

/** Skills catalog: user-authored markdown instructions agents can load. */
export function SkillsView({ skills, bodyHeight }: { skills: Skill[]; bodyHeight?: number }) {
  const fallbackVisible = useVisibleRows(8);
  const visible = bodyHeight ? Math.max(3, bodyHeight - 6) : fallbackVisible;
  const { slice, above, below } = useScrollWindow(skills, visible, 'top');
  return (
    <Box borderStyle="round" borderColor={BRAND.muted} flexDirection="column" paddingX={1}>
      <Text bold color={BRAND.primary}>
        {t('skills.title')}
      </Text>
      {skills.length === 0 ? (
        <Text color="gray">{t('skills.empty')}</Text>
      ) : (
        <>
        <Above n={above} />
        {slice.map((s) => (
          <Text key={s.file} wrap="truncate-end">
            {'  '}
            <Text color={BRAND.primary} bold>
              #{s.name.padEnd(16)}
            </Text>
            <Text color={s.scope === 'global' ? 'yellow' : 'green'}>[{s.scope}] </Text>
            <Text color="gray">{truncate(s.description || s.file, 100)}</Text>
          </Text>
        ))}
        <Below n={below} />
        </>
      )}
      <Text> </Text>
      <Text color="gray">{t('skills.hint1')}</Text>
      <Text color="gray">{t('skills.hint2')}</Text>
    </Box>
  );
}

/** Specialists catalog: personas (role + optional pinned model). */
export function SpecialistsView({ specialists, bodyHeight }: { specialists: Specialist[]; bodyHeight?: number }) {
  const fallbackVisible = useVisibleRows(8);
  const visible = bodyHeight ? Math.max(3, bodyHeight - 6) : fallbackVisible;
  const { slice, above, below } = useScrollWindow(specialists, visible, 'top');
  return (
    <Box borderStyle="round" borderColor="magentaBright" flexDirection="column" paddingX={1}>
      <Text bold color="magentaBright">
        {t('spec.title')}
      </Text>
      {specialists.length === 0 ? (
        <Text color="gray">{t('spec.empty')}</Text>
      ) : (
        <>
        <Above n={above} />
        {slice.map((s) => (
          <Text key={s.file} wrap="truncate-end">
            {'  '}
            <Text color="magentaBright" bold>
              🎓{s.name.padEnd(16)}
            </Text>
            <Text color={s.scope === 'global' ? 'yellow' : 'green'}>[{s.scope}] </Text>
            {s.model ? <Text color={BRAND.primary}>{s.model} </Text> : null}
            <Text color="gray">{truncate(s.description || s.file, 90)}</Text>
          </Text>
        ))}
        <Below n={below} />
        </>
      )}
      <Text> </Text>
      <Text color="gray">{t('spec.hint1')}</Text>
      <Text color="gray">{t('spec.hint2')}</Text>
    </Box>
  );
}

/** Saved sessions: inspect available restore points; restore via /session. */
export function SessionsView({ projectRoot, bodyHeight }: { projectRoot: string; bodyHeight?: number }) {
  const sessions = Controller.listSessions(projectRoot);
  const fallbackVisible = useVisibleRows(7);
  const visible = bodyHeight ? Math.max(3, bodyHeight - 5) : fallbackVisible;
  const { slice, above, below } = useScrollWindow(sessions, visible, 'top');
  return (
    <Box borderStyle="round" borderColor="yellow" flexDirection="column" paddingX={1}>
      <Text bold color="yellow">
        {t('sessions.title')}
      </Text>
      {sessions.length === 0 ? (
        <Text color="gray">{t('sessions.empty')}</Text>
      ) : (
        <>
        <Above n={above} />
        {slice.map((s, i) => (
          <Text key={s.file} wrap="truncate-end">
            {'  '}
            <Text color="yellow" bold>
              {String(sessions.indexOf(s) + 1).padStart(2)}.
            </Text>{' '}
            <Text>
              {t('sessions.item', {
                name: s.data.name ? `${s.data.name} · ` : '',
                date: new Date(s.data.savedAt).toLocaleString(),
                agents: s.data.agents.length,
              })}
            </Text>
            <Text color="gray"> {s.data.agents.map((a) => a.name).join(', ').slice(0, 80)}</Text>
          </Text>
        ))}
        <Below n={below} />
        </>
      )}
      <Text> </Text>
      <Text color="gray">{t('sessions.hint')}</Text>
    </Box>
  );
}

export function HelpView({ bodyHeight, onSelect }: { bodyHeight?: number; onSelect?: (command: string) => void }) {
  // Fixed intro/highlight/footer rows consume about 12 lines inside the already-sized body.
  const fallbackVisible = useVisibleRows(16);
  const visible = bodyHeight ? Math.max(3, bodyHeight - 12) : fallbackVisible;
  const commands = sortCommandsForPalette(visibleCommands());
  const selected = useSelectableIndex(commands.length, visible);
  useInput((_input, key) => {
    if (key.return) onSelect?.(commands[selected]?.name ?? '/help');
  });
  const start = Math.min(Math.max(0, selected - Math.floor(visible / 2)), Math.max(0, commands.length - visible));
  const slice = commands.slice(start, start + visible);
  const above = start;
  const below = Math.max(0, commands.length - start - slice.length);
  const highlights: Array<[string, string[]]> = [
    ['Agent modes', ['/ask', '/task', '/plan', '/review']],
    ['Shell approvals', ['/approvals ask', '/approvals auto', '/approvals yolo']],
    ['Navigation', ['/focus', '/attach', '/raw', '/send']],
  ];
  return (
    <Box borderStyle="round" borderColor={BRAND.muted} flexDirection="column" paddingX={1}>
      <Text bold color={BRAND.primary}>
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
      {highlights.map(([label, names]) => (
        <Text key={label} wrap="truncate-end">
          <Text color={BRAND.primary} bold>{label}: </Text>
          <Text color="gray">{names.join('  ')}</Text>
        </Text>
      ))}
      <Text color="gray" wrap="truncate-end">Keyboard: ↑/↓ select · Enter run selected · PgUp/PgDn page · Esc back</Text>
      <Text> </Text>
      <Above n={above} />
      {slice.map((c, i) => {
        const isSelected = start + i === selected;
        return (
        <Text key={c.name} wrap="truncate-end">
          <Text color={isSelected ? COLOR.cream : COLOR.creamMuted} bold>
            {isSelected ? '› ' : '  '}
            {c.name.padEnd(16)}
          </Text>
          <Text color="yellow">{c.args.padEnd(24)}</Text>
          <Text color="gray">
            {t(c.descKey)}
            {c.aliases?.length ? ` (= ${c.aliases.join(', ')})` : ''}
          </Text>
        </Text>
        );
      })}
      <Below n={below} />
      <Text> </Text>
      <Text color="gray" wrap="truncate-end">{t('help.states')}</Text>
      <Text color="gray" wrap="truncate-end">{t('help.keys')}</Text>
    </Box>
  );
}
