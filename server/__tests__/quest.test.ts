/**
 * server/__tests__/quest.test.ts
 *
 * Day6.1: quest/NPC 系统单元测试
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { llmCache } from '../../src/core/llm/index.js';
import {
  generateRoomContent,
  findAdjacentNpc,
  talkToNpc,
  type NpcData,
  type RoomContent,
} from '../quest.js';
import { fallbackQuest, fallbackDialogue } from '../../src/core/llm/index.js';
import type { EntityId } from '../src/core/sim/types.js';

describe('generateRoomContent', () => {
  beforeEach(() => {
    llmCache.clear();
  });

  it('returns quest + npcs (no DEEPSEEK_API_KEY → fallback)', async () => {
    const spawns = [
      { x: 5, y: 5 },
      { x: 10, y: 5 },
      { x: 15, y: 5 },
      { x: 20, y: 5 },
      { x: 25, y: 5 },
    ];
    const monsterSpawns = [{ x: 10, y: 10 }];

    const content = await generateRoomContent(1, spawns, monsterSpawns);

    expect(content.quest).not.toBeNull();
    expect(content.quest!.title).toBeTruthy(); // v1.3: quest-pool 返回模板 baseHint
    expect(content.npcs.length).toBe(2);
    expect(content.generatedAt).toBeGreaterThan(0);
  });

  it('places npcs at unique positions (not on player or monster spawns)', async () => {
    const spawns = [
      { x: 0, y: 0 },
      { x: 5, y: 5 },
      { x: 10, y: 10 },
      { x: 15, y: 15 },
      { x: 20, y: 20 },
    ];
    const monsterSpawns = [{ x: 5, y: 5 }]; // 与 spawn[1] 重叠

    const content = await generateRoomContent(1, spawns, monsterSpawns);

    const occupied = new Set<string>();
    // 玩家 spawn
    occupied.add('0,0');
    // 怪物 spawn
    occupied.add('5,5');
    for (const npc of content.npcs) {
      const key = `${npc.pos.x},${npc.pos.y}`;
      // NPC 不与玩家/怪物重叠
      expect(occupied.has(key)).toBe(false);
      occupied.add(key);
    }
  });

  it('NPC names are from the fixed pool', async () => {
    const content = await generateRoomContent(1, [{ x: 1, y: 1 }], []);
    const validNames = ['Lantern Bearer', 'Driftwood Taro', 'Wandering Sage', 'Moss-Covered Elder'];
    for (const npc of content.npcs) {
      expect(validNames).toContain(npc.name);
      expect(npc.personality).toBeTruthy();
      expect(npc.id).toMatch(/^npc_\d+$/);
    }
  });

  it('different levels → different biomes (quest content varies)', async () => {
    const spawns = [{ x: 1, y: 1 }];
    const c1 = await generateRoomContent(1, spawns, []);
    const c3 = await generateRoomContent(3, spawns, []);
    // fallback quest 不同
    expect(c1.quest!.title).not.toBe(c3.quest!.title);
  });

  it('handles empty spawns (fallback to {1,1})', async () => {
    const content = await generateRoomContent(1, [], []);
    expect(content.npcs.length).toBe(2);
    // NPC 应有合法位置 (fallback 逻辑生效)
    for (const npc of content.npcs) {
      expect(npc.pos.x).toBeGreaterThanOrEqual(0);
      expect(npc.pos.y).toBeGreaterThanOrEqual(0);
    }
  });
});

describe('findAdjacentNpc', () => {
  const npcs: NpcData[] = [
    { id: 'npc_1', name: 'A', personality: 'a', pos: { x: 5, y: 5 }, cachedDialogue: new Map() },
    { id: 'npc_2', name: 'B', personality: 'b', pos: { x: 10, y: 10 }, cachedDialogue: new Map() },
    { id: 'npc_3', name: 'C', personality: 'c', pos: { x: 6, y: 5 }, cachedDialogue: new Map() },
  ];

  it('returns NPC at exact same position', () => {
    const r = findAdjacentNpc(npcs, { x: 5, y: 5 });
    expect(r?.id).toBe('npc_1');
  });

  it('returns NPC 1 step away (≤1)', () => {
    const r = findAdjacentNpc(npcs, { x: 5, y: 6 });
    expect(r?.id).toBe('npc_1');
    const r2 = findAdjacentNpc(npcs, { x: 6, y: 5 });
    expect(r2?.id).toBe('npc_3');
  });

  it('returns null when player is 2+ steps away', () => {
    expect(findAdjacentNpc(npcs, { x: 3, y: 5 })).toBeNull();
    expect(findAdjacentNpc(npcs, { x: 0, y: 0 })).toBeNull();
  });

  it('returns closest NPC when multiple adjacent', () => {
    // npc_1 at (5,5) dist=1 from player at (6,5)
    // npc_3 at (6,5) dist=0 from player at (6,5)
    // 期望 npc_3 (closest)
    const r = findAdjacentNpc(npcs, { x: 6, y: 5 });
    expect(r?.id).toBe('npc_3');
  });

  it('returns null for empty npc list', () => {
    expect(findAdjacentNpc([], { x: 5, y: 5 })).toBeNull();
  });
});

describe('talkToNpc', () => {
  let npc: NpcData;

  beforeEach(() => {
    llmCache.clear();
    npc = {
      id: 'npc_test',
      name: 'Test NPC',
      personality: 'cranky',
      pos: { x: 5, y: 5 },
      cachedDialogue: new Map(),
    };
  });

  it('returns dialogue (fallback if no API key)', async () => {
    const result = await talkToNpc(npc, 'e_p1' as EntityId, 'first visit');
    expect(result.greeting).toBeTruthy();
    expect(result.hint).toBeTruthy();
    expect(result.farewell).toBeTruthy();
    expect(result.source).toBe('fallback');
  });

  it('caches dialogue per player', async () => {
    const player1 = 'e_p1' as EntityId;
    const player2 = 'e_p2' as EntityId;
    const r1 = await talkToNpc(npc, player1, 'ctx1');
    const r2 = await talkToNpc(npc, player1, 'ctx1');
    const r3 = await talkToNpc(npc, player2, 'ctx1');

    // 同 player 两次 → 第二次 cache
    expect(r1.source).toBe('fallback');
    expect(r2.source).toBe('cache');
    expect(r2.greeting).toBe(r1.greeting);
    // 不同 player → 独立生成
    expect(r3.source).toBe('fallback');
  });

  it('uses fallback dialogue for known NPC', async () => {
    const result = await talkToNpc({ ...npc, name: 'Lantern Bearer' }, 'e_p1' as EntityId, 'ctx');
    // fallback 模式下,known NPC 应该有特定的 dialogue
    const fb = fallbackDialogue('Lantern Bearer');
    expect(result.greeting).toBe(fb.greeting);
  });
});
