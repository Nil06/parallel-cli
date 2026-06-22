import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import type { ParallelConfig, ProviderConfig } from './types.js';

let configHomeOverride: string | undefined;

export function setConfigHome(dir: string): void {
  configHomeOverride = path.resolve(dir.replace(/^~(?=$|\/)/, os.homedir()));
}

export function configDir(): string {
  return configHomeOverride ?? path.join(os.homedir(), '.parallel');
}

export function configFile(): string {
  return path.join(configDir(), 'config.json');
}

export const DEEPSEEK_PROVIDER: ProviderConfig = {
  name: 'DeepSeek',
  baseUrl: 'https://api.deepseek.com/v1',
  apiKey: '',
  models: ['deepseek-v4-pro', 'deepseek-v4-flash', 'deepseek-chat', 'deepseek-reasoner'],
  defaultModel: 'deepseek-v4-pro',
};

export const PROVIDER_PRESETS: ProviderConfig[] = [
  // ── 🇺🇸 Western ──
  {
    name: 'OpenAI',
    baseUrl: 'https://api.openai.com/v1',
    apiKey: '',
    models: ['gpt-5.5', 'gpt-5.5-pro', 'gpt-5.4', 'gpt-5.3-codex', 'gpt-4o', 'gpt-4o-mini', 'o4-mini', 'o3', 'o3-mini', 'o1', 'o1-mini'],
    defaultModel: 'gpt-5.5',
    category: 'western',
  },
  {
    name: 'Anthropic',
    baseUrl: 'https://api.anthropic.com/v1',
    apiKey: '',
    models: ['claude-opus-4-8', 'claude-opus-4-7', 'claude-sonnet-4-6', 'claude-haiku-4-5'],
    defaultModel: 'claude-sonnet-4-6',
    category: 'western',
  },
  {
    name: 'Google Gemini',
    baseUrl: 'https://generativelanguage.googleapis.com/v1beta/openai',
    apiKey: '',
    models: ['gemini-3.1-pro', 'gemini-3.5-flash', 'gemini-3-flash', 'gemini-3.1-flash-lite'],
    defaultModel: 'gemini-3.5-flash',
    category: 'western',
  },
  {
    name: 'xAI Grok',
    baseUrl: 'https://api.x.ai/v1',
    apiKey: '',
    models: ['grok-4', 'grok-4-fast-reasoning', 'grok-3', 'grok-code-fast-1'],
    defaultModel: 'grok-4',
    category: 'western',
  },
  {
    name: 'Mistral',
    baseUrl: 'https://api.mistral.ai/v1',
    apiKey: '',
    models: ['mistral-large-2', 'magistral-medium', 'codestral-latest', 'mistral-small-latest'],
    defaultModel: 'mistral-large-2',
    category: 'western',
  },
  {
    name: 'Cohere',
    baseUrl: 'https://api.cohere.com/v1',
    apiKey: '',
    models: ['command-a', 'command-r-plus'],
    defaultModel: 'command-a',
    category: 'western',
  },
  {
    name: 'Perplexity',
    baseUrl: 'https://api.perplexity.ai',
    apiKey: '',
    models: ['sonar-pro', 'sonar-deep-research'],
    defaultModel: 'sonar-pro',
    category: 'western',
  },
  // ── 🇨🇳 Chinese ──
  {
    name: 'DeepSeek',
    baseUrl: 'https://api.deepseek.com/v1',
    apiKey: '',
    models: ['deepseek-v4-pro', 'deepseek-v4-flash', 'deepseek-chat', 'deepseek-reasoner'],
    defaultModel: 'deepseek-v4-pro',
    category: 'chinese',
  },
  {
    name: 'MiniMax',
    baseUrl: 'https://api.minimax.io/v1',
    apiKey: '',
    models: ['MiniMax-M3', 'MiniMax-M2.7', 'MiniMax-M2.7-highspeed'],
    defaultModel: 'MiniMax-M3',
    category: 'chinese',
  },
  {
    name: 'Z.ai / GLM',
    baseUrl: 'https://open.bigmodel.cn/api/paas/v4',
    apiKey: '',
    models: ['glm-5.2', 'glm-5.1', 'glm-4.7', 'glm-4.7-flash', 'glm-5v-turbo'],
    defaultModel: 'glm-5.2',
    category: 'chinese',
  },
  {
    name: 'Alibaba / Qwen',
    baseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
    apiKey: '',
    models: ['qwen3.7-max', 'qwen3.6-max-preview', 'qwen3.6-plus', 'qwen3.5-coder'],
    defaultModel: 'qwen3.7-max',
    category: 'chinese',
  },
  {
    name: 'Moonshot / Kimi',
    baseUrl: 'https://api.moonshot.cn/v1',
    apiKey: '',
    models: ['kimi-k2.6', 'kimi-k2.7-code', 'kimi-k2.5', 'moonshot-v1-128k'],
    defaultModel: 'kimi-k2.6',
    category: 'chinese',
  },
  {
    name: 'Xiaomi / MiMo',
    baseUrl: 'https://api.minimaxi.com/v1',
    apiKey: '',
    models: ['mimo-v2-pro', 'mimo-v2-omni'],
    defaultModel: 'mimo-v2-pro',
    category: 'chinese',
  },
  {
    name: 'StepFun',
    baseUrl: 'https://api.stepfun.com/v1',
    apiKey: '',
    models: ['step-2-16k'],
    defaultModel: 'step-2-16k',
    category: 'chinese',
  },
  // ── 🌐 Gateways ──
  {
    name: 'OpenRouter',
    baseUrl: 'https://openrouter.ai/api/v1',
    apiKey: '',
    models: ['openai/gpt-5.5', 'anthropic/claude-sonnet-4-6', 'google/gemini-3.5-flash', 'deepseek/deepseek-v4-pro', 'meta-llama/llama-4-maverick', 'mistralai/mistral-large-2'],
    defaultModel: 'openai/gpt-5.5',
    category: 'gateways',
  },
  {
    name: 'SiliconFlow',
    baseUrl: 'https://api.siliconflow.cn/v1',
    apiKey: '',
    models: ['deepseek-ai/DeepSeek-V4-Pro', 'deepseek-ai/DeepSeek-R1', 'Qwen/Qwen3-Coder-480B', 'glm-4/GLM-5.2', 'moonshotai/Kimi-K2.6'],
    defaultModel: 'deepseek-ai/DeepSeek-V4-Pro',
    category: 'gateways',
  },
  {
    name: 'Atlas Cloud',
    baseUrl: 'https://api.atlascloud.ai/v1',
    apiKey: '',
    models: ['deepseek-v4-pro', 'deepseek-r1', 'qwen3.7-max', 'glm-5.2', 'kimi-k2.6', 'llama-4-maverick'],
    defaultModel: 'deepseek-v4-pro',
    category: 'gateways',
  },
  {
    name: 'Requesty',
    baseUrl: 'https://api.requesty.ai/api/v1',
    apiKey: '',
    models: ['gpt-5.5', 'claude-sonnet-4-6', 'gemini-3.5-flash', 'deepseek-v4-pro', 'llama-4-maverick', 'mistral-large-2'],
    defaultModel: 'gpt-5.5',
    category: 'gateways',
  },
  {
    name: 'Vercel AI Gateway',
    baseUrl: 'https://api.vercel.ai/v1',
    apiKey: '',
    models: ['gpt-5.5', 'claude-sonnet-4-6', 'gemini-3.5-flash', 'deepseek-v4-pro', 'llama-4-maverick'],
    defaultModel: 'gpt-5.5',
    category: 'gateways',
  },
  // ── ⚡ Inference ──
  {
    name: 'Groq',
    baseUrl: 'https://api.groq.com/openai/v1',
    apiKey: '',
    models: ['qwen-2.5-coder-32b', 'deepseek-r1-distill-llama-70b', 'kimi-k2.6', 'llama-3.3-70b-versatile'],
    defaultModel: 'qwen-2.5-coder-32b',
    category: 'inference',
  },
  {
    name: 'Cerebras',
    baseUrl: 'https://api.cerebras.ai/v1',
    apiKey: '',
    models: ['llama-4-maverick-17b-128e-instruct', 'qwen3-coder-480b', 'kimi-k2.6', 'llama-3.3-70b'],
    defaultModel: 'llama-4-maverick-17b-128e-instruct',
    category: 'inference',
  },
  {
    name: 'Together AI',
    baseUrl: 'https://api.together.xyz/v1',
    apiKey: '',
    models: ['meta-llama/Llama-4-Maverick-17B-128E-Instruct', 'deepseek-ai/DeepSeek-V3', 'Qwen/Qwen3-Coder-480B', 'moonshotai/Kimi-K2.6'],
    defaultModel: 'meta-llama/Llama-4-Maverick-17B-128E-Instruct',
    category: 'inference',
  },
  {
    name: 'Fireworks',
    baseUrl: 'https://api.fireworks.ai/inference/v1',
    apiKey: '',
    models: ['accounts/fireworks/models/llama4-maverick-17b', 'accounts/fireworks/models/deepseek-v3', 'accounts/fireworks/models/qwen3-coder-480b', 'accounts/fireworks/models/kimi-k2.6'],
    defaultModel: 'accounts/fireworks/models/llama4-maverick-17b',
    category: 'inference',
  },
  {
    name: 'DeepInfra',
    baseUrl: 'https://api.deepinfra.com/v1/openai',
    apiKey: '',
    models: ['meta-llama/Llama-4-Maverick-17B-128E', 'deepseek-ai/DeepSeek-V3', 'Qwen/Qwen3-Coder-480B', 'moonshotai/Kimi-K2.6'],
    defaultModel: 'meta-llama/Llama-4-Maverick-17B-128E',
    category: 'inference',
  },
  {
    name: 'Novita',
    baseUrl: 'https://api.novita.ai/v3/openai',
    apiKey: '',
    models: ['meta-llama/llama-4-maverick-17b-128e', 'deepseek/deepseek-v3', 'qwen/qwen3-coder-480b', 'moonshotai/kimi-k2.6'],
    defaultModel: 'meta-llama/llama-4-maverick-17b-128e',
    category: 'inference',
  },
  {
    name: 'Hyperbolic',
    baseUrl: 'https://api.hyperbolic.ai/v1',
    apiKey: '',
    models: ['meta-llama/Llama-4-Maverick-17B-128E', 'deepseek-ai/DeepSeek-V3', 'Qwen/Qwen3-Coder-480B', 'moonshotai/Kimi-K2.6'],
    defaultModel: 'meta-llama/Llama-4-Maverick-17B-128E',
    category: 'inference',
  },
  {
    name: 'SambaNova',
    baseUrl: 'https://api.sambanova.ai/v1',
    apiKey: '',
    models: ['Meta-Llama-4-Maverick-17B-128E-Instruct', 'DeepSeek-V3', 'Llama-3.3-70B-Instruct'],
    defaultModel: 'Meta-Llama-4-Maverick-17B-128E-Instruct',
    category: 'inference',
  },
  // ── 🏠 Local ──
  {
    name: 'Ollama',
    baseUrl: 'http://localhost:11434/v1',
    apiKey: 'ollama-local',
    models: ['qwen3-coder:480b', 'glm-4.7', 'deepseek-v3', 'kimi-k2', 'llama3.2', 'mistral', 'codellama', 'gemma3'],
    defaultModel: 'qwen3-coder:480b',
    category: 'local',
  },
  {
    name: 'vLLM / SGLang',
    baseUrl: 'http://localhost:8000/v1',
    apiKey: '',
    models: ['your-model-here'],
    defaultModel: '',
    category: 'local',
  },
];

export const DEFAULTS: ParallelConfig = {
  providers: [],
  defaultProvider: '',
  approvalMode: 'ask',
  maxStepsPerAgent: 60,
  soundEnabled: true,
  recentFolders: [],
};

function normalizeApprovalMode(mode: unknown): ParallelConfig['approvalMode'] {
  if (mode === 'ask' || mode === 'auto-safe' || mode === 'yolo') return mode;
  if (mode === 'auto') return 'auto-safe';
  return 'ask';
}

export function getProvider(cfg: ParallelConfig, name?: string): ProviderConfig | undefined {
  const n = (name ?? cfg.defaultProvider).toLowerCase();
  return cfg.providers.find((p) => p.name.toLowerCase() === n) ?? (name ? undefined : cfg.providers[0]);
}

export function upsertProvider(cfg: ParallelConfig, p: ProviderConfig): void {
  const i = cfg.providers.findIndex((x) => x.name.toLowerCase() === p.name.toLowerCase());
  if (i >= 0) cfg.providers[i] = p;
  else cfg.providers.push(p);
  if (!cfg.defaultProvider) cfg.defaultProvider = p.name;
  saveConfig(cfg);
}

/** Migrate the pre-provider config shape {apiKey, baseUrl, model} → providers[]. */
function migrate(raw: Record<string, unknown>, cfg: ParallelConfig): void {
  if (Array.isArray(raw.providers)) return; // already new shape
  const apiKey = typeof raw.apiKey === 'string' ? raw.apiKey : '';
  const baseUrl = typeof raw.baseUrl === 'string' ? raw.baseUrl : DEEPSEEK_PROVIDER.baseUrl;
  const model = typeof raw.model === 'string' ? raw.model : DEEPSEEK_PROVIDER.defaultModel;
  if (!apiKey && baseUrl === DEEPSEEK_PROVIDER.baseUrl) return; // nothing worth migrating
  const isDeepseek = baseUrl.includes('deepseek');
  const p: ProviderConfig = isDeepseek
    ? { ...DEEPSEEK_PROVIDER, apiKey, defaultModel: model, models: [...new Set([...DEEPSEEK_PROVIDER.models, model])] }
    : { name: 'Custom', baseUrl, apiKey, models: [model], defaultModel: model };
  cfg.providers = [p];
  cfg.defaultProvider = p.name;
}

export function loadConfig(): ParallelConfig {
  let cfg: ParallelConfig = { ...DEFAULTS, providers: [] };
  try {
    const file = configFile();
    if (fs.existsSync(file)) {
      const raw = JSON.parse(fs.readFileSync(file, 'utf8')) as Record<string, unknown>;
      cfg = { ...cfg, ...raw } as ParallelConfig;
      if (!Array.isArray(cfg.providers)) cfg.providers = [];
      cfg.approvalMode = normalizeApprovalMode(raw.approvalMode);
      migrate(raw, cfg);
    }
  } catch {
    // ignore corrupted config
  }
  // Env vars: ensure a DeepSeek provider exists / override the default provider.
  const envKey = process.env.PARALLEL_API_KEY || process.env.DEEPSEEK_API_KEY;
  if (envKey && cfg.providers.length === 0) {
    cfg.providers = [{ ...DEEPSEEK_PROVIDER, apiKey: envKey }];
    cfg.defaultProvider = DEEPSEEK_PROVIDER.name;
  } else if (envKey) {
    const p = getProvider(cfg);
    if (p) p.apiKey = envKey;
  }
  const p = getProvider(cfg);
  if (p) {
    if (process.env.PARALLEL_BASE_URL) p.baseUrl = process.env.PARALLEL_BASE_URL;
    if (process.env.PARALLEL_MODEL) {
      p.defaultModel = process.env.PARALLEL_MODEL;
      if (!p.models.includes(p.defaultModel)) p.models.push(p.defaultModel);
    }
  }
  if (!Array.isArray(cfg.recentFolders)) cfg.recentFolders = [];
  cfg.approvalMode = normalizeApprovalMode(cfg.approvalMode);
  return cfg;
}

export function saveConfig(cfg: ParallelConfig): void {
  try {
    fs.mkdirSync(configDir(), { recursive: true });
    fs.writeFileSync(configFile(), JSON.stringify(cfg, null, 2));
  } catch {
    // best effort
  }
}

export function rememberFolder(cfg: ParallelConfig, folder: string): void {
  cfg.recentFolders = [folder, ...cfg.recentFolders.filter((f) => f !== folder)].slice(0, 8);
  saveConfig(cfg);
}
