/**
 * src/core/llm/__tests__/advisor.test.ts
 *
 * v1.1: AI Advisor 单元测试
 *
 * 覆盖:
 *   - fallbackAdvisor 在各种 player 状态下返合理建议
 *   - suggestNextAction 走 fallback (无 key)
 *   - suggestNextAction 走 cache (相同 ctx 第二次)
 *   - suggestNextAction 走 LLM (mock fetch, 成功)
 *   - suggestNextAction LLM 失败 fallback
 *   - buildAdvisorContext 序列化
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { suggestNextAction, buildAdvisorContext, fallbackAdvisor } from '../advisor';
import { llmCache } from '../cache';
import { fallbackQuest } from '../fallback';
import { tick, emptyState, addEntity, worldGen } from '../../sim';
import type { GameState, SimEntity, EntityId } from '../../sim/types';

function makeState(seed = 42): GameState {
  const layout = worldGen(seed, 1);
  let s = emptyState(seed);
  const player: SimEntity = {
    id: 'e_player_1' as EntityId,
    kind: 'player',
    pos: { x: 5, y: 5 },
    hp: 100,
    maxHp: 100,
    atk: 30,
    def: 5,
    level: 5,
    faction: 'player',
    inventory: [],
    equipment: {},
    buffs: [],
  };
  const monster: SimEntity = {
    id: 'e_monster_1' as EntityId,
    kind: 'monster',
    pos: { x: 6, y: 5 }, // 邻接
    hp: 30,
    maxHp: 30,
    atk: 5,
    def: 1,
    level: 1,
    faction: 'enemy',
    inventory: [],
    equipment: {},
    buffs: [],
  };
  const item: SimEntity = {
    id: 'e_item_1' as EntityId,
    kind: 'item',
    pos: { x: 10, y: 10 },
    hp: 0,
    maxHp: 0,
    atk: 5,
    def: 0,
    level: 0,
    faction: 'neutral',
    inventory: [],
    equipment: {},
    buffs: [],
  };
  s = addEntity(s, player);
  s = addEntity(s, monster);
  s = addEntity(s, item);
  return s;
}

describe('fallbackAdvisor (启发式规则)', () => {
  it('邻接 monster → attack', () => {
    const s = makeState();
    const player = s.entities['e_player_1' as EntityId]!;
    const r = fallbackAdvisor(player, s);
    expect(r.source).toBe('fallback');
    expect(r.goal).toBe('attack');
    expect(r.nextAction.type).toBe('attack');
    expect((r.nextAction.payload as any).targetId).toBe('e_monster_1');
  });

  it('HP < 30% + 邻接 monster → retreat (远离)', () => {
    const s = makeState();
    const player = s.entities['e_player_1' as EntityId]!;
    player.hp = 20; // 20%
    const r = fallbackAdvisor(player, s);
    expect(r.goal).toBe('retreat');
    expect(r.nextAction.type).toBe('move');
    // player (5,5) → monster (6,5) → dx=-1 远离
    expect((r.nextAction.payload as any).dx).toBe(-1);
  });

  it('无 monster 但有 item → explore (朝 item 走)', () => {
    const s = makeState();
    delete s.entities['e_monster_1' as EntityId];
    const player = s.entities['e_player_1' as EntityId]!;
    const r = fallbackAdvisor(player, s);
    expect(r.goal).toBe('explore');
    expect(r.nextAction.type).toBe('move');
  });

  it('完全空 → idle', () => {
    const s = emptyState(42);
    const player: SimEntity = {
      id: 'e_player_1' as EntityId,
      kind: 'player',
      pos: { x: 5, y: 5 },
      hp: 100,
      maxHp: 100,
      atk: 30,
      def: 5,
      level: 5,
      faction: 'player',
      inventory: [],
      equipment: {},
      buffs: [],
    };
    s.entities[player.id] = player;
    const r = fallbackAdvisor(player, s);
    expect(r.goal).toBe('idle');
  });
});

describe('suggestNextAction', () => {
  beforeEach(() => {
    llmCache.clear();
  });

  it('无 API key → fallback', async () => {
    const origKey = process.env.DEEPSEEK_API_KEY;
    delete process.env.DEEPSEEK_API_KEY;
    try {
      const s = makeState();
      const player = s.entities['e_player_1' as EntityId]!;
      const r = await suggestNextAction(player, s);
      expect(r.source).toBe('fallback');
      expect(r.goal).toBe('attack');
    } finally {
      if (origKey) process.env.DEEPSEEK_API_KEY = origKey;
    }
  });

  it('有 key + mock LLM → 走 LLM 路径', async () => {
    const mockFetch = vi.fn();
    vi.stubGlobal('fetch', mockFetch);
    mockFetch.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        choices: [
          {
            message: {
              content: JSON.stringify({
                goal: 'attack',
                reason: '测试',
                nextAction: { type: 'attack', targetId: 'e_monster_1' },
              }),
            },
          },
        ],
      }),
      text: async () => '',
    } as unknown as Response);

    try {
      const s = makeState();
      const player = s.entities['e_player_1' as EntityId]!;
      const r = await suggestNextAction(player, s, 'sk-test-12345');
      expect(r.source).toBe('llm');
      expect(r.goal).toBe('attack');
      expect(mockFetch).toHaveBeenCalledTimes(1);
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('LLM 500 → fallback', async () => {
    const mockFetch = vi.fn();
    vi.stubGlobal('fetch', mockFetch);
    mockFetch.mockResolvedValue({
      ok: false,
      status: 500,
      json: async () => ({ error: 'server error' }),
      text: async () => 'server error',
    } as unknown as Response);

    try {
      const s = makeState();
      const player = s.entities['e_player_1' as EntityId]!;
      const r = await suggestNextAction(player, s, 'sk-test-12345');
      expect(r.source).toBe('fallback');
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('相同 ctx 第二次返 cache (只发一次 fetch)', async () => {
    const mockFetch = vi.fn();
    vi.stubGlobal('fetch', mockFetch);
    mockFetch.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        choices: [
          {
            message: {
              content: JSON.stringify({
                goal: 'attack',
                reason: 'test',
                nextAction: { type: 'attack', targetId: 'e_monster_1' },
              }),
            },
          },
        ],
      }),
      text: async () => '',
    } as unknown as Response);

    try {
      const s = makeState();
      const player = s.entities['e_player_1' as EntityId]!;
      const r1 = await suggestNextAction(player, s, 'sk-test');
      const r2 = await suggestNextAction(player, s, 'sk-test');
      expect(r1.source).toBe('llm');
      expect(r2.source).toBe('cache');
      expect(mockFetch).toHaveBeenCalledTimes(1);
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('move dx/dy 越界被 clamp 到 [-1, 1]', async () => {
    const mockFetch = vi.fn();
    vi.stubGlobal('fetch', mockFetch);
    mockFetch.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        choices: [
          {
            message: {
              content: JSON.stringify({
                goal: 'attack',
                reason: 'test',
                nextAction: { type: 'move', dx: 99, dy: -99 },
              }),
            },
          },
        ],
      }),
      text: async () => '',
    } as unknown as Response);

    try {
      const s = makeState();
      const player = s.entities['e_player_1' as EntityId]!;
      const r = await suggestNextAction(player, s, 'sk-test');
      expect((r.nextAction.payload as any).dx).toBe(1);
      expect((r.nextAction.payload as any).dy).toBe(-1);
    } finally {
      vi.unstubAllGlobals();
    }
  });
});

describe('buildAdvisorContext', () => {
  it('包含 player + 附近 5x5 entities (player 自己也在内)', () => {
    const s = makeState();
    const player = s.entities['e_player_1' as EntityId]!;
    const ctx = buildAdvisorContext(player, s);
    const parsed = JSON.parse(ctx);
    expect(parsed.player.id).toBe('e_player_1');
    expect(parsed.player.hp).toBe(100);
    expect(parsed.nearby.length).toBeGreaterThan(0);
    // 至少有 monster
    const monster = parsed.nearby.find((n: any) => n.id === 'e_monster_1');
    expect(monster).toBeDefined();
    expect(monster.kind).toBe('monster');
  });
});
