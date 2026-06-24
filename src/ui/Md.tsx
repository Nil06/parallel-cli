import React from 'react';
import { Box, Text } from 'ink';
import { BRAND } from './tokens.js';

/**
 * Mini markdown renderer for agent summaries — line-based, zero deps.
 * Supports: ## headers, - / * bullets, numbered lists, **bold**, `code`.
 * Everything else is printed as wrapped plain text (Ink handles the wrapping).
 */

function inline(text: string, keyPrefix: string): React.ReactNode[] {
  const parts = text.split(/(\*\*[^*]+\*\*|`[^`]+`)/g).filter(Boolean);
  return parts.map((p, i) => {
    if (p.startsWith('**') && p.endsWith('**')) {
      return (
        <Text key={`${keyPrefix}-${i}`} bold>
          {p.slice(2, -2)}
        </Text>
      );
    }
    if (p.startsWith('`') && p.endsWith('`')) {
      return (
        <Text key={`${keyPrefix}-${i}`} color="yellowBright">
          {p.slice(1, -1)}
        </Text>
      );
    }
    return <Text key={`${keyPrefix}-${i}`}>{p}</Text>;
  });
}

export function Md({ text, dim }: { text: string; dim?: boolean }) {
  const lines = text.replace(/\r\n/g, '\n').split('\n');
  return (
    <Box flexDirection="column">
      {lines.map((raw, i) => {
        const line = raw.trimEnd();
        if (!line.trim()) return <Text key={i}> </Text>;
        const header = line.match(/^#{1,3}\s+(.*)$/);
        if (header) {
          return (
            <Text key={i} bold color={BRAND.primary}>
              {header[1]}
            </Text>
          );
        }
        const bullet = line.match(/^(\s*)[-*]\s+(.*)$/);
        if (bullet) {
          return (
            <Text key={i} wrap="wrap" dimColor={dim}>
              {bullet[1]}
              <Text color={BRAND.primary}>• </Text>
              {inline(bullet[2], `b${i}`)}
            </Text>
          );
        }
        const numbered = line.match(/^(\s*)(\d+)[.)]\s+(.*)$/);
        if (numbered) {
          return (
            <Text key={i} wrap="wrap" dimColor={dim}>
              {numbered[1]}
              <Text color={BRAND.primary}>{numbered[2]}. </Text>
              {inline(numbered[3], `n${i}`)}
            </Text>
          );
        }
        return (
          <Text key={i} wrap="wrap" dimColor={dim}>
            {inline(line, `l${i}`)}
          </Text>
        );
      })}
    </Box>
  );
}
