import OpenAI from 'openai';
import type {
  ChatCompletionMessageParam,
  ChatCompletionTool,
  ChatCompletionMessage,
} from 'openai/resources/chat/completions';

export interface ChatResult {
  message: ChatCompletionMessage;
  tokensIn: number;
  tokensOut: number;
  cachedTokens: number;
  retries: number;
}

export interface LLMRequestOptions {
  maxTokens?: number;
  timeoutMs?: number;
}

export class LLMClient {
  private client: OpenAI;
  model: string;

  constructor(apiKey: string, baseUrl: string, model: string) {
    this.client = new OpenAI({ apiKey, baseURL: baseUrl });
    this.model = model;
  }

  /**
   * One chat completion round, with optional function-calling tools.
   * Retries on transient errors (429/5xx) with exponential backoff.
   */
  async chat(
    messages: ChatCompletionMessageParam[],
    tools?: ChatCompletionTool[],
    signal?: AbortSignal,
    options: LLMRequestOptions = {},
  ): Promise<ChatResult> {
    let lastErr: unknown;
    let retries = 0;
    for (let attempt = 0; attempt < 4; attempt++) {
      try {
        const res = await this.client.chat.completions.create(
          {
            model: this.model,
            messages,
            tools: tools && tools.length > 0 ? tools : undefined,
            temperature: 0.2,
            max_tokens: options.maxTokens ?? 4096,
          },
          { signal, timeout: options.timeoutMs },
        );
        const choice = res.choices[0];
        if (!choice?.message) throw new Error('Empty response from model');
        return {
          message: choice.message,
          tokensIn: res.usage?.prompt_tokens ?? 0,
          tokensOut: res.usage?.completion_tokens ?? 0,
          cachedTokens: Number((res.usage as any)?.prompt_tokens_details?.cached_tokens ?? 0),
          retries,
        };
      } catch (err: any) {
        lastErr = err;
        if (signal?.aborted) throw err;
        const status = err?.status ?? err?.response?.status;
        const retriable =
          status === 429 || (typeof status === 'number' && status >= 500) || err?.code === 'ECONNRESET';
        if (!retriable || attempt === 3) throw err;
        retries++;
        await new Promise((r) => setTimeout(r, 1500 * Math.pow(2, attempt)));
      }
    }
    throw lastErr;
  }
}
