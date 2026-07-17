/**
 * src/core/sim/__tests__/progression.test.ts
 *
 * Day8: 经验 + 升级测试
 */
import { describe, it, expect } from 'vitest';
import { xpToNextLevel, gainXp, killRewardXp, getXp, DEFAULT_PROGRESSION } from '../progression';
import { emptyState, addEntity } from '../tick';
import type { SimEntity, EntityId } from '../types';

function makePlayer(
  level: number = 1,
  atk: number = 30,
  def: number = 5,
  hp: number = 100,
): SimEntity {
  return {
    id: 'e_p1' as EntityId,
    kind: 'player',
    pos: { x: 5, y: 5 },
    hp,
    maxHp: hp,
    atk,
    def,
    level,
    faction: 'player',
    inventory: [],
    equipment: {},
    buffs: [],
  };
}

describe('xpToNextLevel (公式)', () => {
  it('level 1 → 100 xp (base)', () => {
    expect(xpToNextLevel(1)).toBe(100);
  });

  it('level 5 → ~1118 xp (base * 5^1.5)', () => {
    expect(xpToNextLevel(5)).toBe(Math.floor(100 * Math.pow(5, 1.5)));
  });

  it('等级越高需求越多 (单调递增)', () => {
    const a = xpToNextLevel(1);
    const b = xpToNextLevel(2);
    const c = xpToNextLevel(3);
    expect(b).toBeGreaterThan(a);
    expect(c).toBeGreaterThan(b);
  });
});

describe('killRewardXp', () => {
  it('lv 1 怪 → 20 xp', () => {
    expect(killRewardXp(1)).toBe(20);
  });
  it('lv 5 怪 → 60 xp', () => {
    expect(killRewardXp(5)).toBe(60);
  });
  it('lv 10 怪 → 110 xp', () => {
    expect(killRewardXp(10)).toBe(110);
  });
});

describe('gainXp (经验累积 + 升级)', () => {
  it('首次给 xp → entity 收到 (buff 里)', () => {
    const s = addEntity(emptyState(42), makePlayer());
    const r = gainXp(s, 'e_p1' as EntityId, 50);
    expect(r.totalXpGained).toBe(50);
    expect(r.newState.entities['e_p1' as EntityId]!.buffs.length).toBe(1);
  });

  it('xp 不到阈值 → 不升级', () => {
    const s = addEntity(emptyState(42), makePlayer(1));
    const r = gainXp(s, 'e_p1' as EntityId, 50); // 50 < 100
    expect(r.leveledUp).toBe(false);
    expect(r.newLevel).toBe(1);
  });

  it('xp 达阈值 → 升级 + 属性 + event', () => {
    const s = addEntity(emptyState(42), makePlayer(1, 30, 5, 100));
    const r = gainXp(s, 'e_p1' as EntityId, 100);
    expect(r.leveledUp).toBe(true);
    expect(r.newLevel).toBe(2);
    expect(r.events.length).toBe(1);
    expect(r.events[0]!.type).toBe('level_up');
    expect((r.events[0]!.data as any).newLevel).toBe(2);
    // 属性 +DEFAULT
    expect(r.newState.entities['e_p1' as EntityId]!.hp).toBe(120); // 100 + 20
    expect(r.newState.entities['e_p1' as EntityId]!.atk).toBe(35); // 30 + 5
    expect(r.newState.entities['e_p1' as EntityId]!.def).toBe(7); // 5 + 2
  });

  it('大额 xp → 可能升多级', () => {
    const s = addEntity(emptyState(42), makePlayer(1));
    // lv1→2 需 100, lv2→3 需 ~282
    // 400 xp 至少升 1 级, 多余 118 留为下次升级的 xp
    const r = gainXp(s, 'e_p1' as EntityId, 400);
    expect(r.newLevel).toBeGreaterThanOrEqual(2);
    expect(r.events.length).toBeGreaterThanOrEqual(1);
  });

  it('不存在的 entity → no-op', () => {
    const s = emptyState(42);
    const r = gainXp(s, 'e_unknown' as EntityId, 100);
    expect(r.totalXpGained).toBe(0);
    expect(r.leveledUp).toBe(false);
  });

  it('getXp: 累积后能取回', () => {
    const s = addEntity(emptyState(42), makePlayer(1));
    const r = gainXp(s, 'e_p1' as EntityId, 60);
    expect(getXp(r.newState.entities['e_p1' as EntityId]!)).toBe(60);
  });
});
