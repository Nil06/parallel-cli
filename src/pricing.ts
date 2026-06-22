import type { ModelPrice, ProviderConfig } from './types.js';

/**
 * Built-in pricing table (USD per 1M tokens) for well-known models — same
 * approach as Roo Code: known models are priced out of the box, and the user
 * can override or add prices per model in /settings (stored on the provider).
 * Prices drift over time; overrides always win.
 */
const BUILTIN: Record<string, ModelPrice> = {
  // === Western ===

  // OpenAI
  'gpt-5.5': { input: 5.00, output: 30.00, cacheHit: 0.50 },
  'gpt-5.5-pro': { input: 30.00, output: 180.00, cacheHit: 3.00 },
  'gpt-5.4': { input: 1.25, output: 10.00, cacheHit: 0.125 }, // approx
  'gpt-5.3-codex': { input: 1.25, output: 10.00, cacheHit: 0.125 }, // approx
  'gpt-4o': { input: 2.50, output: 10.00 },
  'gpt-4o-mini': { input: 0.15, output: 0.60 },
  'o4-mini': { input: 1.10, output: 4.40 },
  'o3': { input: 5.00, output: 20.00 },
  'o3-mini': { input: 0.55, output: 2.20 },
  'o1': { input: 15.00, output: 60.00 },
  'o1-mini': { input: 1.10, output: 4.40 },

  // Anthropic
  'claude-opus-4-8': { input: 5.00, output: 25.00, cacheHit: 0.50 },
  'claude-opus-4-7': { input: 5.00, output: 25.00, cacheHit: 0.50 },
  'claude-sonnet-4-6': { input: 3.00, output: 15.00, cacheHit: 0.30 },
  'claude-haiku-4-5': { input: 1.00, output: 5.00, cacheHit: 0.10 },

  // Google Gemini
  'gemini-3.1-pro': { input: 2.00, output: 12.00, cacheHit: 0.20 }, // tiered: >200K = 2×/1.5×
  'gemini-3.5-flash': { input: 1.50, output: 9.00, cacheHit: 0.15 },
  'gemini-3-flash': { input: 0.60, output: 3.00, cacheHit: 0.06 }, // approx
  'gemini-3.1-flash-lite': { input: 0.10, output: 0.40, cacheHit: 0.01 },

  // xAI Grok
  'grok-4': { input: 3.00, output: 15.00 }, // approx
  'grok-4-fast-reasoning': { input: 0.20, output: 0.50 }, // approx
  'grok-3': { input: 3.00, output: 15.00 },
  'grok-code-fast-1': { input: 0.20, output: 1.50 }, // approx

  // Mistral
  'mistral-large-2': { input: 2.00, output: 6.00 },
  'magistral-medium': { input: 2.00, output: 5.00 },
  'codestral-latest': { input: 0.30, output: 0.90 },
  'mistral-small-latest': { input: 0.20, output: 0.60 },

  // Cohere
  'command-a': { input: 2.50, output: 10.00 },
  'command-r-plus': { input: 2.50, output: 10.00 },

  // Perplexity
  'sonar-pro': { input: 3.00, output: 15.00 },
  'sonar-deep-research': { input: 2.00, output: 8.00 },

  // === Chinese ===

  // DeepSeek
  'deepseek-v4-pro': { input: 0.435, output: 0.87, cacheHit: 0.0036 },
  'deepseek-v4-flash': { input: 0.14, output: 0.28, cacheHit: 0.003 },
  'deepseek-chat': { input: 0.27, output: 1.10, cacheHit: 0.027 },
  'deepseek-reasoner': { input: 0.55, output: 2.19, cacheHit: 0.14 },

  // MiniMax — list pricing
  'MiniMax-M3': { input: 0.60, output: 2.40, cacheHit: 0.12 },
  'MiniMax-M2.7': { input: 0.30, output: 1.20, cacheHit: 0.06 },
  'MiniMax-M2.7-highspeed': { input: 0.60, output: 2.40, cacheHit: 0.06 },

  // Z.ai / GLM
  'glm-5.2': { input: 1.00, output: 3.20 },
  'glm-5.1': { input: 1.00, output: 3.20 },
  'glm-4.7': { input: 0.60, output: 2.20 },
  'glm-4.7-flash': { input: 0.00, output: 0.00 }, // free
  'glm-5v-turbo': { input: 0.30, output: 0.90 },

  // Alibaba / Qwen
  'qwen3.7-max': { input: 1.25, output: 3.75 }, // promo price, cache: yes
  'qwen3.6-max-preview': { input: 1.04, output: 6.24 }, // tiered, lower bound
  'qwen3.6-plus': { input: 0.40, output: 1.20 },
  'qwen3.5-coder': { input: 0.20, output: 0.60 },

  // Moonshot / Kimi
  'kimi-k2.6': { input: 0.95, output: 4.00, cacheHit: 0.16 },
  'kimi-k2.7-code': { input: 0.95, output: 4.00, cacheHit: 0.19 },
  'kimi-k2.5': { input: 0.60, output: 3.00, cacheHit: 0.10 },
  'moonshot-v1-128k': { input: 0.85, output: 1.70 },

  // Xiaomi / MiMo
  'mimo-v2-pro': { input: 0.30, output: 1.00 }, // approx
  'mimo-v2-omni': { input: 0.40, output: 1.50 }, // approx

  // StepFun
  'step-2-16k': { input: 0.50, output: 1.50 }, // approx

  // === Gateways ===

  // OpenRouter
  'openai/gpt-5.5': { input: 5.00, output: 30.00 },
  'anthropic/claude-sonnet-4-6': { input: 3.00, output: 15.00 },
  'google/gemini-3.5-flash': { input: 1.50, output: 9.00 },
  'deepseek/deepseek-v4-pro': { input: 0.435, output: 0.87 },
  'meta-llama/llama-4-maverick': { input: 0.50, output: 1.60 },
  'mistralai/mistral-large-2': { input: 2.00, output: 6.00 },

  // SiliconFlow
  'deepseek-ai/DeepSeek-V4-Pro': { input: 0.435, output: 0.87 },
  'deepseek-ai/DeepSeek-R1': { input: 0.55, output: 2.19 },
  'Qwen/Qwen3-Coder-480B': { input: 0.20, output: 0.60 },
  'glm-4/GLM-5.2': { input: 1.00, output: 3.20 },
  'moonshotai/Kimi-K2.6': { input: 0.95, output: 4.00 },

  // Atlas Cloud
  'deepseek-v4-pro @atlas': { input: 0.435, output: 0.87 },
  'deepseek-r1 @atlas': { input: 0.55, output: 2.19 },
  'qwen3.7-max @atlas': { input: 1.25, output: 3.75 },
  'glm-5.2 @atlas': { input: 1.00, output: 3.20 },
  'kimi-k2.6 @atlas': { input: 0.95, output: 4.00 },
  'llama-4-maverick @atlas': { input: 0.50, output: 1.60 },

  // Requesty — 0% markup, same as direct
  'gpt-5.5 @requesty': { input: 5.00, output: 30.00 },
  'claude-sonnet-4-6 @requesty': { input: 3.00, output: 15.00 },
  'gemini-3.5-flash @requesty': { input: 1.50, output: 9.00 },
  'deepseek-v4-pro @requesty': { input: 0.435, output: 0.87 },
  'llama-4-maverick @requesty': { input: 0.50, output: 1.60 },
  'mistral-large-2 @requesty': { input: 2.00, output: 6.00 },

  // Vercel AI Gateway — list price, no markup
  'gpt-5.5 @vercel': { input: 5.00, output: 30.00 },
  'claude-sonnet-4-6 @vercel': { input: 3.00, output: 15.00 },
  'gemini-3.5-flash @vercel': { input: 1.50, output: 9.00 },
  'deepseek-v4-pro @vercel': { input: 0.435, output: 0.87 },
  'llama-4-maverick @vercel': { input: 0.50, output: 1.60 },

  // === Inference hosts ===

  // Groq
  'qwen-2.5-coder-32b': { input: 0.30, output: 0.50 },
  'deepseek-r1-distill-llama-70b': { input: 0.30, output: 2.00 },
  'kimi-k2.6 @groq': { input: 1.00, output: 3.00 },
  'llama-3.3-70b-versatile': { input: 0.15, output: 0.30 },

  // Cerebras
  'llama-4-maverick-17b-128e-instruct': { input: 0.65, output: 0.85 },
  'qwen3-coder-480b @cerebras': { input: 2.00, output: 2.00 },
  'kimi-k2.6 @cerebras': { input: 1.65, output: 6.50 },
  'llama-3.3-70b @cerebras': { input: 0.10, output: 0.20 },

  // Together AI
  'meta-llama/Llama-4-Maverick-17B-128E-Instruct': { input: 0.27, output: 0.85 },
  'deepseek-ai/DeepSeek-V3 @together': { input: 0.30, output: 0.30 },
  'Qwen/Qwen3-Coder-480B @together': { input: 0.40, output: 1.20 },
  'moonshotai/Kimi-K2.6 @together': { input: 0.60, output: 2.50 },

  // Fireworks
  'accounts/fireworks/models/llama4-maverick-17b': { input: 0.22, output: 0.88 },
  'accounts/fireworks/models/deepseek-v3': { input: 0.90, output: 0.90 },
  'accounts/fireworks/models/qwen3-coder-480b': { input: 0.45, output: 1.80 },
  'accounts/fireworks/models/kimi-k2.6': { input: 0.60, output: 2.50 },

  // DeepInfra
  'meta-llama/Llama-4-Maverick-17B-128E': { input: 0.20, output: 0.60 },
  'deepseek-ai/DeepSeek-V3 @deepinfra': { input: 0.26, output: 0.38 },
  'Qwen/Qwen3-Coder-480B @deepinfra': { input: 0.30, output: 1.00 },
  'moonshotai/Kimi-K2.6 @deepinfra': { input: 0.75, output: 3.50, cacheHit: 0.15 },

  // Novita
  'meta-llama/llama-4-maverick-17b-128e': { input: 0.20, output: 0.60 },
  'deepseek/deepseek-v3': { input: 0.10, output: 0.28 },
  'qwen/qwen3-coder-480b': { input: 0.30, output: 1.20 },
  'moonshotai/kimi-k2.6': { input: 0.57, output: 2.30 },

  // Hyperbolic
  'meta-llama/Llama-4-Maverick-17B-128E @hyperbolic': { input: 0.20, output: 0.60 },
  'deepseek-ai/DeepSeek-V3 @hyperbolic': { input: 0.25, output: 0.85 },
  'Qwen/Qwen3-Coder-480B @hyperbolic': { input: 0.30, output: 1.20 },
  'moonshotai/Kimi-K2.6 @hyperbolic': { input: 0.80, output: 3.00 },

  // SambaNova
  'Meta-Llama-4-Maverick-17B-128E-Instruct': { input: 0.20, output: 0.30 },
  'DeepSeek-V3 @sambanova': { input: 1.00, output: 1.50 },
  'Llama-3.3-70B-Instruct': { input: 0.10, output: 0.20 },

  // === Local (free) ===

  // Ollama
  'qwen3-coder:480b': { input: 0.00, output: 0.00 },
  'glm-4.7 @ollama': { input: 0.00, output: 0.00 },
  'deepseek-v3 @ollama': { input: 0.00, output: 0.00 },
  'kimi-k2 @ollama': { input: 0.00, output: 0.00 },
  'llama3.2': { input: 0.00, output: 0.00 },
  'mistral @ollama': { input: 0.00, output: 0.00 },
  'codellama': { input: 0.00, output: 0.00 },
  'gemma3': { input: 0.00, output: 0.00 },

  // vLLM / SGLang
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
