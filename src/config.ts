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
  models: ['deepseek-chat', 'deepseek-reasoner'],
  defaultModel: 'deepseek-chat',
};

export const PROVIDER_PRESETS: ProviderConfig[] = [
  // ── 🇺🇸 Western ──
  {
    name: 'OpenAI',
    baseUrl: 'https://api.openai.com/v1',
    apiKey: '',
    models: ['gpt-4.1', 'gpt-4.1-mini', 'gpt-4.1-nano', 'gpt-4o', 'gpt-4o-mini', 'gpt-4-turbo', 'gpt-4', 'gpt-3.5-turbo', 'o4-mini', 'o3', 'o3-mini', 'o1', 'o1-mini'],
    defaultModel: 'gpt-4o-mini',
    category: 'western',
  },
  {
    name: 'Anthropic',
    baseUrl: 'https://api.anthropic.com/v1',
    apiKey: '',
    models: ['claude-opus-4-20250514', 'claude-sonnet-4-20250514', 'claude-3.5-haiku', 'claude-3.5-sonnet', 'claude-3-opus'],
    defaultModel: 'claude-sonnet-4-20250514',
    category: 'western',
  },
  {
    name: 'Google Gemini',
    baseUrl: 'https://generativelanguage.googleapis.com/v1beta/openai',
    apiKey: '',
    models: ['gemini-2.5-pro', 'gemini-2.5-flash', 'gemini-2.0-flash', 'gemini-1.5-pro', 'gemini-1.5-flash'],
    defaultModel: 'gemini-2.5-flash',
    category: 'western',
  },
  {
    name: 'xAI Grok',
    baseUrl: 'https://api.x.ai/v1',
    apiKey: '',
    models: ['grok-3', 'grok-3-mini', 'grok-2.1', 'grok-2'],
    defaultModel: 'grok-3-mini',
    category: 'western',
  },
  {
    name: 'Mistral',
    baseUrl: 'https://api.mistral.ai/v1',
    apiKey: '',
    models: ['mistral-large-latest', 'mistral-medium', 'mistral-small', 'codestral', 'pixtral-large', 'ministral-8b', 'ministral-3b', 'mistral-embed'],
    defaultModel: 'mistral-large-latest',
    category: 'western',
  },
  {
    name: 'Cohere',
    baseUrl: 'https://api.cohere.com/v1',
    apiKey: '',
    models: ['command-r-plus', 'command-r', 'command-r7b', 'command-a', 'command-light', 'embed-v4', 'rerank-v3.5'],
    defaultModel: 'command-a',
    category: 'western',
  },
  {
    name: 'Perplexity',
    baseUrl: 'https://api.perplexity.ai',
    apiKey: '',
    models: ['sonar-reasoning-pro', 'sonar-reasoning', 'sonar-pro', 'sonar', 'r1-1776'],
    defaultModel: 'sonar',
    category: 'western',
  },
  // ── 🇨🇳 Chinese ──
  {
    name: 'DeepSeek',
    baseUrl: 'https://api.deepseek.com/v1',
    apiKey: '',
    models: ['deepseek-chat', 'deepseek-reasoner'],
    defaultModel: 'deepseek-chat',
    category: 'chinese',
  },
  {
    name: 'MiniMax',
    baseUrl: 'https://api.minimax.io/v1',
    apiKey: '',
    models: ['minimax-m1', 'minimax-text-01', 'minimax-m2', 'abab6.5s-chat', 'abab7-chat'],
    defaultModel: 'minimax-m1',
    category: 'chinese',
  },
  {
    name: 'Z.ai / GLM',
    baseUrl: 'https://open.bigmodel.cn/api/paas/v4',
    apiKey: '',
    models: ['glm-4.5', 'glm-4-air', 'glm-4-flash', 'glm-4-long', 'glm-4-plus', 'glm-4v-plus', 'cogview-4'],
    defaultModel: 'glm-4.5',
    category: 'chinese',
  },
  {
    name: 'Alibaba / Qwen',
    baseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
    apiKey: '',
    models: ['qwen3-235b-a22b', 'qwen3-max', 'qwen3-plus', 'qwen-turbo', 'qwen2.5-vl-72b', 'qwen-long', 'qwq-32b', 'qwen-coder-plus'],
    defaultModel: 'qwen3-max',
    category: 'chinese',
  },
  {
    name: 'Moonshot / Kimi',
    baseUrl: 'https://api.moonshot.cn/v1',
    apiKey: '',
    models: ['kimi-k2', 'kimi-k2.5', 'moonshot-v1-8k', 'moonshot-v1-32k', 'moonshot-v1-128k'],
    defaultModel: 'kimi-k2',
    category: 'chinese',
  },
  {
    name: 'Xiaomi / MiMo',
    baseUrl: 'https://api.minimaxi.com/v1',
    apiKey: '',
    models: ['mimo-7b', 'mimo-13b', 'mimo-pro', 'mimo-plus'],
    defaultModel: 'mimo-pro',
    category: 'chinese',
  },
  {
    name: 'StepFun',
    baseUrl: 'https://api.stepfun.com/v1',
    apiKey: '',
    models: ['step-3', 'step-2-16k', 'step-1-128k', 'step-1v', 'step-1.5v-mini', 'step-audio'],
    defaultModel: 'step-3',
    category: 'chinese',
  },
  // ── 🌐 Gateways ──
  {
    name: 'OpenRouter',
    baseUrl: 'https://openrouter.ai/api/v1',
    apiKey: '',
    models: ['openai/gpt-4o', 'anthropic/claude-sonnet-4', 'google/gemini-2.5-pro', 'deepseek/deepseek-chat', 'meta-llama/llama-4-maverick', 'mistralai/mistral-large'],
    defaultModel: 'openai/gpt-4o',
    category: 'gateways',
  },
  {
    name: 'SiliconFlow',
    baseUrl: 'https://api.siliconflow.cn/v1',
    apiKey: '',
    models: ['deepseek-ai/DeepSeek-V3', 'deepseek-ai/DeepSeek-R1', 'Qwen/Qwen2.5-72B', 'Qwen/Qwen2.5-7B', 'meta-llama/Llama-4-Maverick-17B', 'internlm/internlm3-8b'],
    defaultModel: 'deepseek-ai/DeepSeek-V3',
    category: 'gateways',
  },
  {
    name: 'Atlas Cloud',
    baseUrl: 'https://api.atlascloud.ai/v1',
    apiKey: '',
    models: ['deepseek-v3', 'deepseek-r1', 'llama-4-maverick', 'gemini-2.5-flash', 'claude-sonnet-4-20250514', 'gpt-4o'],
    defaultModel: 'deepseek-v3',
    category: 'gateways',
  },
  {
    name: 'Requesty',
    baseUrl: 'https://api.requesty.ai/api/v1',
    apiKey: '',
    models: ['gpt-4o', 'claude-sonnet-4-20250514', 'gemini-2.5-pro', 'deepseek-chat', 'llama-4-maverick', 'mistral-large'],
    defaultModel: 'gpt-4o',
    category: 'gateways',
  },
  {
    name: 'Vercel AI Gateway',
    baseUrl: 'https://api.vercel.ai/v1',
    apiKey: '',
    models: ['gpt-4o', 'claude-sonnet-4-20250514', 'gemini-2.5-pro', 'deepseek-chat', 'llama-4-maverick'],
    defaultModel: 'gpt-4o',
    category: 'gateways',
  },
  // ── ⚡ Inference ──
  {
    name: 'Groq',
    baseUrl: 'https://api.groq.com/openai/v1',
    apiKey: '',
    models: ['meta-llama/llama-4-scout-17b-16e-instruct', 'meta-llama/llama-4-maverick-17b-128e-instruct', 'qwen-2.5-32b', 'deepseek-r1-distill-llama-70b', 'llama-3.3-70b-versatile', 'mixtral-8x7b-32768'],
    defaultModel: 'meta-llama/llama-4-scout-17b-16e-instruct',
    category: 'inference',
  },
  {
    name: 'Cerebras',
    baseUrl: 'https://api.cerebras.ai/v1',
    apiKey: '',
    models: ['llama-4-scout-17b-16e-instruct', 'llama-4-maverick-17b-128e-instruct', 'llama-3.3-70b', 'deepseek-r1-distill-llama-70b', 'qwen-2.5-32b'],
    defaultModel: 'llama-4-scout-17b-16e-instruct',
    category: 'inference',
  },
  {
    name: 'Together AI',
    baseUrl: 'https://api.together.xyz/v1',
    apiKey: '',
    models: ['meta-llama/Llama-4-Maverick-17B-128E-Instruct', 'meta-llama/Llama-3.3-70B-Instruct-Turbo', 'deepseek-ai/DeepSeek-V3', 'deepseek-ai/DeepSeek-R1', 'Qwen/Qwen2.5-72B-Instruct-Turbo', 'mistralai/Mixtral-8x22B'],
    defaultModel: 'meta-llama/Llama-4-Maverick-17B-128E-Instruct',
    category: 'inference',
  },
  {
    name: 'Fireworks',
    baseUrl: 'https://api.fireworks.ai/inference/v1',
    apiKey: '',
    models: ['accounts/fireworks/models/llama4-maverick-17b', 'accounts/fireworks/models/llama4-scout-17b', 'accounts/fireworks/models/llama-v3p3-70b', 'accounts/fireworks/models/mixtral-8x22b', 'accounts/fireworks/models/deepseek-v3'],
    defaultModel: 'accounts/fireworks/models/llama4-maverick-17b',
    category: 'inference',
  },
  {
    name: 'DeepInfra',
    baseUrl: 'https://api.deepinfra.com/v1/openai',
    apiKey: '',
    models: ['meta-llama/Llama-4-Maverick-17B-128E', 'meta-llama/Llama-3.3-70B-Instruct', 'deepseek-ai/DeepSeek-V3', 'deepseek-ai/DeepSeek-R1', 'microsoft/WizardLM-2-8x22B', 'Qwen/Qwen2.5-72B-Instruct'],
    defaultModel: 'meta-llama/Llama-4-Maverick-17B-128E',
    category: 'inference',
  },
  {
    name: 'Novita',
    baseUrl: 'https://api.novita.ai/v3/openai',
    apiKey: '',
    models: ['meta-llama/llama-4-maverick-17b-128e', 'meta-llama/llama-3.3-70b-instruct', 'deepseek/deepseek-v3', 'deepseek/deepseek-r1', 'qwen/qwen-2.5-72b-instruct'],
    defaultModel: 'meta-llama/llama-4-maverick-17b-128e',
    category: 'inference',
  },
  {
    name: 'Hyperbolic',
    baseUrl: 'https://api.hyperbolic.ai/v1',
    apiKey: '',
    models: ['meta-llama/Llama-4-Maverick-17B-128E', 'meta-llama/Llama-3.3-70B-Instruct', 'deepseek-ai/DeepSeek-V3', 'deepseek-ai/DeepSeek-R1', 'Qwen/Qwen2.5-72B-Instruct', 'NousResearch/Hermes-3-Llama-3.1-405B'],
    defaultModel: 'meta-llama/Llama-4-Maverick-17B-128E',
    category: 'inference',
  },
  {
    name: 'SambaNova',
    baseUrl: 'https://api.sambanova.ai/v1',
    apiKey: '',
    models: ['Meta-Llama-4-Maverick-17B-128E-Instruct', 'Meta-Llama-3.3-70B-Instruct', 'DeepSeek-V3', 'DeepSeek-R1', 'Qwen2.5-72B-Instruct'],
    defaultModel: 'Meta-Llama-4-Maverick-17B-128E-Instruct',
    category: 'inference',
  },
  // ── 🏠 Local ──
  {
    name: 'Ollama',
    baseUrl: 'http://localhost:11434/v1',
    apiKey: 'ollama-local',
    models: ['llama3.2', 'llama3.1', 'mistral', 'codellama', 'qwen2.5', 'deepseek-r1', 'phi4', 'gemma3'],
    defaultModel: 'llama3.2',
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
