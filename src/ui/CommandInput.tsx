import React, { useRef, useState } from 'react';
import { Box, Text, useInput } from 'ink';
import { matchCommands } from '../commands.js';
import { t } from '../i18n.js';
import { readClipboardImage } from './clipboard.js';

type Attachment =
  | { kind: 'paste'; n: number; marker: string; text: string; lines: number }
  | { kind: 'image'; n: number; dataUri: string; label: string };

interface Props {
  active: boolean;
  placeholder: string;
  mask?: boolean;
  agentNames?: string[];
  onSubmit: (value: string, images?: string[]) => void;
  onEscape?: () => void;
  notify?: (line: string) => void;
}

/** A paste is "long" when it spans multiple lines — it then collapses into a chip. */
const PASTE_MIN_LINES = 2;

export function CommandInput({ active, placeholder, mask, agentNames = [], onSubmit, onEscape, notify }: Props) {
  const [value, setValue] = useState('');
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [history, setHistory] = useState<string[]>([]);
  const [histIdx, setHistIdx] = useState(-1);
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
    setHistory((h) => [...h.slice(-49), v]);
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

  useInput(
    (input, key) => {
      if (key.escape) {
        if (value || attachments.length > 0) reset();
        else onEscape?.();
        return;
      }
      if (key.return) {
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
        setHistIdx((i) => {
          const ni = i === -1 ? history.length - 1 : Math.max(0, i - 1);
          if (history[ni] !== undefined) setValue(history[ni]);
          return ni;
        });
        return;
      }
      if (key.downArrow) {
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
      if (key.tab) {
        const cmds = matchCommands(value);
        if (cmds.length > 0) {
          setValue(cmds[0].name + ' ');
          return;
        }
        if (value.startsWith('@')) {
          const frag = value.slice(1).toLowerCase();
          const m = ['all', ...agentNames].find((n) => n.toLowerCase().startsWith(frag));
          if (m) setValue('@' + m + ' ');
        }
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

  const cmdSuggestions = value.startsWith('/') && !value.includes(' ') ? matchCommands(value).slice(0, 8) : [];
  const agentSuggestions =
    value.startsWith('@') && !value.includes(' ')
      ? ['all', ...agentNames].filter((n) => n.toLowerCase().startsWith(value.slice(1).toLowerCase())).slice(0, 8)
      : [];
  const shown = mask ? '•'.repeat(value.length) : value;

  return (
    <Box flexDirection="column">
      {cmdSuggestions.length > 0 && (
        <Box borderStyle="round" borderColor="gray" flexDirection="column" paddingX={1}>
          {cmdSuggestions.map((c) => (
            <Text key={c.name}>
              <Text color="cyan" bold>
                {c.name.padEnd(18)}
              </Text>
              <Text color="yellow">{c.args.padEnd(24)}</Text>
              <Text color="gray">{t(c.descKey)}</Text>
            </Text>
          ))}
        </Box>
      )}
      {agentSuggestions.length > 0 && (
        <Box borderStyle="round" borderColor="gray" flexDirection="column" paddingX={1}>
          {agentSuggestions.map((n) => (
            <Text key={n}>
              <Text color="magenta" bold>
                @{n}
              </Text>
              <Text color="gray">
                {t('input.atHint')}
                {n === 'all' ? t('input.atAll') : ''}
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
      <Box borderStyle="round" borderColor={active ? 'cyan' : 'gray'} paddingX={1}>
        <Text color="cyanBright" bold>
          ❯{' '}
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
