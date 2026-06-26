import React, { useEffect, useMemo, useState } from 'react';
import { Box, Text, useInput } from 'ink';
import { t } from '../i18n.js';
import { BRAND, COLOR } from './tokens.js';

function clampIndex(index: number, count: number): number {
  if (count <= 0) return 0;
  return Math.max(0, Math.min(index, count - 1));
}

export function selectableIndexes(items: SelectItem[]): number[] {
  return items.map((it, i) => (it.section ? -1 : i)).filter((i) => i >= 0);
}

export function selectListWindow(itemsLength: number, selectedRealIndex: number, maxVisible: number): { start: number; end: number } {
  const visible = Math.max(1, maxVisible);
  if (itemsLength <= visible || selectedRealIndex < 0) return { start: 0, end: Math.min(itemsLength, visible) };
  const start = Math.max(0, Math.min(selectedRealIndex - Math.floor(visible / 2), itemsLength - visible));
  return { start, end: start + visible };
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
  const selectable = useMemo(() => selectableIndexes(items), [items]);
  const safeLogicalIdx = clampIndex(idx, selectable.length);
  const safeRealIdx = selectable.length > 0 ? selectable[safeLogicalIdx] : -1;
  const maxVisible = height ? Math.max(1, height - (allowInput ? 2 : 0)) : items.length;
  const window = selectListWindow(items.length, safeRealIdx, maxVisible);
  const visibleItems = items.slice(window.start, window.end);
  const above = window.start;
  const below = Math.max(0, items.length - window.end);
  const pageStep = Math.max(1, Math.floor(Math.max(1, maxVisible) / 2));

  useEffect(() => {
    if (safeLogicalIdx !== idx) setIdx(safeLogicalIdx);
  }, [idx, safeLogicalIdx]);

  const chooseCurrent = () => {
    const realIdx = selectable[safeLogicalIdx];
    if (realIdx !== undefined && items[realIdx]) onSelect?.(items[realIdx].value);
  };

  useInput((input, key) => {
    if (key.escape) {
      if (typed) setTyped('');
      else onBack?.();
      return;
    }
    if (key.leftArrow) {
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
        chooseCurrent();
      }
      return;
    }
    if ((key.tab || key.rightArrow) && !typing) {
      chooseCurrent();
      return;
    }
    if (key.backspace || key.delete) {
      if (typed) setTyped((v) => v.slice(0, -1));
      else onBack?.();
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
      if (!typing) setIdx((i) => clampIndex(i - pageStep, selectable.length));
      return;
    }
    if (key.pageDown) {
      if (!typing) setIdx((i) => clampIndex(i + pageStep, selectable.length));
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

  return (
    <Box flexDirection="column">
      {above > 0 ? <Text color="gray">▲ {above}</Text> : null}
      {visibleItems.map((it, localIdx) => {
        const i = window.start + localIdx;
        return (
        it.section ? (
          <Box key={it.label} marginTop={i > 0 ? 1 : 0}>
            <Text bold color="white">
              {it.label}
            </Text>
          </Box>
        ) : (
          <Text key={it.value + i}>
            <Text color={!typing && i === safeRealIdx ? COLOR.cream : 'gray'} bold={!typing && i === safeRealIdx}>
              {!typing && i === safeRealIdx ? '❯ ' : '  '}
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
