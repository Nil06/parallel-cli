import React from 'react';
import { Box, Text, useInput } from 'ink';
import type { ApprovalRequest } from '../types.js';
import { t } from '../i18n.js';

interface Props {
  request: ApprovalRequest;
  pendingCount: number;
  onAnswer: (id: number, approved: boolean, always?: boolean) => void;
}

const SENTINEL = '<<NAME>>';

export function ApprovalPrompt({ request, pendingCount, onAnswer }: Props) {
  useInput((input) => {
    const c = input.toLowerCase();
    if (c === 'y' || c === 'o') onAnswer(request.id, true);
    else if (c === 'n') onAnswer(request.id, false);
    else if (c === 'a') onAnswer(request.id, true, true);
  });

  // appr.wants = "Agent {name} wants to run:" — render the name bold by splitting on the placeholder.
  const [before, after = ''] = t('appr.wants', { name: SENTINEL }).split(SENTINEL);

  return (
    <Box borderStyle="double" borderColor="magenta" flexDirection="column" paddingX={1}>
      <Text bold color="magenta">
        {t('appr.title')}
        {pendingCount > 1 ? t('appr.pending', { n: pendingCount }) : ''}
      </Text>
      <Text>
        {before}
        <Text bold>{request.agentName}</Text>
        {after}
      </Text>
      <Text color="yellowBright" bold>
        {'  $ '}
        {request.command}
      </Text>
      <Text color="gray">{t('appr.keys')}</Text>
    </Box>
  );
}
