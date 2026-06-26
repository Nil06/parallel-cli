import type { ChatCompletionMessageParam } from 'openai/resources/chat/completions';
import type { AgentPerf } from './types.js';

export interface AgentDiagnosticBudgets {
  maxRounds: number;
  maxToolCalls: number;
  maxShellCommands: number;
  maxRepeatedReads: number;
  maxRepeatedCommands: number;
  maxInputTokens: number;
  maxContextAmplification: number;
}

export interface AgentDiagnosticFinding {
  severity: 'info' | 'warn' | 'critical';
  code: string;
  message: string;
}

export interface AgentDiagnosticReport {
  messages: number;
  assistantRounds: number;
  toolCalls: number;
  toolCounts: Record<string, number>;
  shellCommands: number;
  readOnlyShellCommands: number;
  repeatedCommands: Array<{ command: string; count: number }>;
  repeatedReads: Array<{ path: string; count: number }>;
  inspectProjectCalls: number;
  readManyCalls: number;
  updateOnlyRounds: number;
  estimatedCompactionCalls: number;
  totalToolResultChars: number;
  largestToolResultChars: number;
  approximateContextCharsSent: number;
  transcriptChars: number;
  contextAmplification: number;
  inputTokens?: number;
  outputTokens?: number;
  elapsedMs?: number;
  perf?: Partial<AgentPerf>;
  findings: AgentDiagnosticFinding[];
  withinBudget: boolean;
}

export const SIMPLE_DIAGNOSTIC_BUDGETS: AgentDiagnosticBudgets = {
  maxRounds: 6,
  maxToolCalls: 12,
  maxShellCommands: 2,
  maxRepeatedReads: 1,
  maxRepeatedCommands: 1,
  maxInputTokens: 150_000,
  maxContextAmplification: 12,
};

function textSize(value: unknown): number {
  if (typeof value === 'string') return value.length;
  if (value === null || value === undefined) return 0;
  return JSON.stringify(value).length;
}

function parseArgs(raw: string | undefined): Record<string, unknown> {
  try {
    const parsed = JSON.parse(raw || '{}');
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

function counts<T extends string>(values: T[]): Array<{ value: T; count: number }> {
  const map = new Map<T, number>();
  for (const value of values) map.set(value, (map.get(value) ?? 0) + 1);
  return [...map.entries()]
    .filter(([, count]) => count > 1)
    .map(([value, count]) => ({ value, count }))
    .sort((a, b) => b.count - a.count || a.value.localeCompare(b.value));
}

export function analyzeAgentConversation(
  messages: ChatCompletionMessageParam[],
  observed: {
    inputTokens?: number;
    outputTokens?: number;
    elapsedMs?: number;
    perf?: Partial<AgentPerf>;
    budgets?: Partial<AgentDiagnosticBudgets>;
  } = {},
): AgentDiagnosticReport {
  const budgets = { ...SIMPLE_DIAGNOSTIC_BUDGETS, ...(observed.budgets ?? {}) };
  const toolCounts: Record<string, number> = {};
  const commands: string[] = [];
  const reads: string[] = [];
  let assistantRounds = 0;
  let toolCalls = 0;
  let updateOnlyRounds = 0;
  let totalToolResultChars = 0;
  let largestToolResultChars = 0;
  let approximateContextCharsSent = 0;
  let cumulativeChars = 0;
  let virtualHistoryMessages = 0;
  let estimatedCompactionCalls = 0;

  for (let index = 0; index < messages.length; index++) {
    const message = messages[index] as any;
    virtualHistoryMessages++;
    if (message.role === 'assistant') {
      assistantRounds++;
      approximateContextCharsSent += cumulativeChars;
      const calls = Array.isArray(message.tool_calls) ? message.tool_calls : [];
      const names = calls.map((call: any) => String(call.function?.name ?? 'unknown'));
      if (names.length > 0 && names.every((name: string) => name === 'update_status' || name === 'update_steps')) {
        updateOnlyRounds++;
      }
      for (const call of calls) {
        const name = String(call.function?.name ?? 'unknown');
        const args = parseArgs(call.function?.arguments);
        toolCalls++;
        toolCounts[name] = (toolCounts[name] ?? 0) + 1;
        if (name === 'run_command') commands.push(String(args.command ?? '').trim().replace(/\s+/g, ' '));
        if (name === 'read_file') reads.push(String(args.path ?? '').trim());
        if (name === 'read_many' && Array.isArray(args.paths)) reads.push(...args.paths.map(String));
      }
    }
    if (message.role === 'tool') {
      const size = textSize(message.content);
      totalToolResultChars += size;
      largestToolResultChars = Math.max(largestToolResultChars, size);
    }
    cumulativeChars += textSize(message.content) + textSize(message.tool_calls) + 20;
    const next = messages[index + 1] as any;
    const endsToolRound = message.role === 'tool' && next?.role !== 'tool';
    if (endsToolRound && virtualHistoryMessages > 80) {
      estimatedCompactionCalls++;
      virtualHistoryMessages = 42;
    }
  }

  const transcriptChars = Math.max(1, cumulativeChars);
  const repeatedCommands = counts(commands.filter(Boolean)).map(({ value, count }) => ({ command: value, count }));
  const repeatedReads = counts(reads.filter(Boolean)).map(({ value, count }) => ({ path: value, count }));
  const shellCommands = toolCounts.run_command ?? 0;
  const readOnlyShellCommands = observed.perf?.readOnlyShellCommands ?? shellCommands;
  const contextAmplification = approximateContextCharsSent / transcriptChars;
  const findings: AgentDiagnosticFinding[] = [];

  if (assistantRounds > budgets.maxRounds) {
    findings.push({
      severity: assistantRounds > budgets.maxRounds * 2 ? 'critical' : 'warn',
      code: 'too-many-model-rounds',
      message: `${assistantRounds} sequential model rounds exceed the simple-task budget of ${budgets.maxRounds}.`,
    });
  }
  if (toolCalls > budgets.maxToolCalls) {
    findings.push({
      severity: toolCalls > budgets.maxToolCalls * 2 ? 'critical' : 'warn',
      code: 'tool-churn',
      message: `${toolCalls} tool calls exceed the budget of ${budgets.maxToolCalls}.`,
    });
  }
  if (shellCommands > budgets.maxShellCommands) {
    findings.push({
      severity: 'critical',
      code: 'shell-micro-command-loop',
      message: `${shellCommands} shell commands were used; batch inspection tools should keep this below ${budgets.maxShellCommands}.`,
    });
  }
  if (repeatedReads.some((item) => item.count > budgets.maxRepeatedReads + 1)) {
    findings.push({
      severity: 'warn',
      code: 'repeated-file-reads',
      message: `Files were repeatedly re-read: ${repeatedReads.slice(0, 4).map((item) => `${item.path}×${item.count}`).join(', ')}.`,
    });
  }
  if (repeatedCommands.some((item) => item.count > budgets.maxRepeatedCommands + 1)) {
    findings.push({
      severity: 'warn',
      code: 'repeated-shell-commands',
      message: `Shell commands were repeated: ${repeatedCommands.slice(0, 3).map((item) => `${item.command}×${item.count}`).join(', ')}.`,
    });
  }
  if ((observed.inputTokens ?? 0) > budgets.maxInputTokens) {
    findings.push({
      severity: 'critical',
      code: 'prompt-token-amplification',
      message: `${observed.inputTokens?.toLocaleString()} cumulative input tokens exceed the simple-task budget of ${budgets.maxInputTokens.toLocaleString()}.`,
    });
  }
  if (contextAmplification > budgets.maxContextAmplification) {
    findings.push({
      severity: 'critical',
      code: 'full-history-resend',
      message: `Approximate context amplification is ${contextAmplification.toFixed(1)}× because prior tool output is resent on every model turn.`,
    });
  }
  if (largestToolResultChars > 10_000) {
    findings.push({
      severity: 'warn',
      code: 'large-tool-result',
      message: `The largest tool result was ${largestToolResultChars.toLocaleString()} characters and remained in later prompts.`,
    });
  }
  const compactionCalls = Math.max(observed.perf?.compactionTurns ?? 0, estimatedCompactionCalls);
  if (compactionCalls > 0) {
    findings.push({
      severity: 'warn',
      code: 'hidden-compaction-calls',
      message: `Approximately ${compactionCalls} extra model call(s) were spent compacting history outside the visible step count.`,
    });
  }
  if (updateOnlyRounds > 1) {
    findings.push({
      severity: 'info',
      code: 'coordination-only-rounds',
      message: `${updateOnlyRounds} model rounds only updated status/steps without inspecting or completing work.`,
    });
  }

  return {
    messages: messages.length,
    assistantRounds,
    toolCalls,
    toolCounts,
    shellCommands,
    readOnlyShellCommands,
    repeatedCommands,
    repeatedReads,
    inspectProjectCalls: toolCounts.inspect_project ?? 0,
    readManyCalls: toolCounts.read_many ?? 0,
    updateOnlyRounds,
    estimatedCompactionCalls,
    totalToolResultChars,
    largestToolResultChars,
    approximateContextCharsSent,
    transcriptChars,
    contextAmplification,
    inputTokens: observed.inputTokens,
    outputTokens: observed.outputTokens,
    elapsedMs: observed.elapsedMs,
    perf: observed.perf,
    findings,
    withinBudget: !findings.some((finding) => finding.severity === 'critical'),
  };
}

export function formatAgentDiagnostic(report: AgentDiagnosticReport): string {
  const lines = [
    'Agent performance diagnostic',
    `  rounds: ${report.assistantRounds}`,
    `  tools: ${report.toolCalls} (${Object.entries(report.toolCounts).map(([name, count]) => `${name}=${count}`).join(', ')})`,
    `  shell: ${report.shellCommands}`,
    `  tool output: ${report.totalToolResultChars.toLocaleString()} chars, max ${report.largestToolResultChars.toLocaleString()}`,
    `  context amplification: ${report.contextAmplification.toFixed(1)}×`,
    `  estimated hidden compactions: ${report.estimatedCompactionCalls}`,
  ];
  if (report.inputTokens !== undefined) lines.push(`  input tokens: ${report.inputTokens.toLocaleString()}`);
  if (report.elapsedMs !== undefined) lines.push(`  elapsed: ${(report.elapsedMs / 1000).toFixed(1)}s`);
  lines.push(`  budget: ${report.withinBudget ? 'PASS' : 'FAIL'}`);
  for (const finding of report.findings) {
    lines.push(`  [${finding.severity.toUpperCase()}] ${finding.code}: ${finding.message}`);
  }
  return lines.join('\n');
}
