/**
 * vitest: combat
 *  - 固定输入产生固定 damage
 *  - dodge 概率公式 (defender.level * 2%)
 *  - crit 10% 触发
 *  - 死亡事件正确发出
 *  - 同派系不互殴
 */

import { describe, it, expect } from 'vitest';
import { resolveCombat } from '../combat';
import { emptyState, addEntity } from '../tick';
import type { SimEntity, EntityId } from '../types';

function mkPlayer(id: EntityId, opts: Partial<SimEntity> = {}): SimEntity {
  return {
    id,
    kind: 'player',
    pos: { x: 0, y: 0 },
    hp: 100,
    maxHp: 100,
    atk: 20,
    def: 5,
    level: 5,
    faction: 'player',
    inventory: [],
    equipment: {},
    buffs: [],
    ...opts,
  };
}

function mkMonster(id: EntityId, opts: Partial<SimEntity> = {}): SimEntity {
  return {
    id,
    kind: 'monster',
    pos: { x: 1, y: 0 },
    hp: 50,
    maxHp: 50,
    atk: 8,
    def: 2,
    level: 3,
    faction: 'enemy',
    inventory: [],
    equipment: {},
    buffs: [],
    ...opts,
  };
}

describe('resolveCombat', () => {
  it('produces deterministic damage for fixed input', () => {
    const s0 = emptyState(0x12345678);
    const s1 = addEntity(s0, mkPlayer('e_p', { atk: 30, def: 0, level: 5, hp: 100, maxHp: 100 }));
    const s2 = addEntity(s1, mkMonster('e_m', { atk: 0, def: 5, level: 1, hp: 999, maxHp: 999 }));

    const r1 = resolveCombat(s2, 'e_p', 'e_m', 0xabcdef);
    const r2 = resolveCombat(s2, 'e_p', 'e_m', 0xabcdef);
    // events 数量相同
    expect(r1.events.length).toBe(r2.events.length);
    // damage 数值相同
    const dmg1 = r1.events.find((e) => e.type === 'damage');
    const dmg2 = r2.events.find((e) => e.type === 'damage');
    if (dmg1 && dmg2 && 'amount' in dmg1.data && 'amount' in dmg2.data) {
      expect(dmg1.data.amount).toBe(dmg2.data.amount);
    } else {
      throw new Error('expected damage events with amount data');
    }
  });

  it('damage is at least 1 (clamped)', () => {
    // 高防 vs 低攻 → 仍至少 1
    const s0 = emptyState(1);
    const s1 = addEntity(s0, mkPlayer('e_p', { atk: 1, def: 0, level: 1, hp: 100, maxHp: 100 }));
    const s2 = addEntity(s1, mkMonster('e_m', { atk: 0, def: 100, level: 1, hp: 999, maxHp: 999 }));

    // 试 100 个不同 seed,至少一个造成 damage 事件
    let sawDamage = false;
    for (let i = 0; i < 100; i++) {
      const r = resolveCombat(s2, 'e_p', 'e_m', i);
      const dmg = r.events.find((e) => e.type === 'damage');
      if (dmg && 'amount' in dmg.data && typeof dmg.data.amount === 'number') {
        expect(dmg.data.amount).toBeGreaterThanOrEqual(1);
        sawDamage = true;
      }
    }
    expect(sawDamage).toBe(true);
  });

  it('dodge happens for high-level defender (lv 50 → 100% dodge)', () => {
    const s0 = emptyState(1);
    const s1 = addEntity(s0, mkPlayer('e_p', { atk: 100, def: 0, level: 1, hp: 100, maxHp: 100 }));
    const s2 = addEntity(s1, mkMonster('e_m', { atk: 0, def: 0, level: 50, hp: 999, maxHp: 999 }));

    let sawDodge = false;
    for (let i = 0; i < 30; i++) {
      const r = resolveCombat(s2, 'e_p', 'e_m', i);
      if (r.events.some((e) => e.type === 'attack_miss')) sawDodge = true;
    }
    expect(sawDodge).toBe(true);
  });

  it('crit triggers roughly 10% of the time (tolerance)', () => {
    const s0 = emptyState(1);
    const s1 = addEntity(s0, mkPlayer('e_p', { atk: 50, def: 0, level: 1, hp: 100, maxHp: 100 }));
    const s2 = addEntity(s1, mkMonster('e_m', { atk: 0, def: 0, level: 1, hp: 9999, maxHp: 9999 }));

    let critCount = 0;
    let hitCount = 0;
    for (let i = 0; i < 1000; i++) {
      const r = resolveCombat(s2, 'e_p', 'e_m', i + 100);
      const dmg = r.events.find((e) => e.type === 'damage');
      if (dmg && 'crit' in dmg.data && dmg.data.crit === true) critCount++;
      if (r.events.some((e) => e.type === 'damage')) hitCount++;
    }
    // 命中率 ~90% (lv1 * 2% = 2% dodge),crit 在命中里 ~10%
    // critCount / hitCount ≈ 10% (允许 4% ~ 18% 容差)
    const ratio = critCount / Math.max(1, hitCount);
    expect(ratio).toBeGreaterThan(0.04);
    expect(ratio).toBeLessThan(0.18);
  });

  it('emits death event when hp drops to 0', () => {
    const s0 = emptyState(1);
    const s1 = addEntity(s0, mkPlayer('e_p', { atk: 999, def: 0, level: 1, hp: 100, maxHp: 100 }));
    const s2 = addEntity(s1, mkMonster('e_m', { atk: 0, def: 0, level: 1, hp: 5, maxHp: 5 }));

    const r = resolveCombat(s2, 'e_p', 'e_m', 1);
    expect(r.events.some((e) => e.type === 'death')).toBe(true);
    // new state 里 defender.hp === 0
    expect(r.newState.entities['e_m']!.hp).toBe(0);
  });

  it('same faction does not fight', () => {
    const s0 = emptyState(1);
    const s1 = addEntity(s0, mkPlayer('e_p1', { faction: 'player' }));
    const s2 = addEntity(s1, mkPlayer('e_p2', { faction: 'player' }));
    const r = resolveCombat(s2, 'e_p1', 'e_p2', 1);
    expect(r.events.length).toBe(0);
    // state unchanged
    expect(r.newState).toBe(s2);
  });

  it('does not modify input state', () => {
    const s0 = emptyState(1);
    const s1 = addEntity(s0, mkPlayer('e_p', { atk: 50, def: 0, level: 1, hp: 100, maxHp: 100 }));
    const s2 = addEntity(s1, mkMonster('e_m', { atk: 0, def: 0, level: 1, hp: 50, maxHp: 50 }));
    const before = JSON.stringify(s2);
    resolveCombat(s2, 'e_p', 'e_m', 1);
    expect(JSON.stringify(s2)).toBe(before);
  });
});
