import type { ModelPrice, ProviderConfig } from './types.js';

/**
 * Built-in pricing table (USD per 1M tokens) for well-known models — same
 * approach as Roo Code: known models are priced out of the box, and the user
 * can override or add prices per model in /settings (stored on the provider).
 * Prices drift over time; overrides always win.
 */
const BUILTIN: Record<string, ModelPrice> = {
  // OpenAI
  'gpt-4.1': { input: 2.00, output: 8.00 },
  'gpt-4.1-mini': { input: 0.40, output: 1.60 },
  'gpt-4.1-nano': { input: 0.10, output: 0.40 },
  'gpt-4o': { input: 2.50, output: 10.00 },
  'gpt-4o-mini': { input: 0.15, output: 0.60 },
  'gpt-4-turbo': { input: 10.00, output: 30.00 },
  'gpt-4': { input: 30.00, output: 60.00 },
  'gpt-3.5-turbo': { input: 0.50, output: 1.50 },
  'o4-mini': { input: 1.10, output: 4.40 },
  'o3': { input: 5.00, output: 20.00 },
  'o3-mini': { input: 0.55, output: 2.20 },
  'o1': { input: 15.00, output: 60.00 },
  'o1-mini': { input: 1.10, output: 4.40 },

  // Anthropic
  'claude-opus-4-20250514': { input: 15.00, output: 75.00 },
  'claude-sonnet-4-20250514': { input: 3.00, output: 15.00 },
  'claude-3.5-haiku': { input: 0.80, output: 4.00 },
  'claude-3.5-sonnet': { input: 3.00, output: 15.00 },
  'claude-3-opus': { input: 15.00, output: 75.00 },

  // Google Gemini
  'gemini-2.5-pro': { input: 1.25, output: 10.00 },
  'gemini-2.5-flash': { input: 0.15, output: 0.60 },
  'gemini-2.0-flash': { input: 0.10, output: 0.40 },
  'gemini-1.5-pro': { input: 1.25, output: 5.00 },
  'gemini-1.5-flash': { input: 0.075, output: 0.30 },

  // xAI Grok
  'grok-3': { input: 3.00, output: 15.00 },
  'grok-3-mini': { input: 0.30, output: 0.50 },
  'grok-2.1': { input: 2.00, output: 8.00 },
  'grok-2': { input: 2.00, output: 8.00 },

  // Mistral
  'mistral-large-latest': { input: 2.00, output: 6.00 },
  'mistral-medium': { input: 2.70, output: 8.10 },
  'mistral-small': { input: 0.25, output: 0.25 },
  'codestral': { input: 0.20, output: 0.60 },
  'pixtral-large': { input: 2.00, output: 6.00 },
  'ministral-8b': { input: 0.10, output: 0.10 },
  'ministral-3b': { input: 0.04, output: 0.04 },

  // Cohere
  'command-a': { input: 0.50, output: 0.75 },
  'command-r-plus': { input: 2.50, output: 10.00 },
  'command-r': { input: 0.50, output: 1.50 },
  'command-r7b': { input: 0.15, output: 0.15 },

  // Perplexity
  'sonar-reasoning-pro': { input: 2.00, output: 8.00 },
  'sonar-reasoning': { input: 1.00, output: 5.00 },
  'sonar-pro': { input: 3.00, output: 15.00 },
  'sonar': { input: 1.00, output: 1.00 },

  // DeepSeek
  'deepseek-chat': { input: 0.27, output: 1.10 },
  'deepseek-reasoner': { input: 0.55, output: 2.19 },

  // MiniMax
  'minimax-m1': { input: 0.40, output: 1.60 },
  'minimax-text-01': { input: 0.50, output: 2.00 },
  'minimax-m2': { input: 0.30, output: 1.20 },

  // Z.ai / GLM
  'glm-4.5': { input: 0.14, output: 0.14 },
  'glm-4-air': { input: 0.07, output: 0.07 },
  'glm-4-flash': { input: 0.00, output: 0.00 },
  'glm-4-plus': { input: 1.00, output: 4.00 },

  // Alibaba / Qwen
  'qwen3-235b-a22b': { input: 0.35, output: 0.35 },
  'qwen3-max': { input: 3.20, output: 12.80 },
  'qwen3-plus': { input: 0.80, output: 3.20 },
  'qwen-turbo': { input: 0.30, output: 0.60 },
  'qwen2.5-vl-72b': { input: 1.00, output: 4.00 },
  'qwq-32b': { input: 0.50, output: 2.00 },

  // Moonshot / Kimi
  'kimi-k2': { input: 0.55, output: 2.20 },
  'kimi-k2.5': { input: 0.60, output: 2.40 },
  'moonshot-v1-8k': { input: 0.60, output: 1.20 },
  'moonshot-v1-32k': { input: 1.20, output: 2.40 },
  'moonshot-v1-128k': { input: 2.40, output: 4.80 },

  // Xiaomi / MiMo
  'mimo-pro': { input: 0.30, output: 1.20 },
  'mimo-plus': { input: 0.50, output: 2.00 },

  // StepFun
  'step-3': { input: 0.60, output: 2.40 },
  'step-2-16k': { input: 0.30, output: 1.20 },
  'step-1-128k': { input: 0.50, output: 2.00 },

  // OpenRouter (charged with their markup, approximate)
  'openai/gpt-4o': { input: 2.50, output: 10.00 },
  'anthropic/claude-sonnet-4': { input: 3.00, output: 15.00 },
  'google/gemini-2.5-pro': { input: 1.25, output: 10.00 },
  'deepseek/deepseek-chat': { input: 0.27, output: 1.10 },
  'meta-llama/llama-4-maverick': { input: 0.50, output: 1.60 },

  // SiliconFlow
  'deepseek-ai/DeepSeek-V3': { input: 0.27, output: 1.10 },
  'deepseek-ai/DeepSeek-R1': { input: 0.55, output: 2.19 },
  'Qwen/Qwen2.5-72B': { input: 0.35, output: 0.35 },
  'Qwen/Qwen2.5-7B': { input: 0.07, output: 0.07 },
  'meta-llama/Llama-4-Maverick-17B': { input: 0.50, output: 1.60 },

  // Atlas Cloud
  'deepseek-v3': { input: 0.27, output: 1.10 },
  'deepseek-r1': { input: 0.55, output: 2.19 },
  'llama-4-maverick': { input: 0.50, output: 1.60 },

  // Groq
  'meta-llama/llama-4-scout-17b-16e-instruct': { input: 0.10, output: 0.20 },
  'meta-llama/llama-4-maverick-17b-128e-instruct': { input: 0.20, output: 0.40 },
  'qwen-2.5-32b': { input: 0.15, output: 0.30 },
  'deepseek-r1-distill-llama-70b': { input: 0.30, output: 2.00 },
  'llama-3.3-70b-versatile': { input: 0.15, output: 0.30 },
  'mixtral-8x7b-32768': { input: 0.10, output: 0.10 },

  // Cerebras
  'llama-4-scout-17b-16e-instruct': { input: 0.10, output: 0.20 },
  'llama-4-maverick-17b-128e-instruct': { input: 0.20, output: 0.40 },
  'llama-3.3-70b': { input: 0.10, output: 0.20 },
  'qwen-2.5-32b @cerebras': { input: 0.10, output: 0.20 },

  // Together AI
  'meta-llama/Llama-4-Maverick-17B-128E-Instruct': { input: 0.20, output: 0.40 },
  'meta-llama/Llama-3.3-70B-Instruct-Turbo': { input: 0.10, output: 0.20 },
  'deepseek-ai/DeepSeek-V3 @together': { input: 0.30, output: 1.20 },
  'deepseek-ai/DeepSeek-R1 @together': { input: 0.60, output: 2.40 },
  'Qwen/Qwen2.5-72B-Instruct-Turbo': { input: 0.10, output: 0.20 },
  'mistralai/Mixtral-8x22B': { input: 0.15, output: 0.15 },

  // Fireworks
  'accounts/fireworks/models/llama4-maverick-17b': { input: 0.20, output: 0.40 },
  'accounts/fireworks/models/llama4-scout-17b': { input: 0.10, output: 0.20 },
  'accounts/fireworks/models/llama-v3p3-70b': { input: 0.10, output: 0.20 },
  'accounts/fireworks/models/mixtral-8x22b': { input: 0.15, output: 0.15 },
  'accounts/fireworks/models/deepseek-v3': { input: 0.30, output: 1.20 },

  // DeepInfra
  'meta-llama/Llama-4-Maverick-17B-128E': { input: 0.20, output: 0.40 },
  'meta-llama/Llama-3.3-70B-Instruct': { input: 0.10, output: 0.20 },
  'deepseek-ai/DeepSeek-V3 @deepinfra': { input: 0.30, output: 1.20 },
  'deepseek-ai/DeepSeek-R1 @deepinfra': { input: 0.60, output: 2.40 },
  'Qwen/Qwen2.5-72B-Instruct': { input: 0.10, output: 0.20 },

  // Novita
  'meta-llama/llama-4-maverick-17b-128e': { input: 0.20, output: 0.40 },
  'meta-llama/llama-3.3-70b-instruct': { input: 0.10, output: 0.20 },
  'deepseek/deepseek-v3': { input: 0.30, output: 1.20 },
  'deepseek/deepseek-r1': { input: 0.60, output: 2.40 },
  'qwen/qwen-2.5-72b-instruct': { input: 0.10, output: 0.20 },

  // Hyperbolic
  'deepseek-ai/DeepSeek-V3 @hyperbolic': { input: 0.30, output: 1.20 },
  'deepseek-ai/DeepSeek-R1 @hyperbolic': { input: 0.60, output: 2.40 },
  'NousResearch/Hermes-3-Llama-3.1-405B': { input: 0.50, output: 1.00 },

  // SambaNova
  'Meta-Llama-4-Maverick-17B-128E-Instruct': { input: 0.20, output: 0.40 },
  'Meta-Llama-3.3-70B-Instruct': { input: 0.10, output: 0.20 },
  'DeepSeek-V3': { input: 0.30, output: 1.20 },
  'DeepSeek-R1': { input: 0.60, output: 2.40 },
  'Qwen2.5-72B-Instruct': { input: 0.10, output: 0.20 },

  // Ollama (free, local)
  'llama3.2': { input: 0.00, output: 0.00 },
  'llama3.1': { input: 0.00, output: 0.00 },
  'mistral': { input: 0.00, output: 0.00 },
  'codellama': { input: 0.00, output: 0.00 },
  'qwen2.5': { input: 0.00, output: 0.00 },
  'deepseek-r1 @ollama': { input: 0.00, output: 0.00 },
  'phi4': { input: 0.00, output: 0.00 },
  'gemma3': { input: 0.00, output: 0.00 },

  // vLLM / SGLang (free, local)
  'your-model-here': { input: 0.00, output: 0.00 },
};

/**
 * Resolve the price of a model: provider override first, then built-in table
 * (exact match, then prefix/substring for versioned names like
 * "claude-sonnet-4-20250514" or "openai/gpt-4o-mini"). null = unknown.
 */
export function priceFor(provider: ProviderConfig | undefined, model: string): ModelPrice | null {
  const override = provider?.prices?.[model];
  if (override) return override;
  const m = model.toLowerCase();
  // strip an optional "vendor/" prefix (OpenRouter-style ids)
  const bare = m.includes('/') ? m.slice(m.lastIndexOf('/') + 1) : m;
  if (BUILTIN[bare]) return BUILTIN[bare];
  // longest prefix wins so "deepseek-chat" beats nothing else
  let best: string | null = null;
  for (const key of Object.keys(BUILTIN)) {
    if ((bare.startsWith(key) || bare.includes(key)) && (!best || key.length > best.length)) best = key;
  }
  if (best) return BUILTIN[best];
  // local endpoints (ollama, llama.cpp, vLLM on localhost) → free
  if (provider && /localhost|127\.0\.0\.1|0\.0\.0\.0/.test(provider.baseUrl)) return { input: 0, output: 0 };
  return null;
}

/** Cost in USD of a token delta at a given price. */
export function costOf(price: ModelPrice, tokensIn: number, tokensOut: number): number {
  return (tokensIn * price.input + tokensOut * price.output) / 1_000_000;
}

/** "$0.0042", "$0.13", "$2.41" — compact, always meaningful. */
export function fmtCost(usd: number): string {
  if (usd === 0) return '$0.00';
  if (usd < 0.01) return `$${usd.toFixed(4)}`;
  if (usd < 1) return `$${usd.toFixed(3)}`;
  return `$${usd.toFixed(2)}`;
}
