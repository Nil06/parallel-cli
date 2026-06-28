export type AgentState =
  | 'idle'
  | 'thinking'
  | 'listening'
  | 'working'
  | 'waiting'
  | 'paused'
  | 'done'
  | 'error'
  | 'stopped';

export interface AgentInfo {
  id: string;
  name: string;
  /** Short stable handle (a1, a2, …) — always addressable via @a1 even when the agent has a custom name. */
  alias: string;
  color: string;
  task: string;
  mode: AgentMode;
  /** Runtime budget selected automatically or forced by the user. */
  profile: ExecutionProfile;
  model: string;
  state: AgentState;
  currentAction: string;
  steps: number;
  tokensIn: number;
  tokensOut: number;
  /** Accumulated cost in USD — null when no pricing is known for the model. */
  cost: number | null;
  startedAt: number;
  /** Set once when the agent reaches done/error/stopped so elapsed time stops moving. */
  endedAt?: number;
  lastResult?: string;
  /** Specialist persona used to spawn this agent, if any. */
  specialist?: string;
  /** Work areas this agent has declared (claim_files) — advisory, never blocking. */
  claims?: string[];
  /** Estimated context-window usage (0-100 %), updated after every model call. */
  ctxPct?: number;
  /** User-facing progress checklist, Cursor-style. */
  progressSteps?: AgentProgressStep[];
  /** Lightweight performance counters for this agent run. */
  perf?: AgentPerf;
  /** Files whose content this agent inspected during this run. */
  inspectedFiles?: string[];
}

export interface AgentProgressStep {
  text: string;
  status: 'pending' | 'active' | 'done';
}

export interface AgentPerf {
  modelTurns: number;
  toolCalls: number;
  shellCommands: number;
  shellMs: number;
  readOnlyShellCommands: number;
  /** Wall-clock time spent waiting for normal model turns. */
  llmMs: number;
  /** Extra model calls used to compact long history; not part of agent steps. */
  compactionTurns: number;
  compactionMs: number;
  /** Largest single prompt reported by the provider. */
  maxPromptTokens: number;
  /** Provider retries performed outside visible agent turns. */
  retries: number;
  /** Prompt tokens served from a provider cache when reported. */
  cachedTokens: number;
}

export interface Note {
  id: number;
  from: string; // agent name | 'user' | 'system'
  to: string; // agent name | 'all' | 'user'
  content: string;
  ts: number;
}

/** Who touched which file last (advisory awareness — never blocking). */
export interface FileActivity {
  path: string;
  agentId: string;
  agentName: string;
  op: 'write' | 'edit' | 'shell';
  revision?: number;
  ts: number;
}

export interface FileChange {
  id: number;
  agentId: string;
  agentName: string;
  path: string;
  before: string;
  after: string;
  beforeRevision?: number;
  afterRevision?: number;
  ts: number;
}

export interface WorkMapWarning {
  id: string;
  level: 'info' | 'warn' | 'conflict';
  title: string;
  detail: string;
  paths: string[];
  agentNames: string[];
  ts: number;
  count?: number;
}

export type LogKind = 'info' | 'tool' | 'tool_result' | 'llm' | 'error' | 'note' | 'system' | 'memory';

export interface LogEntry {
  agentId: string; // '' = global/system
  kind: LogKind;
  text: string;
  ts: number;
  changeId?: number;
  /** Optional model-generated UI narration for this event; static i18n is the offline fallback. */
  narration?: string;
  /** Monotonic id — lets attached terminals stream only the lines they have not seen yet. */
  seq?: number;
}

export interface ApprovalRequest {
  id: number;
  agentId: string;
  agentName: string;
  command: string;
  resolve: (approved: boolean) => void;
}

/**
 * A question an agent asks the user when it is blocked or needs direction.
 * Shown in the TUI with a visible 30s countdown: if the user does not answer
 * in time, the recommended option is chosen automatically (auto-run). Typing
 * pauses the countdown.
 */
export interface AgentQuestion {
  id: number;
  agentId: string;
  agentName: string;
  question: string;
  options: string[];
  /** Index of the recommended option (auto-selected when the countdown ends). */
  recommended: number;
  resolve: (response: { answer: string; auto: boolean }) => void;
}

export type ShellApprovalMode = 'ask' | 'auto-safe' | 'yolo';
export type ApprovalMode = ShellApprovalMode;
export type AgentMode = 'ask' | 'task' | 'plan';
export type ExecutionProfile = 'quick' | 'standard' | 'deep';

export type Lang = 'en' | 'zh' | 'es' | 'fr';

/**
 * A named OpenAI-compatible provider, persisted in the GLOBAL config
 * (~/.parallel/config.json). The user names it, points it at a base URL,
 * supplies an API key, and lists model names exactly as written in the
 * provider's documentation.
 */
export interface ProviderConfig {
  name: string;
  baseUrl: string;
  apiKey: string;
  models: string[];
  defaultModel: string;
  /** USD per 1M tokens, per model — overrides the built-in pricing table. */
  prices?: Record<string, ModelPrice>;
  /** Category for grouping in UI (western, chinese, gateways, inference, local) */
  category?: string;
  /** False for local/OpenAI-compatible endpoints that do not require auth. */
  requiresApiKey?: boolean;
}

/** Pricing of a model in USD per 1 million tokens. */
export interface ModelPrice {
  input: number;
  output: number;
  /** Optional cache-hit price per 1M tokens. Only for providers that offer prompt caching. */
  cacheHit?: number;
}

/** Global (initial) settings — editable later via /settings. */
export interface ParallelConfig {
  language?: Lang;
  providers: ProviderConfig[];
  defaultProvider: string;
  approvalMode: ShellApprovalMode;
  maxStepsPerAgent: number;
  soundEnabled: boolean;
  recentFolders: string[];
}

/** Session-scoped settings — initialized from globals, editable via /settings-session. Never persisted to the global config. */
export interface SessionSettings {
  providerName: string;
  model: string;
  approvalMode: ShellApprovalMode;
  soundEnabled: boolean;
}

export interface SessionData {
  savedAt: string;
  /** Optional user-given name (/save <name>) — shown in /sessions. */
  name?: string;
  projectRoot: string;
  agents: {
    id?: string;
    name: string;
    alias?: string;
    task: string;
    mode?: AgentMode;
    profile?: ExecutionProfile;
    state: string;
    lastResult?: string;
    startedAt?: number;
    steps?: number;
    tokensIn?: number;
    tokensOut?: number;
    cost?: number | null;
    endedAt?: number;
    providerName?: string;
    model?: string;
    specialist?: string;
    claims?: string[];
    ctxPct?: number;
    progressSteps?: AgentProgressStep[];
    perf?: AgentPerf;
    inspectedFiles?: string[];
    /** Path to the agent's full conversation (JSONL) — enables /restore. */
    conversation?: string;
  }[];
  notes: Note[];
  changes?: FileChange[];
  fileActivity?: FileActivity[];
  workMapWarnings?: WorkMapWarning[];
  changedFiles: string[];
  projectContext?: {
    schemaVersion: number;
    generatedAt?: string;
    fingerprint?: string;
    status?: ProjectContextStatus;
  };
}

export type ProjectContextStatus = 'idle' | 'indexing' | 'ready' | 'fallback' | 'error';

export interface ProjectContextFile {
  path: string;
  hash: string;
  inspectedAt: string;
}

export interface ProjectContextWork {
  agentName: string;
  task: string;
  result: string;
  inspectedFiles: string[];
  changedFiles: string[];
  completedAt: string;
}

export interface ProjectContextData {
  schemaVersion: 1;
  generatedAt: string;
  projectRoot: string;
  gitHead: string;
  fingerprint: string;
  model?: string;
  architecture: string;
  entryPoints: string[];
  conventions: string[];
  pitfalls: string[];
  files: ProjectContextFile[];
  recentWork: ProjectContextWork[];
  deterministicSeed: string;
  tokensIn: number;
  tokensOut: number;
  cost: number | null;
}

/** A reusable skill (markdown file) the user can invoke and agents can load. */
export interface Skill {
  name: string;
  description: string;
  body: string;
  scope: 'global' | 'project';
  file: string;
}

/** A configurable specialist persona: role definition + optional pinned model. */
export interface Specialist {
  name: string;
  description: string;
  /** Optional "provider:model" or bare model pinned to this specialist. */
  model?: string;
  /** Role definition appended to the agent's system prompt. */
  role: string;
  scope: 'global' | 'project';
  file: string;
}
