import React from 'react';
import { Box, Text } from 'ink';
import { t } from '../i18n.js';
import type { LogEntry } from '../types.js';
import { presentTimeline, type TimelineItem } from './events.js';
import { truncate } from './theme.js';
import { UI } from './tokens.js';

function sectionLabel(category: TimelineItem['category']): string {
  return t(`timeline.section.${category}`);
}

function fileLabel(label: string, count: number): string {
  const key = label === 'write' ? 'timeline.wroteFiles' : label === 'edit' ? 'timeline.editedFiles' : label === 'search' ? 'timeline.searched' : label === 'list' ? 'timeline.listed' : 'timeline.readFiles';
  return t(key, { count });
}

function itemColor(item: TimelineItem): string {
  if (item.status === 'error') return UI.danger;
  if (item.kind === 'command') return UI.accent;
  if (item.kind === 'files') return item.category === 'change' ? UI.warn : UI.muted;
  if (item.category === 'coordinate') return UI.note;
  if (item.kind === 'thought') return UI.muted;
  if (item.kind === 'narration') return UI.text;
  return UI.text;
}

function OutputLines({ item, cols }: { item: TimelineItem; cols: number }) {
  if (!item.output || item.output.length === 0) return null;
  const max = Math.max(40, cols - 8);
  return (
    <Box flexDirection="column">
      {item.output.map((line, i) => (
        <Text key={`${item.seq ?? 0}-out-${i}`} color={item.status === 'error' ? UI.danger : UI.muted} wrap="truncate-end">
          <Text color={UI.muted}>{i === 0 ? '└ ' : '  '}</Text>
          {truncate(line, max)}
        </Text>
      ))}
      {item.hiddenLines && item.hiddenLines > 0 ? (
        <Text color={UI.muted}>
          {'  '}
          {t('timeline.hiddenLines', { count: item.hiddenLines })}
        </Text>
      ) : null}
    </Box>
  );
}

function TimelineRow({ item, cols }: { item: TimelineItem; cols: number }) {
  const max = Math.max(40, cols - 8);
  if (item.kind === 'section') {
    return <Text color={UI.muted}>{'─'.repeat(Math.min(Math.max(20, cols - 4), 80))}</Text>;
  }
  if (item.kind === 'narration') {
    return (
      <Box marginTop={1} marginBottom={1}>
        <Text color={UI.text} wrap="wrap">
          {item.detail}
        </Text>
      </Box>
    );
  }
  if (item.kind === 'command') {
    return (
      <Box flexDirection="column" marginTop={1}>
        <Text color={item.status === 'error' ? UI.danger : UI.text} wrap="truncate-end">
          <Text color={UI.muted}>• </Text>
          <Text bold>{t('timeline.ran')} </Text>
          <Text color={UI.accent}>{truncate(item.command ?? '', max)}</Text>
        </Text>
        <OutputLines item={item} cols={cols} />
      </Box>
    );
  }
  if (item.kind === 'files') {
    const files = item.files ?? [];
    const shown = files.slice(0, 5).join(', ');
    const extra = files.length > 5 ? ` +${files.length - 5}` : '';
    return (
      <Text color={itemColor(item)} wrap="truncate-end">
        <Text color={UI.muted}>• </Text>
        <Text bold>{fileLabel(item.label, files.length)} </Text>
        <Text color={UI.muted}>{shown}{extra}</Text>
      </Text>
    );
  }
  if (item.output) {
    return (
      <Box flexDirection="column">
        <Text color={itemColor(item)} wrap="truncate-end">
          <Text color={UI.muted}>• </Text>
          {item.label}
        </Text>
        <OutputLines item={item} cols={cols} />
      </Box>
    );
  }
  return (
    <Text color={itemColor(item)} italic={item.kind === 'thought'} wrap="truncate-end">
      <Text color={UI.muted}>• </Text>
      {truncate(item.detail ? `${item.label} ${item.detail}` : item.label, max)}
    </Text>
  );
}

export function Timeline({ logs, raw = false, emptyText, cols = 100 }: { logs: LogEntry[]; raw?: boolean; emptyText?: string; cols?: number }) {
  const items = presentTimeline(logs, { raw, outputLines: raw ? 10 : 6 });
  if (items.length === 0) return <Text color={UI.muted}>{emptyText ?? t('timeline.empty')}</Text>;
  return (
    <Box flexDirection="column">
      {items.map((item, i) =>
        item.kind === 'section' ? (
          <Box key={`${item.seq ?? i}-section`} flexDirection="column" marginTop={1}>
            <TimelineRow item={item} cols={cols} />
            <Text color={UI.muted}>{sectionLabel(item.category)}</Text>
          </Box>
        ) : (
          <TimelineRow key={`${item.seq ?? i}-${i}`} item={item} cols={cols} />
        ),
      )}
    </Box>
  );
}
