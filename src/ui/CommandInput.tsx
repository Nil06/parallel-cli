import React, { useEffect, useRef, useState } from 'react';
import { Box, Text, useInput } from 'ink';
import { matchCommands, type CommandDef } from '../commands.js';
import { t } from '../i18n.js';
import type { AgentInfo } from '../types.js';
import { readClipboardImage } from './clipboard.js';

export type InputContext = 'hub' | 'focus' | 'attach';

type Attachment =
  | { kind: 'paste'; n: number; marker: string; text: string; lines: number }
  | { kind: 'image'; n: number; dataUri: string; label: string };

interface Props {
  active: boolean;
  placeholder: string;
  mask?: boolean;
  context?: InputContext;
  targetAgent?: string;
  modelLabel?: string;
  commandNames?: string[];
  agentNames?: string[];
  agents?: AgentInfo[];
  onSubmit: (value: string, images?: string[]) => void;
  onEscape?: () => void;
  notify?: (line: string) => void;
}

/** A paste is "long" when it spans multiple lines — it then collapses into a chip. */
const PASTE_MIN_LINES = 2;

const GROUP_LABEL: Record<string, string> = {
  modes: 'Agent modes',
  control: 'Control',
  views: 'Views',
  settings: 'Settings',
  git: 'Git/session',
  other: 'Other',
};

const AGENT_ARG_COMMANDS = new Set(['/focus', '/send', '/attach', '/pause', '/resume', '/stop', '/restore', '/commit']);

function modeHint(value: string, context: InputContext, targetAgent?: string): string {
  const v = value.trimStart().toLowerCase();
  if (!v) {
    if (context === 'focus') return `Message ${targetAgent ?? 'focused agent'} · / for hub commands · PgUp/PgDn scroll`;
    if (context === 'attach') return `Steer ${targetAgent ?? 'agent'} · /task spawns · @all broadcasts · /quit detaches`;
    return 'Default /task · Tab/→ autocomplete · / for commands';
  }
  if (!v.startsWith('/')) {
    if (context === 'focus') return `Will message ${targetAgent ?? 'focused agent'}`;
    if (context === 'attach') return `Will steer ${targetAgent ?? 'attached agent'}`;
    return 'Will launch /task';
  }
  if (v.startsWith('/ask') || v === '/a') return 'Ask mode · advice only · no edits';
  if (v.startsWith('/task') || v === '/t') return 'Task mode · execute, edit, validate';
  if (v.startsWith('/plan') || v === '/p') return 'Plan mode · asks before editing';
  return 'Tab/→ accepts the best suggestion';
}

function groupedCommands(commands: CommandDef[]): Array<[string, CommandDef[]]> {
  const order = ['modes', 'control', 'views', 'settings', 'git', 'other'];
  return order
    .map((g) => [g, commands.filter((c) => (c.group ?? 'other') === g)] as [string, CommandDef[]])
    .filter(([, items]) => items.length > 0);
}

export function bestCommandCompletion(value: string): string | null {
  const cmd = matchCommands(value)[0];
  return cmd ? `${cmd.name} ` : null;
}

export function commandNamesForContext(context: InputContext): string[] | undefined {
  if (context !== 'attach') return undefined;
  return ['/ask', '/a', '/task', '/t', '/plan', '/p', '/send', '/raw', '/quit', '/exit', '/detach'];
}

export function agentArgCommand(value: string): string | null {
  const m = value.match(/^(\/\S+)\s+([^\s]*)$/);
  if (!m) return null;
  const cmd = m[1].toLowerCase();
  return AGENT_ARG_COMMANDS.has(cmd) ? cmd : null;
}

export function completeAgentArgument(value: string, agent: string): string {
  const cmd = agentArgCommand(value);
  if (!cmd) return value;
  return `${cmd} ${agent} `;
}

export function CommandInput({
  active,
  placeholder,
  mask,
  context = 'hub',
  targetAgent,
  modelLabel,
  commandNames,
  agentNames = [],
  agents = [],
  onSubmit,
  onEscape,
  notify,
}: Props) {
  const [value, setValue] = useState('');
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [history, setHistory] = useState<string[]>([]);
  const [histIdx, setHistIdx] = useState(-1);
  const [selectedSuggestion, setSelectedSuggestion] = useState(0);
  const attSeq = useRef(0);

  const reset = () => {
    setValue('');
    setAttachments([]);
  };

  /** Expand collapsed paste markers back into their full text. */
  const expand = (v: string): string => {
    let out = v;
    for (const a of attachments) {
      if (a.kind === 'paste') out = out.replace(a.marker, a.text);
    }
    return out;
  };

  const submit = (v: string) => {
    const full = expand(v).trim();
    const images = attachments.filter((a): a is Extract<Attachment, { kind: 'image' }> => a.kind === 'image');
    if (!full && images.length === 0) return;
    if (!full.toLowerCase().startsWith('/key ')) setHistory((h) => [...h.slice(-49), v]);
    setHistIdx(-1);
    reset();
    onSubmit(full, images.length > 0 ? images.map((i) => i.dataUri) : undefined);
  };

  /** Collapse a multi-line paste into a numbered chip + inline marker. */
  const addPaste = (text: string): string => {
    const n = ++attSeq.current;
    const lines = text.split('\n').length;
    const marker = t('input.pasted', { n, lines });
    setAttachments((arr) => [...arr, { kind: 'paste', n, marker, text, lines }]);
    return marker;
  };

  const pasteImage = () => {
    const img = readClipboardImage();
    if (!img) {
      notify?.(t('input.imageNone'));
      return;
    }
    const n = ++attSeq.current;
    setAttachments((arr) => [...arr, { kind: 'image', n, dataUri: img.dataUri, label: img.label }]);
    notify?.(t('input.imageAdded'));
  };

  const uniqueAgentNames = [...new Set(agentNames.filter(Boolean))];
  const allowedCommands = commandNames ?? commandNamesForContext(context);
  const commandAllowed = (c: CommandDef) =>
    !allowedCommands || allowedCommands.includes(c.name) || c.aliases?.some((a) => allowedCommands.includes(a));
  const cmdSuggestions =
    value.startsWith('/') && !value.includes(' ') ? matchCommands(value).filter(commandAllowed).slice(0, 10) : [];
  const agentSuggestions =
    value.startsWith('@') && !value.includes(' ')
      ? ['all', ...uniqueAgentNames].filter((n) => n.toLowerCase().startsWith(value.slice(1).toLowerCase())).slice(0, 8)
      : [];
  const argCommand = agentArgCommand(value);
  const argPrefix = argCommand ? value.split(/\s+/)[1] ?? '' : '';
  const argSuggestions = argCommand
    ? [
        ...(argCommand === '/send' || argCommand === '/pause' || argCommand === '/resume' || argCommand === '/stop' || argCommand === '/commit'
          ? ['all']
          : []),
        ...uniqueAgentNames,
      ]
        .filter((n) => n.toLowerCase().startsWith(argPrefix.toLowerCase()))
        .slice(0, 8)
    : [];
  const suggestionCount =
    cmdSuggestions.length > 0 ? cmdSuggestions.length : agentSuggestions.length > 0 ? agentSuggestions.length : argSuggestions.length;
  const hasSuggestions = suggestionCount > 0;
  const exactCommand = cmdSuggestions.some(
    (c) => c.name === value.toLowerCase() || c.aliases?.some((a) => a === value.toLowerCase()),
  );

  useEffect(() => {
    setSelectedSuggestion(0);
  }, [value]);

  useEffect(() => {
    if (selectedSuggestion >= suggestionCount) setSelectedSuggestion(Math.max(0, suggestionCount - 1));
  }, [selectedSuggestion, suggestionCount]);

  const completeBest = (): boolean => {
    if (cmdSuggestions.length > 0) {
      const cmd = cmdSuggestions[Math.min(selectedSuggestion, cmdSuggestions.length - 1)];
      setValue(`${cmd.name} `);
      return true;
    }
    if (agentSuggestions.length > 0) {
      const agent = agentSuggestions[Math.min(selectedSuggestion, agentSuggestions.length - 1)];
      setValue('@' + agent + ' ');
      return true;
    }
    if (argSuggestions.length > 0) {
      const agent = argSuggestions[Math.min(selectedSuggestion, argSuggestions.length - 1)];
      setValue(completeAgentArgument(value, agent));
      return true;
    }
    return false;
  };

  useInput(
    (input, key) => {
      if (key.escape) {
        if (value || attachments.length > 0) reset();
        else onEscape?.();
        return;
      }
      if (key.return) {
        if (hasSuggestions && !exactCommand) {
          completeBest();
          return;
        }
        submit(value);
        return;
      }
      if (key.backspace || key.delete) {
        // If the cursor sits right after a paste marker, remove the whole chip at once.
        const at = attachments.find((a) => a.kind === 'paste' && value.endsWith(a.marker)) as
          | Extract<Attachment, { kind: 'paste' }>
          | undefined;
        if (at) {
          setValue((v) => v.slice(0, -at.marker.length));
          setAttachments((arr) => arr.filter((a) => a !== at));
        } else {
          setValue((v) => v.slice(0, -1));
        }
        return;
      }
      if (key.upArrow) {
        if (hasSuggestions) {
          setSelectedSuggestion((i) => (i - 1 + suggestionCount) % suggestionCount);
          return;
        }
        setHistIdx((i) => {
          const ni = i === -1 ? history.length - 1 : Math.max(0, i - 1);
          if (history[ni] !== undefined) setValue(history[ni]);
          return ni;
        });
        return;
      }
      if (key.downArrow) {
        if (hasSuggestions) {
          setSelectedSuggestion((i) => (i + 1) % suggestionCount);
          return;
        }
        setHistIdx((i) => {
          if (i === -1) return -1;
          const ni = i + 1;
          if (ni >= history.length) {
            setValue('');
            return -1;
          }
          setValue(history[ni]);
          return ni;
        });
        return;
      }
      if (key.tab || key.rightArrow) {
        completeBest();
        return;
      }
      if (key.ctrl && input === 'u') {
        reset();
        return;
      }
      if (key.ctrl && input === 'v') {
        pasteImage();
        return;
      }
      if (key.ctrl || key.meta) return;
      if (!input) return;
      // Multi-line paste (Ink delivers it as one chunked input event) →
      // collapse into a chip like Codex/Claude Code instead of submitting lines.
      if (/[\r\n]/.test(input)) {
        const normalized = input.replace(/\r\n|\r/g, '\n');
        const lineCount = normalized.split('\n').filter((l, i, arr) => l !== '' || i < arr.length - 1).length;
        if (normalized.replace(/\n+$/, '').includes('\n') || lineCount >= PASTE_MIN_LINES) {
          const marker = addPaste(normalized.replace(/\n+$/, ''));
          setValue((v) => v + marker + ' ');
        } else {
          // single line ending with Enter → treat the newline as validation
          const v = (value + normalized.split('\n')[0]).trim();
          if (v) submit(v);
        }
        return;
      }
      setValue((v) => v + input);
    },
    { isActive: active },
  );

  const shown = mask ? '•'.repeat(value.length) : value;
  const byName = new Map(agents.flatMap((a) => [[a.name, a], [a.alias, a]]));
  const commandIndexes = new Map(cmdSuggestions.map((c, i) => [c.name, i]));

  return (
    <Box flexDirection="column">
      <Box flexDirection="row" gap={1}>
        <Text color="gray" wrap="truncate-end">{modeHint(value, context, targetAgent)}</Text>
        <Text color="cyan">[{context}]</Text>
        {targetAgent ? <Text color="magenta">[{targetAgent}]</Text> : null}
        {modelLabel ? <Text color="yellow">[{modelLabel}]</Text> : null}
      </Box>
      {cmdSuggestions.length > 0 && (
        <Box borderStyle="single" borderColor="gray" flexDirection="column" paddingX={1}>
          {groupedCommands(cmdSuggestions).map(([group, commands]) => (
            <Box key={group} flexDirection="column">
              <Text color="gray" bold>{GROUP_LABEL[group] ?? group}</Text>
              {commands.map((c) => (
                (() => {
                  const selected = commandIndexes.get(c.name) === selectedSuggestion;
                  return (
                <Text key={c.name}>
                  <Text color={selected ? 'cyanBright' : 'cyan'} bold>
                    {selected ? '› ' : '  '}
                    {c.name.padEnd(14)}
                  </Text>
                  <Text color="yellow">{c.args.padEnd(22)}</Text>
                  <Text color="gray">{t(c.descKey)}</Text>
                </Text>
                  );
                })()
              ))}
            </Box>
          ))}
        </Box>
      )}
      {agentSuggestions.length > 0 && (
        <Box borderStyle="single" borderColor="gray" flexDirection="column" paddingX={1}>
          {agentSuggestions.map((n, i) => (
            <Text key={n}>
              <Text color={i === selectedSuggestion ? 'cyanBright' : 'cyan'} bold>
                {i === selectedSuggestion ? '› ' : '  '}@{n.padEnd(10)}
              </Text>
              <Text color="gray">
                {n === 'all'
                  ? t('input.atAll')
                  : `${byName.get(n)?.state ?? ''} ${byName.get(n)?.mode ? `/${byName.get(n)?.mode}` : ''}`}
              </Text>
            </Text>
          ))}
        </Box>
      )}
      {argSuggestions.length > 0 && (
        <Box borderStyle="single" borderColor="gray" flexDirection="column" paddingX={1}>
          <Text color="gray" bold>Agents</Text>
          {argSuggestions.map((n, i) => (
            <Text key={n}>
              <Text color={i === selectedSuggestion ? 'cyanBright' : 'cyan'} bold>
                {i === selectedSuggestion ? '› ' : '  '}{n.padEnd(12)}
              </Text>
              <Text color="gray">
                {n === 'all'
                  ? t('input.atAll')
                  : `${byName.get(n)?.state ?? ''} ${byName.get(n)?.mode ? `/${byName.get(n)?.mode}` : ''}`}
              </Text>
            </Text>
          ))}
        </Box>
      )}
      {attachments.length > 0 && (
        <Box flexDirection="row" gap={1} paddingX={1}>
          {attachments.map((a) => (
            <Text key={a.n} color="cyan" backgroundColor="gray">
              {' '}
              {a.kind === 'paste' ? t('input.attPaste', { n: a.n, lines: a.lines }) : t('input.attImage', { n: a.n, file: a.label })}{' '}
            </Text>
          ))}
        </Box>
      )}
      <Box borderStyle="single" borderColor={active ? 'cyan' : 'gray'} paddingX={1}>
        <Text color="cyanBright" bold>
          ›{' '}
        </Text>
        {shown ? (
          <>
            <Text>{shown}</Text>
            {active && <Text color="cyanBright">█</Text>}
          </>
        ) : (
          <>
            {active && <Text color="cyanBright">█</Text>}
            <Text color="gray">{placeholder}</Text>
          </>
        )}
      </Box>
    </Box>
  );
}
