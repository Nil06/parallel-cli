import type { ModelPrice, ProviderConfig } from './types.js';

/**
 * Built-in pricing table (USD per 1M tokens) for well-known models — same
 * approach as Roo Code: known models are priced out of the box, and the user
 * can override or add prices per model in /settings (stored on the provider).
 * Prices drift over time; overrides always win.
 */
const BUILTIN: Record<string, ModelPrice> = {
  // DeepSeek
  'deepseek-v4-flash': { input: 0.27, output: 1.1 },
  'deepseek-v4-pro': { input: 0.55, output: 2.19 },
  'deepseek-chat': { input: 0.27, output: 1.1 },
  'deepseek-reasoner': { input: 0.55, output: 2.19 },
  // OpenAI
  'gpt-4o': { input: 2.5, output: 10 },
  'gpt-4o-mini': { input: 0.15, output: 0.6 },
  'gpt-4.1': { input: 2, output: 8 },
  'gpt-4.1-mini': { input: 0.4, output: 1.6 },
  'gpt-4.1-nano': { input: 0.1, output: 0.4 },
  'o3-mini': { input: 1.1, output: 4.4 },
  'o4-mini': { input: 1.1, output: 4.4 },
  // Anthropic
  'claude-opus-4': { input: 15, output: 75 },
  'claude-sonnet-4': { input: 3, output: 15 },
  'claude-haiku-4': { input: 1, output: 5 },
  'claude-3-5-haiku': { input: 0.8, output: 4 },
  // Mistral
  'mistral-large': { input: 2, output: 6 },
  'codestral': { input: 0.3, output: 0.9 },
  'devstral': { input: 0.1, output: 0.3 },
  // Alibaba
  'qwen2.5-coder': { input: 0.09, output: 0.09 },
  'qwen-max': { input: 1.6, output: 6.4 },
  // Local endpoints are free
  'ollama': { input: 0, output: 0 },
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
