import type { AgentMode, ExecutionProfile } from '../types.js';

export interface ExecutionBudget {
  profile: ExecutionProfile;
  maxRounds: number;
  maxToolCalls: number;
  maxShellCommands: number;
  maxInputTokens: number;
  maxResultChars: number;
  maxRecentMessages: number;
  convergenceAt: number;
}

export const EXECUTION_BUDGETS: Record<ExecutionProfile, ExecutionBudget> = {
  quick: {
    profile: 'quick',
    maxRounds: 6,
    maxToolCalls: 12,
    maxShellCommands: 2,
    maxInputTokens: 150_000,
    maxResultChars: 8_000,
    maxRecentMessages: 24,
    convergenceAt: 0.7,
  },
  standard: {
    profile: 'standard',
    maxRounds: 16,
    maxToolCalls: 32,
    maxShellCommands: 6,
    maxInputTokens: 600_000,
    maxResultChars: 16_000,
    maxRecentMessages: 42,
    convergenceAt: 0.75,
  },
  deep: {
    profile: 'deep',
    maxRounds: 60,
    maxToolCalls: 120,
    maxShellCommands: 30,
    maxInputTokens: 3_000_000,
    maxResultChars: 32_000,
    maxRecentMessages: 80,
    convergenceAt: 0.82,
  },
};

const COMPLEX = /\b(migrat|refactor|architecture|redesign|rewrite|exhaustive|end[- ]to[- ]end|across|monorepo|multi[- ]service|security audit|performance audit|release|deploy)\b/i;
const SIMPLE = /\b(explain|find|locate|where|why|diagnos|inspect|verify|check|typo|rename|toggle|small|simple)\b/i;

export function classifyExecutionProfile(task: string, mode: AgentMode, forced?: ExecutionProfile): ExecutionProfile {
  if (forced) return forced;
  if (mode === 'plan') return 'deep';
  if (mode === 'ask') return COMPLEX.test(task) || task.length > 1_200 ? 'standard' : 'quick';
  const pathMentions = task.match(/\b[\w./-]+\.(?:ts|tsx|js|mjs|json|md|py|rs|go|java)\b/g)?.length ?? 0;
  if (COMPLEX.test(task) || pathMentions > 3 || task.length > 1_600) return 'standard';
  if (SIMPLE.test(task) || pathMentions <= 1 || task.length < 500) return 'quick';
  return 'standard';
}

export function nextExecutionProfile(profile: ExecutionProfile): ExecutionProfile | null {
  if (profile === 'quick') return 'standard';
  if (profile === 'standard') return 'deep';
  return null;
}

export function shouldEscalateExecution(task: string, inspectedFiles: number, changedFiles: number): boolean {
  return COMPLEX.test(task) || inspectedFiles > 3 || changedFiles > 3;
}
