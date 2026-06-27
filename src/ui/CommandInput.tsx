import React, { useEffect, useRef, useState } from 'react';
import { Box, Text, useInput } from 'ink';
import { commandPalette } from '../commands.js';
import { t } from '../i18n.js';
import type { AgentInfo } from '../types.js';
import { readClipboardImage } from './clipboard.js';
import { BRAND, COLOR } from './tokens.js';

export type InputContext = 'hub' | 'focus' | 'attach';

export type Attachment =
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
  width?: number;
  onHeightChange?: (rows: number) => void;
  onIdleNavigation?: (direction: 'up' | 'down') => void;
  onSubmit: (value: string, images?: string[]) => void;
  onEscape?: () => void;
  notify?: (line: string) => void;
}

/** A paste is "long" when it spans multiple lines — it then collapses into a chip. */
const PASTE_MIN_LINES = 2;

const AGENT_ARG_COMMANDS = new Set(['/focus', '/send', '/attach', '/pause', '/resume', '/stop', '/restore', '/commit']);
const COMMAND_PAGE_SIZE = 9;
const PROMPT_GUTTER = '› ';

export function removeTrailingPasteAttachment(value: string, attachments: Attachment[]): { value: string; attachment?: Attachment } | null {
  const paste = attachments.find((a): a is Extract<Attachment, { kind: 'paste' }> => a.kind === 'paste' && (value.endsWith(`${a.marker} `) || value.endsWith(a.marker)));
  if (!paste) return null;
  const suffix = value.endsWith(`${paste.marker} `) ? `${paste.marker} ` : paste.marker;
  return { value: value.slice(0, -suffix.length), attachment: paste };
}

function modeHint(value: string, context: InputContext, targetAgent?: string): string {
  const v = value.trimStart().toLowerCase();
  if (!v) {
    if (context === 'focus') return `Message ${targetAgent ?? 'focused agent'} · / commands`;
    if (context === 'attach') return `Steer ${targetAgent ?? 'agent'} · @all broadcasts · /quit detaches`;
    return 'Type a task or / for commands';
  }
  if (!v.startsWith('/')) {
    if (context === 'focus') return `Will message ${targetAgent ?? 'focused agent'}`;
    if (context === 'attach') return `Will steer ${targetAgent ?? 'attached agent'}`;
    return 'Will launch /task';
  }
  if (v.startsWith('/ask') || v === '/a') return 'Ask mode · advice only · no edits';
  if (v.startsWith('/task') || v === '/t') return 'Task mode · execute, edit, validate';
  if (v.startsWith('/plan') || v === '/p') return 'Plan mode · asks before editing';
  if (v.startsWith('/review')) return 'Review mode · verdict, risks, tests';
  return '↑/↓ select · Enter accept';
}

export function bestCommandCompletion(value: string): string | null {
  const cmd = commandPalette(value)[0];
  return cmd ? `${cmd.name} ` : null;
}

export function commandNamesForContext(context: InputContext): string[] | undefined {
  if (context !== 'attach') return undefined;
  return ['/ask', '/a', '/task', '/t', '/plan', '/p', '/review', '/send', '/stop', '/raw', '/quit', '/exit', '/detach'];
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

export function clampSuggestionIndex(index: number, count: number): number {
  if (count <= 0) return 0;
  return Math.max(0, Math.min(index, count - 1));
}

export function wrappedPromptLines(text: string, width: number): string[] {
  const usable = Math.max(8, width - PROMPT_GUTTER.length);
  if (!text) return [''];
  const lines: string[] = [];
  for (const logical of text.split('\n')) {
    if (!logical) {
      lines.push('');
      continue;
    }
    for (let i = 0; i < logical.length; i += usable) lines.push(logical.slice(i, i + usable));
  }
  return lines.length > 0 ? lines : [''];
}

function paintLine(text: string, width: number): string {
  return text.length >= width ? text.slice(0, width) : text.padEnd(width, ' ');
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
  width,
  onHeightChange,
  onIdleNavigation,
  onSubmit,
  onEscape,
  notify,
}: Props) {
  const [value, setValue] = useState('');
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [history, setHistory] = useState<string[]>([]);
  const [histIdx, setHistIdx] = useState(-1);
  const [selectedSuggestion, setSelectedSuggestion] = useState(0);
  const [cursorOn, setCursorOn] = useState(true);
  const attSeq = useRef(0);
  const imageConsentUntil = useRef(0);
  const imageConsentGranted = useRef(false);

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
    const now = Date.now();
    if (!imageConsentGranted.current && imageConsentUntil.current < now) {
      imageConsentUntil.current = now + 10_000;
      notify?.(t('input.imageConsent'));
      return;
    }
    imageConsentGranted.current = true;
    const n = ++attSeq.current;
    setAttachments((arr) => [...arr, { kind: 'image', n, dataUri: img.dataUri, label: img.label }]);
    notify?.(t('input.imageAdded'));
  };

  const uniqueAgentNames = [...new Set(agentNames.filter(Boolean))];
  const allowedCommands = commandNames ?? commandNamesForContext(context);
  const cmdSuggestions =
    value.startsWith('/') && !value.includes(' ') ? commandPalette(value, { allowedNames: allowedCommands }) : [];
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

  const safeSelectedSuggestion = clampSuggestionIndex(selectedSuggestion, suggestionCount);

  useEffect(() => {
    if (selectedSuggestion !== safeSelectedSuggestion) setSelectedSuggestion(safeSelectedSuggestion);
  }, [selectedSuggestion, safeSelectedSuggestion]);

  useEffect(() => {
    if (!active) return;
    const timer = setInterval(() => setCursorOn((on) => !on), 450);
    return () => clearInterval(timer);
  }, [active]);

  const commandWindowStart =
    cmdSuggestions.length > COMMAND_PAGE_SIZE
      ? Math.min(
          Math.max(0, safeSelectedSuggestion - Math.floor(COMMAND_PAGE_SIZE / 2)),
          Math.max(0, cmdSuggestions.length - COMMAND_PAGE_SIZE),
        )
      : 0;
  const shownCommandSuggestions = cmdSuggestions.slice(commandWindowStart, commandWindowStart + COMMAND_PAGE_SIZE);
  const shown = mask ? '•'.repeat(value.length) : value;
  const promptWidth = Math.max(20, width ?? process.stdout.columns ?? 100);
  const inputText = shown || placeholder;
  const promptLines = wrappedPromptLines(inputText, promptWidth);
  const suggestionRows =
    cmdSuggestions.length > 0
      ? shownCommandSuggestions.length + 1
      : agentSuggestions.length > 0
        ? agentSuggestions.length
        : argSuggestions.length > 0
          ? argSuggestions.length + 1
          : 0;
  const attachmentRows = attachments.length > 0 ? 1 : 0;
  const hintRows = value || context !== 'hub' ? 1 : 0;
  const renderedRows = suggestionRows + attachmentRows + promptLines.length + 2 + hintRows;

  useEffect(() => {
    onHeightChange?.(renderedRows);
  }, [onHeightChange, renderedRows]);

  const completeBest = (): boolean => {
    if (cmdSuggestions.length > 0) {
      const cmd = cmdSuggestions[clampSuggestionIndex(safeSelectedSuggestion, cmdSuggestions.length)];
      setValue(`${cmd.name} `);
      return true;
    }
    if (agentSuggestions.length > 0) {
      const agent = agentSuggestions[clampSuggestionIndex(safeSelectedSuggestion, agentSuggestions.length)];
      setValue('@' + agent + ' ');
      return true;
    }
    if (argSuggestions.length > 0) {
      const agent = argSuggestions[clampSuggestionIndex(safeSelectedSuggestion, argSuggestions.length)];
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
        const removed = removeTrailingPasteAttachment(value, attachments);
        if (removed) {
          setValue(removed.value);
          setAttachments((arr) => arr.filter((a) => a !== removed.attachment));
        } else {
          setValue((v) => v.slice(0, -1));
        }
        return;
      }
      if (key.upArrow) {
        if (hasSuggestions) {
          setSelectedSuggestion((i) => clampSuggestionIndex(i - 1, suggestionCount));
          return;
        }
        if (!value && attachments.length === 0 && onIdleNavigation) {
          onIdleNavigation('up');
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
          setSelectedSuggestion((i) => clampSuggestionIndex(i + 1, suggestionCount));
          return;
        }
        if (!value && attachments.length === 0 && onIdleNavigation) {
          onIdleNavigation('down');
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
  const byName = new Map(agents.flatMap((a) => [[a.name, a], [a.alias, a]]));

  return (
    <Box flexDirection="column">
      {cmdSuggestions.length > 0 && (
        <Box borderStyle="single" borderColor="gray" flexDirection="column" paddingX={1}>
          <Text color="gray">
            Commands {Math.min(safeSelectedSuggestion + 1, cmdSuggestions.length)}/{cmdSuggestions.length} · ↑/↓
          </Text>
          {shownCommandSuggestions.map((c, i) => {
            const absolute = commandWindowStart + i;
            const selected = absolute === safeSelectedSuggestion;
            return (
                <Text key={c.name}>
                  <Text color={selected ? COLOR.cream : COLOR.creamMuted} bold>
                    {selected ? '› ' : '  '}
                    {c.name.padEnd(13)}
                  </Text>
                  <Text color="gray">{t(c.descKey)}</Text>
                </Text>
            );
          })}
        </Box>
      )}
      {agentSuggestions.length > 0 && (
        <Box borderStyle="single" borderColor="gray" flexDirection="column" paddingX={1}>
          {agentSuggestions.map((n, i) => (
            <Text key={n}>
              <Text color={i === safeSelectedSuggestion ? COLOR.cream : COLOR.creamMuted} bold>
                {i === safeSelectedSuggestion ? '› ' : '  '}@{n.padEnd(10)}
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
              <Text color={i === safeSelectedSuggestion ? COLOR.cream : COLOR.creamMuted} bold>
                {i === safeSelectedSuggestion ? '› ' : '  '}{n.padEnd(12)}
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
            <Text key={a.n} color={COLOR.cream} backgroundColor={COLOR.promptBackground}>
              {' '}
              {a.kind === 'paste' ? t('input.attPaste', { n: a.n, lines: a.lines }) : t('input.attImage', { n: a.n, file: a.label })}{' '}
            </Text>
          ))}
        </Box>
      )}
      <Box flexDirection="column">
        <Text backgroundColor={COLOR.promptBackground}>{paintLine('', promptWidth)}</Text>
        {promptLines.map((line, i) => {
          const last = i === promptLines.length - 1;
          const placeholderCursor = !shown && active && cursorOn && i === 0;
          const cursor = shown && active && last && cursorOn ? '█' : '';
          const prefix = i === 0 ? PROMPT_GUTTER : '  ';
          const content = placeholderCursor ? `█${line.slice(1)}` : `${line}${cursor}`;
          return (
            <Text key={i} backgroundColor={COLOR.promptBackground}>
              <Text color={active ? BRAND.primary : BRAND.muted} backgroundColor={COLOR.promptBackground} bold>{prefix}</Text>
              <Text color={shown ? 'white' : COLOR.creamMuted} backgroundColor={COLOR.promptBackground}>
                {paintLine(content, promptWidth - prefix.length)}
              </Text>
            </Text>
          );
        })}
        <Text backgroundColor={COLOR.promptBackground}>{paintLine('', promptWidth)}</Text>
      </Box>
      {(value || context !== 'hub') && (
        <Text color="gray" wrap="truncate-end">
          {modeHint(value, context, targetAgent)}
          {targetAgent ? ` · ${targetAgent}` : ''}
          {modelLabel && value ? ` · ${modelLabel}` : ''}
        </Text>
      )}
    </Box>
  );
}
