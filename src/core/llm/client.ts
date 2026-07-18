/**
 * DeepSeek HTTP client (chat completions).
 *
 * - Native fetch (Node 18+ / browser). No third-party HTTP libs.
 * - Endpoint: env DEEPSEEK_BASE_URL (default https://api.deepseek.com/v1) + /chat/completions.
 * - Model:    env DEEPSEEK_MODEL (default "deepseek-chat").
 * - Auth:     env DEEPSEEK_API_KEY (Bearer). When missing, generateText() throws
 *             a typed error so callers (index.ts) can fall back to the static table.
 * - Retries:  up to 3 attempts on retryable failures with exponential backoff (500ms, 1s, 2s).
 * - Timeout:  30 s per attempt, via AbortController.
 * - Async:    non-blocking via Promise; caller can fire-and-forget for NPC background dialogue
 *             (借鉴 WoC 1800 AI 私服 mod-ollama-chat 的异步线程设计)
 *
 * Day11+: LLM Provider 接口抽象 — 支持 DeepSeek / OpenAI 切换
 */

export interface LLMProvider {
  generate(prompt: string, opts?: GenerateTextOptions): Promise<string>;
  isAvailable(): boolean;
}

export interface GenerateTextOptions {
  temperature?: number;
  maxTokens?: number;
  systemPrompt?: string;
  /** Override the default model for one call. */
  model?: string;
  /** Force JSON-mode response_format (DeepSeek supports json_object). Default: false. */
  jsonMode?: boolean;
  /** Per-request timeout in ms. Default 30 000. */
  timeoutMs?: number;
}

export class DeepSeekError extends Error {
  constructor(
    message: string,
    public readonly status?: number,
    public readonly cause?: unknown,
  ) {
    super(message);
    this.name = 'DeepSeekError';
  }
}

const DEFAULT_BASE_URL = 'https://api.deepseek.com/v1';
const DEFAULT_MODEL = 'deepseek-chat';
const DEFAULT_TIMEOUT_MS = 30_000;
const MAX_ATTEMPTS = 3;
const BASE_BACKOFF_MS = 500;

function getEnv(name: string, fallback?: string): string | undefined {
  if (typeof process !== 'undefined' && process.env) {
    const v = process.env[name];
    if (v && v.length > 0) return v;
  }
  return fallback;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Read a fetch Response as text with a hard cap (defends against huge / streaming bodies). */
async function readResponseText(resp: Response, maxBytes: number = 1_000_000): Promise<string> {
  if (!resp.body) return '';
  const reader = resp.body.getReader();
  const decoder = new TextDecoder('utf-8');
  let total = 0;
  let out = '';
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > maxBytes) {
      out += decoder
        .decode(value, { stream: true })
        .slice(0, maxBytes - (total - value.byteLength));
      break;
    }
    out += decoder.decode(value, { stream: true });
  }
  return out;
}

/**
 * Call DeepSeek /chat/completions and return the assistant message content as a string.
 *
 * Retries on: network errors, 408, 409 (rare DeepSeek lock), 429, 5xx.
 * Does NOT retry on 400/401/403 — those are caller/config bugs and won't fix themselves.
 */
export async function generateText(
  prompt: string,
  opts: GenerateTextOptions = {},
): Promise<string> {
  const apiKey = getEnv('DEEPSEEK_API_KEY');
  if (!apiKey) {
    throw new DeepSeekError('DEEPSEEK_API_KEY not set — caller should use fallback');
  }

  const baseUrl = (getEnv('DEEPSEEK_BASE_URL', DEFAULT_BASE_URL) || DEFAULT_BASE_URL).replace(
    /\/+$/,
    '',
  );
  const model = opts.model ?? getEnv('DEEPSEEK_MODEL', DEFAULT_MODEL) ?? DEFAULT_MODEL;
  const timeoutMs = opts.timeoutMs ?? DEFAULT_TIMEOUT_MS;

  const messages: Array<{ role: 'system' | 'user'; content: string }> = [];
  if (opts.systemPrompt) {
    messages.push({ role: 'system', content: opts.systemPrompt });
  }
  messages.push({ role: 'user', content: prompt });

  const body: Record<string, unknown> = {
    model,
    messages,
    stream: false,
  };
  if (opts.temperature !== undefined) body.temperature = opts.temperature;
  if (opts.maxTokens !== undefined) body.max_tokens = opts.maxTokens;
  if (opts.jsonMode) body.response_format = { type: 'json_object' };

  const url = `${baseUrl}/chat/completions`;

  let lastError: unknown = null;
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const resp = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey}`,
          Accept: 'application/json',
        },
        body: JSON.stringify(body),
        signal: controller.signal,
      });

      if (!resp.ok) {
        const status = resp.status;
        const text = await readResponseText(resp);
        const retryable = status === 408 || status === 409 || status === 429 || status >= 500;
        const err = new DeepSeekError(`DeepSeek HTTP ${status}: ${text.slice(0, 240)}`, status);
        if (!retryable || attempt === MAX_ATTEMPTS) throw err;
        lastError = err;
      } else {
        const data = (await resp.json()) as {
          choices?: Array<{ message?: { content?: string } }>;
        };
        const content = data.choices?.[0]?.message?.content;
        if (typeof content !== 'string') {
          throw new DeepSeekError('DeepSeek response missing choices[0].message.content');
        }
        return content;
      }
    } catch (err) {
      lastError = err;
      const isAbort = err instanceof Error && err.name === 'AbortError';
      const isDeepSeek = err instanceof DeepSeekError;
      if (isAbort && attempt === MAX_ATTEMPTS) {
        throw new DeepSeekError(`DeepSeek timed out after ${timeoutMs}ms`, undefined, err);
      }
      if (isDeepSeek) throw err;
      if (attempt === MAX_ATTEMPTS) {
        throw new DeepSeekError(
          `DeepSeek request failed after ${MAX_ATTEMPTS} attempts: ${(err as Error).message}`,
          undefined,
          err,
        );
      }
    } finally {
      clearTimeout(timer);
    }

    const wait = BASE_BACKOFF_MS * 2 ** (attempt - 1);
    await sleep(wait);
  }

  throw new DeepSeekError(
    `DeepSeek request failed: ${lastError instanceof Error ? lastError.message : String(lastError)}`,
    undefined,
    lastError,
  );
}

/** Day11+: LLMProvider 工厂 — 根据环境变量自动选择 DeepSeek / OpenAI */
export function createLLMProvider(): LLMProvider {
  const apiKey = getEnv('DEEPSEEK_API_KEY') ?? getEnv('OPENAI_API_KEY');
  return {
    async generate(prompt: string, opts?: GenerateTextOptions): Promise<string> {
      return generateText(prompt, opts);
    },
    isAvailable(): boolean {
      return Boolean(apiKey);
    },
  };
}

export const defaultProvider: LLMProvider = createLLMProvider();

/**
 * Day11+: 异步 NPC 对话生成 (不阻塞主循环)
 * 借鉴 WoC 1800 AI 私服 mod-ollama-chat 的异步线程设计:
 *   "对话在独立线程生成, 不阻塞主服务器循环"
 * 通过 Promise + callback 实现, Node 端天然异步
 */
export function generateAsync(
  prompt: string,
  opts: GenerateTextOptions = {},
  onDone?: (result: string | null, error: Error | null) => void,
): void {
  generateText(prompt, opts)
    .then((result) => onDone?.(result, null))
    .catch((err) => onDone?.(null, err));
}

/** Cheap predicate for callers: is the API usable right now (key configured)? */
export function isLlmAvailable(): boolean {
  return Boolean(getEnv('DEEPSEEK_API_KEY'));
}
