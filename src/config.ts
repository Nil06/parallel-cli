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
  baseUrl: 'https://api.deepseek.com',
  apiKey: '',
  models: ['deepseek-v4-flash', 'deepseek-v4-pro', 'deepseek-chat', 'deepseek-reasoner'],
  defaultModel: 'deepseek-v4-flash',
};

export const PROVIDER_PRESETS: ProviderConfig[] = [
  {
    name: 'OpenAI',
    baseUrl: 'https://api.openai.com/v1',
    apiKey: '',
    models: ['gpt-4o', 'gpt-4o-mini', 'o4-mini', 'gpt-4.1', 'gpt-4.1-mini'],
    defaultModel: 'gpt-4o',
  },
  DEEPSEEK_PROVIDER,
  {
    name: 'Anthropic',
    baseUrl: 'https://api.anthropic.com/v1/',
    apiKey: '',
    models: ['claude-sonnet-4-6', 'claude-opus-4-8'],
    defaultModel: 'claude-sonnet-4-6',
  },
  {
    name: 'OpenRouter',
    baseUrl: 'https://openrouter.ai/api/v1',
    apiKey: '',
    models: ['openai/gpt-4o', 'anthropic/claude-sonnet-4', 'deepseek/deepseek-chat', 'google/gemini-pro'],
    defaultModel: 'openai/gpt-4o',
  },
  {
    name: 'Gemini',
    baseUrl: 'https://generativelanguage.googleapis.com/v1beta/openai/',
    apiKey: '',
    models: ['gemini-3.5-flash', 'gemini-3.5-pro', 'gemini-2.5-pro'],
    defaultModel: 'gemini-3.5-flash',
  },
  {
    name: 'Mistral',
    baseUrl: 'https://api.mistral.ai/v1',
    apiKey: '',
    models: ['mistral-large-latest', 'mistral-small-latest', 'codestral-latest'],
    defaultModel: 'mistral-large-latest',
  },
  {
    name: 'Groq',
    baseUrl: 'https://api.groq.com/openai/v1',
    apiKey: '',
    models: ['llama-3.3-70b-versatile', 'openai/gpt-oss-120b'],
    defaultModel: 'llama-3.3-70b-versatile',
  },
  {
    name: 'Together',
    baseUrl: 'https://api.together.ai/v1',
    apiKey: '',
    models: ['openai/gpt-oss-120b', 'openai/gpt-oss-20b'],
    defaultModel: 'openai/gpt-oss-120b',
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
