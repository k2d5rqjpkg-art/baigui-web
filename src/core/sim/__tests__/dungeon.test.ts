/**
 * src/core/sim/__tests__/dungeon.test.ts
 *
 * v1.2: 副本机制单元测试
 */
import { describe, it, expect } from 'vitest';
import { emptyState, addEntity, ITEM_TABLE } from '../index';
import { enterDungeon, distributeLoot } from '../dungeon';
import type { SimEntity, EntityId, ItemTemplate } from '../types';

function makeConfig(
  overrides: Partial<{
    id: string;
    bossId: EntityId;
    bossLevel: number;
    lootTable: ItemTemplate[];
  }> = {},
): any {
  return {
    id: 'crypt-of-shadows',
    name: '暗影陵墓',
    recommendedPartySize: 5,
    bossId: 'e_dungeon_boss' as EntityId,
    bossLevel: 5,
    lootTable: ITEM_TABLE.slice(0, 3),
    ...overrides,
  };
}

describe('enterDungeon', () => {
  it('生成地图 + 怪物 + Boss', () => {
    const base = emptyState(42);
    const cfg = makeConfig();
    const r = enterDungeon(base, cfg);
    expect(r.layout.width).toBeGreaterThan(0);
    expect(r.layout.height).toBeGreaterThan(0);
    expect(r.monsters.length).toBeGreaterThan(0);
    expect(r.monsters.length).toBeLessThanOrEqual(5);
    expect(r.boss.id).toBe(cfg.bossId);
    // boss HP = first monster hp * 5
    if (r.monsters.length > 0) {
      expect(r.boss.hp).toBe(r.monsters[0].hp * 5);
    }
    // boss 在 state
    expect(r.state.entities[r.boss.id]).toBeDefined();
  });

  it('不同 dungeon id → 不同 seed → 不同布局', () => {
    const base = emptyState(42);
    const r1 = enterDungeon(base, makeConfig({ id: 'crypt-1' }));
    const r2 = enterDungeon(base, makeConfig({ id: 'crypt-2' }));
    // 至少 layout 不同
    const layout1 = JSON.stringify(r1.layout.spawnPoints);
    const layout2 = JSON.stringify(r2.layout.spawnPoints);
    expect(layout1).not.toBe(layout2);
  });
});

describe('distributeLoot (借鉴 WoC 战利品分配教训)', () => {
  it('legendary 给伤害最高者', () => {
    const loot: ItemTemplate[] = [
      {
        id: 'legendary-sword',
        name: 'Legendary Sword',
        slot: 'weapon',
        rarity: 'legendary',
        affixes: [{ key: 'atk', value: 100 }],
      },
    ];
    const participants = [
      { id: 'e_p1' as EntityId, damageDealt: 50 },
      { id: 'e_p2' as EntityId, damageDealt: 200 }, // 最高
      { id: 'e_p3' as EntityId, damageDealt: 30 },
    ];
    const r = distributeLoot(loot, participants, 42);
    expect(r.entries.length).toBe(1);
    expect(r.entries[0].recipientId).toBe('e_p2');
  });

  it('rare 随机分 (确定性 RNG)', () => {
    const loot: ItemTemplate[] = [
      {
        id: 'rare-ring',
        name: 'Rare Ring',
        slot: 'accessory',
        rarity: 'rare',
        affixes: [{ key: 'atk', value: 5 }],
      },
    ];
    const participants = [
      { id: 'e_p1' as EntityId, damageDealt: 10 },
      { id: 'e_p2' as EntityId, damageDealt: 20 },
    ];
    const r = distributeLoot(loot, participants, 42);
    expect(r.entries.length).toBe(1);
    // rng 42 → recipient 必须确定
    expect(['e_p1', 'e_p2']).toContain(r.entries[0].recipientId);
  });

  it('epic 给第一个参与者', () => {
    const loot: ItemTemplate[] = [
      {
        id: 'epic-shield',
        name: 'Epic Shield',
        slot: 'armor',
        rarity: 'epic',
        affixes: [{ key: 'def', value: 30 }],
      },
    ];
    const participants = [
      { id: 'e_p1' as EntityId, damageDealt: 100 },
      { id: 'e_p2' as EntityId, damageDealt: 50 },
    ];
    const r = distributeLoot(loot, participants, 42);
    expect(r.entries[0].recipientId).toBe('e_p1');
  });

  it('无参与者 → loot 进 unassigned (借鉴 WoC 的崩溃教训)', () => {
    const loot: ItemTemplate[] = [
      {
        id: 'common-sword',
        name: 'Common Sword',
        slot: 'weapon',
        rarity: 'common',
        affixes: [{ key: 'atk', value: 3 }],
      },
    ];
    const r = distributeLoot(loot, [], 42);
    expect(r.entries.length).toBe(0);
    expect(r.unassigned.length).toBe(1);
  });

  it('多种 rarity 排序: legendary > epic > rare > common', () => {
    const loot: ItemTemplate[] = [
      {
        id: 'common',
        name: 'Common',
        slot: 'weapon',
        rarity: 'common',
        affixes: [{ key: 'atk', value: 1 }],
      },
      {
        id: 'rare',
        name: 'Rare',
        slot: 'weapon',
        rarity: 'rare',
        affixes: [{ key: 'atk', value: 5 }],
      },
      {
        id: 'epic',
        name: 'Epic',
        slot: 'weapon',
        rarity: 'epic',
        affixes: [{ key: 'atk', value: 15 }],
      },
      {
        id: 'legendary',
        name: 'Leg',
        slot: 'weapon',
        rarity: 'legendary',
        affixes: [{ key: 'atk', value: 50 }],
      },
    ];
    const participants = [{ id: 'e_p1' as EntityId, damageDealt: 100 }];
    const r = distributeLoot(loot, participants, 42);
    expect(r.entries.map((e) => e.itemId)).toEqual(['legendary', 'epic', 'rare', 'common']);
  });

  it('version = 1 (兼容标记, 借鉴 WoC 没用 version 的教训)', () => {
    const r = distributeLoot([], [], 42);
    expect(r.version).toBe(1);
  });

  it('同 seed 同结果 (deterministic)', () => {
    const loot: ItemTemplate[] = [
      {
        id: 'rare-ring',
        name: 'Rare Ring',
        slot: 'accessory',
        rarity: 'rare',
        affixes: [{ key: 'atk', value: 5 }],
      },
    ];
    const participants = [
      { id: 'e_p1' as EntityId, damageDealt: 10 },
      { id: 'e_p2' as EntityId, damageDealt: 20 },
    ];
    const r1 = distributeLoot(loot, participants, 42);
    const r2 = distributeLoot(loot, participants, 42);
    expect(r1.entries[0].recipientId).toBe(r2.entries[0].recipientId);
  });
});
