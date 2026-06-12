import React, { useState } from 'react';
import { Box, Text, useInput } from 'ink';
import { t } from '../i18n.js';

export interface SelectItem {
  label: string;
  value: string;
  hint?: string;
}

/**
 * Simple ↑/↓ + Entrée select list. If `allowInput` is set, the user can also
 * type a free value (e.g. a folder path or a custom model name) — typing
 * switches to input mode, Esc comes back to the list.
 */
export function SelectList({
  items,
  allowInput,
  inputPlaceholder,
  mask,
  onBack,
  onSelect,
  onInput,
}: {
  items: SelectItem[];
  allowInput?: boolean;
  inputPlaceholder?: string;
  mask?: boolean;
  onBack?: () => void;
  onSelect?: (value: string) => void;
  onInput?: (value: string) => void;
}) {
  const [idx, setIdx] = useState(0);
  const [typed, setTyped] = useState('');
  const typing = allowInput && typed.length > 0;

  useInput((input, key) => {
    if (key.escape) {
      if (typed) setTyped('');
      else onBack?.();
      return;
    }
    if (key.return) {
      if (typing) {
        const v = typed.trim();
        setTyped('');
        if (v) onInput?.(v);
      } else if (items[idx]) {
        onSelect?.(items[idx].value);
      }
      return;
    }
    if (key.backspace || key.delete) {
      setTyped((v) => v.slice(0, -1));
      return;
    }
    if (key.upArrow) {
      if (!typing) setIdx((i) => (i - 1 + items.length) % Math.max(1, items.length));
      return;
    }
    if (key.downArrow) {
      if (!typing) setIdx((i) => (i + 1) % Math.max(1, items.length));
      return;
    }
    if (key.tab || key.ctrl || key.meta) return;
    if (!allowInput || !input) return;
    // Pasted / chunked input may contain a newline → treat as validation.
    if (/[\r\n]/.test(input)) {
      const v = (typed + input).split(/\r\n|\r|\n/)[0].trim();
      setTyped('');
      if (v) onInput?.(v);
      return;
    }
    setTyped((v) => v + input);
  });

  return (
    <Box flexDirection="column">
      {items.map((it, i) => (
        <Text key={it.value + i}>
          <Text color={!typing && i === idx ? 'cyanBright' : 'gray'} bold={!typing && i === idx}>
            {!typing && i === idx ? '❯ ' : '  '}
            {it.label}
          </Text>
          {it.hint ? <Text color="gray"> {it.hint}</Text> : null}
        </Text>
      ))}
      {allowInput && (
        <Box marginTop={items.length > 0 ? 1 : 0}>
          <Text color={typing ? 'cyanBright' : 'gray'}>
            ✎{' '}
            {typing ? (
              <Text color="white">{mask ? '•'.repeat(typed.length) : typed}</Text>
            ) : (
              <Text color="gray">{inputPlaceholder ?? '…'}</Text>
            )}
            {typing ? <Text color="cyanBright">█</Text> : null}
          </Text>
        </Box>
      )}
    </Box>
  );
}

export function WizardStep({
  step,
  total,
  title,
  children,
  footer,
}: {
  step: number;
  total: number;
  title: string;
  children: React.ReactNode;
  footer?: string;
}) {
  return (
    <Box borderStyle="round" borderColor="cyan" flexDirection="column" paddingX={1}>
      <Text bold color="cyan">
        [{step}/{total}] {title}
      </Text>
      <Box flexDirection="column" marginTop={1}>
        {children}
      </Box>
      <Box marginTop={1}>
        <Text color="gray">{footer ?? t('wiz.footer.select')}</Text>
      </Box>
    </Box>
  );
}
