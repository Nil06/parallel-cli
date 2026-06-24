import React, { useState } from 'react';
import { Box, Text, useInput } from 'ink';
import { t } from '../i18n.js';
import { BRAND, COLOR } from './tokens.js';

function clampIndex(index: number, count: number): number {
  if (count <= 0) return 0;
  return Math.max(0, Math.min(index, count - 1));
}

export interface SelectItem {
  label: string;
  value: string;
  hint?: string;
  /** Non-selectable section header when true. */
  section?: boolean;
  /** Secondary detail shown after the label (subtler than hint). */
  detail?: string;
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
  height,
  onBack,
  onSelect,
  onInput,
}: {
  items: SelectItem[];
  allowInput?: boolean;
  inputPlaceholder?: string;
  mask?: boolean;
  height?: number;
  onBack?: () => void;
  onSelect?: (value: string) => void;
  onInput?: (value: string) => void;
}) {
  const [idx, setIdx] = useState(0);
  const [typed, setTyped] = useState('');
  const typing = allowInput && typed.length > 0;

  useInput((input, key) => {
    // Build selectable index list each render (cheap — items is small).
    const selectable = items.map((it, i) => (it.section ? -1 : i)).filter((i) => i >= 0);
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
      } else {
        const realIdx = selectable[idx];
        if (realIdx !== undefined && items[realIdx]) onSelect?.(items[realIdx].value);
      }
      return;
    }
    if (key.backspace || key.delete) {
      setTyped((v) => v.slice(0, -1));
      return;
    }
    if (key.upArrow) {
      if (!typing) setIdx((i) => clampIndex(i - 1, selectable.length));
      return;
    }
    if (key.downArrow) {
      if (!typing) setIdx((i) => clampIndex(i + 1, selectable.length));
      return;
    }
    if (key.pageUp) {
      if (!typing) setIdx((i) => Math.max(0, i - Math.max(1, Math.floor((height ?? 8) / 2))));
      return;
    }
    if (key.pageDown) {
      if (!typing) setIdx((i) => Math.min(Math.max(0, selectable.length - 1), i + Math.max(1, Math.floor((height ?? 8) / 2))));
      return;
    }
    if ((key as any).home) {
      if (!typing) setIdx(0);
      return;
    }
    if ((key as any).end) {
      if (!typing) setIdx(Math.max(0, selectable.length - 1));
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

  // Build a separate index map so up/down skip section headers.
  const selectable = items.map((it, i) => (it.section ? -1 : i)).filter((i) => i >= 0);
  const safeIdx = selectable.length > 0 ? selectable[Math.min(idx, selectable.length - 1)] : -1;
  const maxVisible = height ? Math.max(1, height - (allowInput ? 2 : 0)) : items.length;
  const start = items.length > maxVisible && safeIdx >= 0
    ? Math.max(0, Math.min(safeIdx - Math.floor(maxVisible / 2), items.length - maxVisible))
    : 0;
  const visibleItems = items.slice(start, start + maxVisible);
  const above = start;
  const below = Math.max(0, items.length - start - visibleItems.length);

  return (
    <Box flexDirection="column">
      {above > 0 ? <Text color="gray">▲ {above}</Text> : null}
      {visibleItems.map((it, localIdx) => {
        const i = start + localIdx;
        return (
        it.section ? (
          <Box key={it.label} marginTop={i > 0 ? 1 : 0}>
            <Text bold color="white">
              {it.label}
            </Text>
          </Box>
        ) : (
          <Text key={it.value + i}>
            <Text color={!typing && i === safeIdx ? COLOR.cream : 'gray'} bold={!typing && i === safeIdx}>
              {!typing && i === safeIdx ? '❯ ' : '  '}
              {it.label}
            </Text>
            {it.hint ? <Text color="gray"> {it.hint}</Text> : null}
            {it.detail ? <Text color="gray"> — {it.detail}</Text> : null}
          </Text>
        )
        );
      })}
      {below > 0 ? <Text color="gray">▼ {below}</Text> : null}
      {allowInput && (
        <Box marginTop={items.length > 0 ? 1 : 0}>
          <Text color={typing ? COLOR.cream : 'gray'}>
            ✎{' '}
            {typing ? (
              <Text color="white">{mask ? '•'.repeat(typed.length) : typed}</Text>
            ) : (
              <Text color="gray">{inputPlaceholder ?? '…'}</Text>
            )}
            {typing ? <Text color={COLOR.cream}>█</Text> : null}
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
    <Box borderStyle="round" borderColor={BRAND.muted} flexDirection="column" paddingX={1}>
      <Text bold color={BRAND.primary}>
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
