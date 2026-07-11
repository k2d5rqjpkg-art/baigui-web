/**
 * src/core/llm/__tests__/llm.test.ts
 *
 * Day6: LLM 层单元测试 (cache + client + fallback + index)
 * 把 src/core/llm 覆盖从 0% 提到 70%+
 *
 * 测试策略:
 *   - cache: 用真 LRU 测 LRU 行为 (不 mock), 单测纯逻辑
 *   - client: 用 vi.stubGlobal('fetch', mockFetch) 测各种 HTTP 响应
 *   - fallback: 直接调静态函数, 验证确定性 + 边界
 *   - index: 用 stub mock generateText, 验证 cache/fallback/llm 三条路径
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

import {
  LRU,
  llmCache,
  hashKey,
  generateText,
  isLlmAvailable,
  DeepSeekError,
  generateQuest,
  generateDialogue,
  fallbackQuest,
  fallbackDialogue,
} from '../index';

describe('hashKey (FNV-1a 32-bit)', () => {
  it('produces 8-char hex', () => {
    const h = hashKey('hello');
    expect(h).toMatch(/^[0-9a-f]{8}$/);
  });

  it('deterministic — same input → same output', () => {
    expect(hashKey('test-string')).toBe(hashKey('test-string'));
  });

  it('different inputs → different outputs (with high probability)', () => {
    expect(hashKey('a')).not.toBe(hashKey('b'));
    expect(hashKey('hello')).not.toBe(hashKey('world'));
  });

  it('empty string has a well-defined hash', () => {
    // FNV-1a offset basis: 0x811c9dc5
    expect(hashKey('')).toBe('811c9dc5');
  });

  it('unicode characters do not throw', () => {
    expect(() => hashKey('百鬼夜行')).not.toThrow();
    expect(() => hashKey('🎮')).not.toThrow();
  });
});

describe('LRU cache', () => {
  it('basic get/set/has', () => {
    const cache = new LRU<string>(3);
    expect(cache.size()).toBe(0);
    cache.set('a', '1');
    cache.set('b', '2');
    expect(cache.size()).toBe(2);
    expect(cache.get('a')).toBe('1');
    expect(cache.has('b')).toBe(true);
    expect(cache.has('c')).toBe(false);
  });

  it('evicts oldest entry when capacity exceeded', () => {
    const cache = new LRU<string>(2);
    cache.set('a', '1');
    cache.set('b', '2');
    cache.set('c', '3'); // a should be evicted
    expect(cache.has('a')).toBe(false);
    expect(cache.has('b')).toBe(true);
    expect(cache.has('c')).toBe(true);
    expect(cache.size()).toBe(2);
  });

  it('updating existing key does not evict (overwrite)', () => {
    const cache = new LRU<string>(2);
    cache.set('a', '1');
    cache.set('b', '2');
    cache.set('a', '1-updated');
    expect(cache.size()).toBe(2);
    expect(cache.get('a')).toBe('1-updated');
  });

  it('get refreshes recency — accessed entry moves to back', () => {
    const cache = new LRU<string>(2);
    cache.set('a', '1');
    cache.set('b', '2');
    // Access 'a' to refresh it
    expect(cache.get('a')).toBe('1');
    // Now insert 'c' — 'b' (oldest unaccessed) should be evicted, NOT 'a'
    cache.set('c', '3');
    expect(cache.has('a')).toBe(true);
    expect(cache.has('b')).toBe(false);
    expect(cache.has('c')).toBe(true);
  });

  it('clear empties the cache', () => {
    const cache = new LRU<string>(3);
    cache.set('a', '1');
    cache.set('b', '2');
    cache.clear();
    expect(cache.size()).toBe(0);
    expect(cache.has('a')).toBe(false);
  });

  it('throws on maxEntries <= 0', () => {
    expect(() => new LRU<string>(0)).toThrow();
    expect(() => new LRU<string>(-1)).toThrow();
  });

  it('handles different value types', () => {
    const numCache = new LRU<number>(3);
    numCache.set('x', 42);
    expect(numCache.get('x')).toBe(42);

    const objCache = new LRU<{ name: string }>(3);
    objCache.set('k', { name: 'foo' });
    expect(objCache.get('k')?.name).toBe('foo');
  });

  it('module-level llmCache singleton has max 100', () => {
    expect(llmCache.size()).toBeGreaterThanOrEqual(0);
    // Can't easily verify 100 max without polluting singleton, but we can
    // verify it works.
    llmCache.clear();
    expect(llmCache.size()).toBe(0);
  });
});

describe('fallbackQuest', () => {
  it('returns quest for level in 1-5', () => {
    for (let lv = 1; lv <= 5; lv++) {
      const q = fallbackQuest(lv);
      expect(q.title).toBeTruthy();
      expect(q.description).toBeTruthy();
      expect(q.objective).toBeTruthy();
      expect(q.reward).toBeTruthy();
    }
  });

  it('clamps levels < 1 to level 1', () => {
    expect(fallbackQuest(0).title).toBe(fallbackQuest(1).title);
    expect(fallbackQuest(-5).title).toBe(fallbackQuest(1).title);
  });

  it('clamps levels > 5 to level 5', () => {
    expect(fallbackQuest(10).title).toBe(fallbackQuest(5).title);
    expect(fallbackQuest(999).title).toBe(fallbackQuest(5).title);
  });

  it('handles non-integer levels (floor + clamp)', () => {
    expect(fallbackQuest(1.7).title).toBe(fallbackQuest(1).title);
    expect(fallbackQuest(2.9).title).toBe(fallbackQuest(2).title);
  });

  it('different levels return different quests (not all the same)', () => {
    const titles = new Set<string>();
    for (let lv = 1; lv <= 5; lv++) {
      titles.add(fallbackQuest(lv).title);
    }
    expect(titles.size).toBe(5);
  });

  it('deterministic — same level → same quest', () => {
    expect(fallbackQuest(3).title).toBe(fallbackQuest(3).title);
  });
});

describe('fallbackDialogue', () => {
  it('returns dialogue for known NPC', () => {
    const d = fallbackDialogue('Lantern Bearer');
    expect(d.greeting).toBeTruthy();
    expect(d.hint).toBeTruthy();
    expect(d.farewell).toBeTruthy();
  });

  it('returns generic dialogue for unknown NPC', () => {
    const d = fallbackDialogue('Some Random NPC');
    expect(d.greeting).toBeTruthy();
    expect(d.hint).toBeTruthy();
    expect(d.farewell).toBeTruthy();
  });

  it('different NPCs return different dialogues', () => {
    const d1 = fallbackDialogue('Lantern Bearer');
    const d2 = fallbackDialogue('Driftwood Taro');
    expect(d1.greeting).not.toBe(d2.greeting);
  });

  it('unknown NPC uses generic wanderer voice (not crash)', () => {
    expect(() => fallbackDialogue('')).not.toThrow();
    expect(() => fallbackDialogue('🤖')).not.toThrow();
  });
});

describe('isLlmAvailable', () => {
  const originalEnv = process.env.DEEPSEEK_API_KEY;

  afterEach(() => {
    // Restore env
    if (originalEnv === undefined) {
      delete process.env.DEEPSEEK_API_KEY;
    } else {
      process.env.DEEPSEEK_API_KEY = originalEnv;
    }
  });

  it('returns false when DEEPSEEK_API_KEY not set', () => {
    delete process.env.DEEPSEEK_API_KEY;
    expect(isLlmAvailable()).toBe(false);
  });

  it('returns true when DEEPSEEK_API_KEY is set', () => {
    process.env.DEEPSEEK_API_KEY = 'sk-test';
    expect(isLlmAvailable()).toBe(true);
  });
});

describe('generateText (HTTP client)', () => {
  let mockFetch: ReturnType<typeof vi.fn>;
  const originalEnv = { ...process.env };

  beforeEach(() => {
    mockFetch = vi.fn();
    vi.stubGlobal('fetch', mockFetch);
    // Need a key to even attempt HTTP
    process.env.DEEPSEEK_API_KEY = 'sk-test-123';
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    process.env = { ...originalEnv };
  });

  function mockSuccessResponse(content: string) {
    return {
      ok: true,
      status: 200,
      json: async () => ({ choices: [{ message: { content } }] }),
      text: async () => JSON.stringify({ choices: [{ message: { content } }] }),
    } as unknown as Response;
  }

  function mockErrorResponse(status: number, body = 'error') {
    return {
      ok: false,
      status,
      json: async () => ({ error: body }),
      text: async () => body,
    } as unknown as Response;
  }

  it('throws DeepSeekError when no API key', async () => {
    delete process.env.DEEPSEEK_API_KEY;
    await expect(generateText('hello')).rejects.toBeInstanceOf(DeepSeekError);
  });

  it('returns content on 200 OK', async () => {
    mockFetch.mockResolvedValueOnce(mockSuccessResponse('hello world'));
    const result = await generateText('hi');
    expect(result).toBe('hello world');
  });

  it('sends POST to /chat/completions with Bearer auth', async () => {
    mockFetch.mockResolvedValueOnce(mockSuccessResponse('ok'));
    await generateText('test');
    expect(mockFetch).toHaveBeenCalledOnce();
    const [url, init] = mockFetch.mock.calls[0];
    expect(url).toContain('/chat/completions');
    expect(init.method).toBe('POST');
    expect(init.headers.Authorization).toBe('Bearer sk-test-123');
  });

  it('includes systemPrompt as system message when provided', async () => {
    mockFetch.mockResolvedValueOnce(mockSuccessResponse('ok'));
    await generateText('user-prompt', { systemPrompt: 'be helpful' });
    const body = JSON.parse(mockFetch.mock.calls[0][1].body);
    expect(body.messages).toEqual([
      { role: 'system', content: 'be helpful' },
      { role: 'user', content: 'user-prompt' },
    ]);
  });

  it('sets jsonMode → response_format in body', async () => {
    mockFetch.mockResolvedValueOnce(mockSuccessResponse('{}'));
    await generateText('p', { jsonMode: true });
    const body = JSON.parse(mockFetch.mock.calls[0][1].body);
    expect(body.response_format).toEqual({ type: 'json_object' });
  });

  it('omits temperature/maxTokens when not specified', async () => {
    mockFetch.mockResolvedValueOnce(mockSuccessResponse('ok'));
    await generateText('p');
    const body = JSON.parse(mockFetch.mock.calls[0][1].body);
    expect(body.temperature).toBeUndefined();
    expect(body.max_tokens).toBeUndefined();
    expect(body.response_format).toBeUndefined();
  });

  it('throws on 401 (non-retryable)', async () => {
    mockFetch.mockResolvedValueOnce(mockErrorResponse(401, 'unauthorized'));
    await expect(generateText('p')).rejects.toMatchObject({
      name: 'DeepSeekError',
      status: 401,
    });
  });

  it('throws on 400 (non-retryable client error)', async () => {
    mockFetch.mockResolvedValueOnce(mockErrorResponse(400, 'bad request'));
    await expect(generateText('p')).rejects.toMatchObject({ status: 400 });
  });

  it('retries on 429 and eventually succeeds', async () => {
    // 2 retries fail, 3rd succeeds
    mockFetch
      .mockResolvedValueOnce(mockErrorResponse(429, 'rate limited'))
      .mockResolvedValueOnce(mockErrorResponse(429, 'rate limited'))
      .mockResolvedValueOnce(mockSuccessResponse('finally'));
    const result = await generateText('p');
    expect(result).toBe('finally');
    expect(mockFetch).toHaveBeenCalledTimes(3);
  });

  it('retries on 500 and eventually gives up after MAX_ATTEMPTS', async () => {
    // Always 500
    for (let i = 0; i < 3; i++) {
      mockFetch.mockResolvedValueOnce(mockErrorResponse(500, 'server error'));
    }
    await expect(generateText('p')).rejects.toMatchObject({ status: 500 });
    expect(mockFetch).toHaveBeenCalledTimes(3);
  });

  it('throws on missing choices[0].message.content', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({ choices: [] }),
      text: async () => '{}',
    } as unknown as Response);
    await expect(generateText('p')).rejects.toBeInstanceOf(DeepSeekError);
  });
});

describe('generateQuest (resilient wrapper)', () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    // Clear cache between tests
    llmCache.clear();
    vi.unstubAllGlobals();
  });

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it('uses fallback when DEEPSEEK_API_KEY not set (no throw)', async () => {
    delete process.env.DEEPSEEK_API_KEY;
    const { quest, meta } = await generateQuest(3, 'forest');
    expect(meta.source).toBe('fallback');
    expect(quest.title).toBe(fallbackQuest(3).title);
  });

  it('uses fallback when LLM throws (no throw)', async () => {
    process.env.DEEPSEEK_API_KEY = 'sk-test';
    const mockFetch = vi.fn().mockRejectedValue(new Error('network down'));
    vi.stubGlobal('fetch', mockFetch);
    const { quest, meta } = await generateQuest(2, 'swamp');
    expect(meta.source).toBe('fallback');
    expect(meta.reason).toContain('network down');
    expect(quest.title).toBe(fallbackQuest(2).title);
  });

  it('uses LLM when API returns valid JSON', async () => {
    process.env.DEEPSEEK_API_KEY = 'sk-test';
    const llmJson = JSON.stringify({
      title: 'LLM Quest Title',
      description: 'an LLM-crafted quest',
      objective: 'test the LLM path',
      reward: '1 candy',
    });
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ choices: [{ message: { content: llmJson } }] }),
      text: async () => llmJson,
    } as unknown as Response);
    vi.stubGlobal('fetch', mockFetch);
    const { quest, meta } = await generateQuest(1, 'forest');
    expect(meta.source).toBe('llm');
    expect(quest.title).toBe('LLM Quest Title');
  });

  it('falls back when LLM returns invalid JSON', async () => {
    process.env.DEEPSEEK_API_KEY = 'sk-test';
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ choices: [{ message: { content: 'not json {' } }] }),
      text: async () => 'not json {',
    } as unknown as Response);
    vi.stubGlobal('fetch', mockFetch);
    const { quest, meta } = await generateQuest(1, 'forest');
    expect(meta.source).toBe('fallback');
    expect(quest.title).toBe(fallbackQuest(1).title);
  });

  it('strips markdown fences from LLM JSON', async () => {
    process.env.DEEPSEEK_API_KEY = 'sk-test';
    const fenced = '```json\n{"title":"Fenced","description":"d","objective":"o","reward":"r"}\n```';
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ choices: [{ message: { content: fenced } }] }),
      text: async () => fenced,
    } as unknown as Response);
    vi.stubGlobal('fetch', mockFetch);
    const { quest, meta } = await generateQuest(1, 'forest');
    expect(meta.source).toBe('llm');
    expect(quest.title).toBe('Fenced');
  });

  it('caches LLM response on second identical call', async () => {
    process.env.DEEPSEEK_API_KEY = 'sk-test';
    const llmJson = JSON.stringify({
      title: 'Cached Quest',
      description: 'd',
      objective: 'o',
      reward: 'r',
    });
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ choices: [{ message: { content: llmJson } }] }),
      text: async () => llmJson,
    } as unknown as Response);
    vi.stubGlobal('fetch', mockFetch);
    const r1 = await generateQuest(4, 'mountain');
    const r2 = await generateQuest(4, 'mountain');
    expect(r1.meta.source).toBe('llm');
    expect(r2.meta.source).toBe('cache');
    expect(r2.quest.title).toBe('Cached Quest');
    // fetch should only be called once (second call hits cache)
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  it('different (level, biome) hits LLM separately (no cross-cache)', async () => {
    process.env.DEEPSEEK_API_KEY = 'sk-test';
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        choices: [{
          message: {
            content: JSON.stringify({ title: 'X', description: 'd', objective: 'o', reward: 'r' }),
          },
        }],
      }),
      text: async () => '',
    } as unknown as Response);
    vi.stubGlobal('fetch', mockFetch);
    await generateQuest(1, 'forest');
    await generateQuest(2, 'forest');
    await generateQuest(1, 'swamp');
    expect(mockFetch).toHaveBeenCalledTimes(3);
  });
});

describe('generateDialogue (resilient wrapper)', () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    llmCache.clear();
    vi.unstubAllGlobals();
  });

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it('uses fallback when no API key', async () => {
    delete process.env.DEEPSEEK_API_KEY;
    const { dialogue, meta } = await generateDialogue('Lantern Bearer', 'cranky', 'first visit');
    expect(meta.source).toBe('fallback');
    expect(dialogue.greeting).toBeTruthy();
  });

  it('uses LLM when valid response', async () => {
    process.env.DEEPSEEK_API_KEY = 'sk-test';
    const llmJson = JSON.stringify({
      greeting: 'Hey there, traveler.',
      hint: 'Look behind the third stone.',
      farewell: 'Until we meet again.',
    });
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ choices: [{ message: { content: llmJson } }] }),
      text: async () => llmJson,
    } as unknown as Response);
    vi.stubGlobal('fetch', mockFetch);
    const { dialogue, meta } = await generateDialogue('Wandering Sage', 'wise', 'quest active');
    expect(meta.source).toBe('llm');
    expect(dialogue.greeting).toBe('Hey there, traveler.');
  });

  it('falls back on LLM failure', async () => {
    process.env.DEEPSEEK_API_KEY = 'sk-test';
    const mockFetch = vi.fn().mockRejectedValue(new Error('boom'));
    vi.stubGlobal('fetch', mockFetch);
    const { dialogue, meta } = await generateDialogue('Lantern Bearer', 'cranky', 'ctx');
    expect(meta.source).toBe('fallback');
    expect(dialogue.greeting).toBe(fallbackDialogue('Lantern Bearer').greeting);
  });

  it('unknown NPC name uses generic wanderer fallback', async () => {
    delete process.env.DEEPSEEK_API_KEY;
    const { dialogue, meta } = await generateDialogue('UnheardOf Person', 'mysterious', 'ctx');
    expect(meta.source).toBe('fallback');
    expect(dialogue.greeting).toBe(fallbackDialogue('UnheardOf Person').greeting);
  });
});

describe('DeepSeekError', () => {
  it('has correct name and message', () => {
    const err = new DeepSeekError('test message', 500);
    expect(err).toBeInstanceOf(Error);
    expect(err).toBeInstanceOf(DeepSeekError);
    expect(err.name).toBe('DeepSeekError');
    expect(err.message).toBe('test message');
    expect(err.status).toBe(500);
  });

  it('preserves cause if provided', () => {
    const cause = new Error('underlying');
    const err = new DeepSeekError('wrap', undefined, cause);
    expect(err.cause).toBe(cause);
  });

  it('status is optional', () => {
    const err = new DeepSeekError('no status');
    expect(err.status).toBeUndefined();
  });
});