import React from 'react';
import { Box, Text } from 'ink';
import * as Diff from 'diff';
import type { FileChange } from '../types.js';
import { BRAND } from './tokens.js';
import { truncate } from './theme.js';
import { t } from '../i18n.js';

export interface PatchPreview {
  lines: string[];
  hiddenLines: number;
}

export function patchPreview(change: FileChange, maxLines = 30, context = 2): PatchPreview {
  const patch = Diff.createPatch(change.path, change.before, change.after, '', '', { context });
  const body = patch.split('\n').slice(4);
  return {
    lines: body.slice(0, maxLines),
    hiddenLines: Math.max(0, body.length - maxLines),
  };
}

export function patchLineColor(line: string): string {
  if (line.startsWith('+')) return 'green';
  if (line.startsWith('-')) return 'red';
  if (line.startsWith('@')) return BRAND.primary;
  return 'gray';
}

export function DiffPatch({ change, maxLines = 30, context = 2, cols = 100 }: { change: FileChange; maxLines?: number; context?: number; cols?: number }) {
  const preview = patchPreview(change, maxLines, context);
  const max = Math.max(40, cols - 8);
  return (
    <Box flexDirection="column">
      {preview.lines.map((line, i) => (
        <Text key={i} color={patchLineColor(line)} wrap="truncate-end">
          {truncate(line || ' ', max)}
        </Text>
      ))}
      {preview.hiddenLines > 0 ? <Text color="gray">{t('diff.trunc')}</Text> : null}
    </Box>
  );
}
