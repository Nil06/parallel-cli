import React, { useEffect, useRef, useState } from 'react';
import { Box, Text, useInput } from 'ink';
import type { AgentQuestion } from '../types.js';
import { t } from '../i18n.js';

interface Props {
  question: AgentQuestion;
  pendingCount: number;
  onAnswer: (id: number, answer: string, auto?: boolean) => void;
}

const COUNTDOWN_S = 30;
const SENTINEL = '<<NAME>>';

/**
 * Agent question with auto-run: a visible 30s countdown; when it reaches 0 the
 * recommended option is chosen automatically. Any keystroke (navigation or
 * digit) PAUSES the countdown — the user has shown they are at the keyboard.
 */
export function QuestionPrompt({ question, pendingCount, onAnswer }: Props) {
  const [cursor, setCursor] = useState(question.recommended);
  const [left, setLeft] = useState(COUNTDOWN_S);
  const [paused, setPaused] = useState(false);
  const answered = useRef(false);

  const answer = (idx: number, auto = false) => {
    if (answered.current) return;
    answered.current = true;
    onAnswer(question.id, question.options[idx], auto);
  };

  // Countdown — ticks only while not paused; fires the recommended option at 0.
  useEffect(() => {
    if (paused) return;
    const timer = setInterval(() => {
      setLeft((s) => {
        if (s <= 1) {
          clearInterval(timer);
          answer(question.recommended, true);
          return 0;
        }
        return s - 1;
      });
    }, 1000);
    return () => clearInterval(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [paused, question.id]);

  useInput((input, key) => {
    // The user is typing → pause the auto-run countdown.
    if (!paused) setPaused(true);
    if (key.upArrow) setCursor((c) => (c - 1 + question.options.length) % question.options.length);
    else if (key.downArrow) setCursor((c) => (c + 1) % question.options.length);
    else if (key.return) answer(cursor);
    else {
      const n = parseInt(input, 10);
      if (!Number.isNaN(n) && n >= 1 && n <= question.options.length) answer(n - 1);
    }
  });

  const [before, after = ''] = t('q.from', { name: SENTINEL }).split(SENTINEL);

  return (
    <Box borderStyle="double" borderColor="yellow" flexDirection="column" paddingX={1}>
      <Box justifyContent="space-between">
        <Text bold color="yellow">
          {t('q.title')}
          {pendingCount > 1 ? t('q.pending', { n: pendingCount }) : ''}
        </Text>
        <Text color={paused ? 'gray' : left <= 10 ? 'redBright' : 'yellow'} bold>
          {paused ? t('q.paused') : t('q.autorun', { s: String(left) })}
        </Text>
      </Box>
      <Text>
        {before}
        <Text bold>{question.agentName}</Text>
        {after} {question.question}
      </Text>
      {question.options.map((opt, i) => (
        <Text key={i} color={i === cursor ? 'yellowBright' : undefined} bold={i === cursor}>
          {i === cursor ? ' ▸ ' : '   '}
          {i + 1}. {opt}
          {i === question.recommended ? <Text color="green"> {t('q.recommended')}</Text> : null}
        </Text>
      ))}
      <Text color="gray">{t('q.keys')}</Text>
    </Box>
  );
}
