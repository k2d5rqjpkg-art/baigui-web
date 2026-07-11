/**
 * src/core/sim/__tests__/property.test.ts
 *
 * Day7+ 补充: fast-check property-based testing
 *
 * 为什么不变量需要 property-based 而不是单测:
 *   - 单测只测固定几个 case, edge case 可能漏
 *   - property-based 自动生成几百个随机输入,验证"对所有输入都成立"
 *   - 适合 sim 这种"纯函数 + 确定性 + 输入域大"的项目
 *
 * 每个不变量都是 "对所有 (input) 都成立", 任何反例 = 真 bug
 */
import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';

import {
  tick,
  emptyState,
  addEntity,
  resolveCombat,
  moveEntity,
  worldGen,
  ITEM_TABLE,
} from '../index';
import type {
  Action,
  EntityId,
  GameState,
  SimEntity,
  EquipSlot,
  Affix,
  ItemTemplate,
} from '../types';

// ============ Arbitraries (测试数据生成器) ============

/** EntityId 是 `e_${string}` 模板字面量 */
const eidArb = fc.string({ minLength: 1, maxLength: 10 }).map((s) => `e_${s}` as EntityId);

/** 实体位置 */
const posArb = fc.record({ x: fc.integer({ min: 0, max: 40 }), y: fc.integer({ min: 0, max: 30 }) });

/** HP 范围 (避免负数) */
const hpArb = fc.integer({ min: 1, max: 200 });

/** 基础 SimEntity 生成器 (player 或 monster) */
function entityArb(kind: 'player' | 'monster') {
  return fc.record({
    id: eidArb,
    pos: posArb,
    hp: hpArb,
    maxHp: hpArb,
    atk: fc.integer({ min: 1, max: 50 }),
    def: fc.integer({ min: 0, max: 30 }),
    level: fc.integer({ min: 1, max: 20 }),
  }) as fc.Arbitrary<SimEntity>;
}

/** 加 entity 到 state (不指定 kind 因为 SimEntity union 复杂) */
function seedState(player?: SimEntity, monster?: SimEntity): GameState {
  let s = emptyState(42);
  if (player) s = addEntity(s, player);
  if (monster) s = addEntity(s, monster);
  return s;
}

const playerArb = entityArb('player');
const monsterArb = entityArb('monster');

/** 简单 Action 生成器 (move / attack / pickup) */
const actionArb = fc.oneof(
  fc.record({
    type: fc.constant('move' as const),
    entityId: eidArb,
    payload: fc.record({ dx: fc.integer({ min: -1, max: 1 }), dy: fc.integer({ min: -1, max: 1 }) }),
  }),
  fc.record({
    type: fc.constant('attack' as const),
    entityId: eidArb,
    payload: fc.record({ targetId: eidArb }),
  }),
  fc.record({
    type: fc.constant('pickup' as const),
    entityId: eidArb,
    payload: fc.record({ itemId: eidArb }),
  }),
) as fc.Arbitrary<Action>;

// ============ Property 1: sim 纯函数性 ============

describe('property: sim 纯函数性', () => {
  it('tick() 不修改入参 state (runNum=50)', () => {
    fc.assert(
      fc.property(playerArb, monsterArb, fc.array(actionArb, { maxLength: 5 }), (p, m, actions) => {
        const before = seedState(p, m);
        const beforeSnapshot = JSON.stringify(before);
        tick(before, actions, 50);
        return beforeSnapshot === JSON.stringify(before);
      }),
      { numRuns: 50 },
    );
  });

  it('resolveCombat 不修改入参 state', () => {
    fc.assert(
      fc.property(playerArb, monsterArb, fc.integer({ min: 0, max: 1000 }), (p, m, seed) => {
        const s = seedState(p, m);
        const snap = JSON.stringify(s);
        resolveCombat(s, p.id, m.id, seed);
        return JSON.stringify(s) === snap;
      }),
      { numRuns: 50 },
    );
  });
});

// ============ Property 2: 同 seed 同结果 (确定性) ============

describe('property: 同 seed 同结果', () => {
  it('相同 (state, actions) 总是产生相同 events', () => {
    fc.assert(
      fc.property(playerArb, monsterArb, fc.array(actionArb, { maxLength: 3 }), (p, m, actions) => {
        const s = seedState(p, m);
        const r1 = tick(s, actions, 50);
        const r2 = tick(s, actions, 50);
        return JSON.stringify(r1.events) === JSON.stringify(r2.events);
      }),
      { numRuns: 30 },
    );
  });
});

// ============ Property 3: HP 不变式 ============

describe('property: HP 不变式', () => {
  it('damage 后 victim.hp ≤ 原始 hp', () => {
    fc.assert(
      fc.property(
        playerArb,
        monsterArb,
        fc.integer({ min: 0, max: 1000 }),
        (p, m, seed) => {
          const s = seedState(p, m);
          const hpBefore = m.hp;
          const result = resolveCombat(s, p.id, m.id, seed);
          const victimAfter = result.newState.entities[m.id];
          if (!victimAfter) return true; // 死亡后从 state 移除 (no, 实际是 hp=0)
          return victimAfter.hp <= hpBefore;
        },
      ),
      { numRuns: 100 },
    );
  });

  it('HP 永远 ≥ 0 (不会负数)', () => {
    fc.assert(
      fc.property(
        playerArb,
        monsterArb,
        fc.integer({ min: 0, max: 1000 }),
        (p, m, seed) => {
          const s = seedState(p, m);
          const result = resolveCombat(s, p.id, m.id, seed);
          const victim = result.newState.entities[m.id];
          return victim ? victim.hp >= 0 : true;
        },
      ),
      { numRuns: 100 },
    );
  });

  it('hp=0 后再 attack, hp 仍然 0 (不会负数)', () => {
    fc.assert(
      fc.property(
        playerArb,
        fc.integer({ min: 0, max: 1000 }),
        (p, seed) => {
          const deadMonster: SimEntity = {
            ...p,
            id: 'e_m' as EntityId,
            kind: 'monster',
            hp: 0,
            maxHp: 100,
            atk: 5,
            def: 0,
            level: 1,
            faction: 'enemy',
            inventory: [],
            equipment: {},
            buffs: [],
          };
          const s = seedState(p, deadMonster);
          const result = resolveCombat(s, p.id, deadMonster.id, seed);
          const m = result.newState.entities[deadMonster.id];
          return m ? m.hp === 0 : true;
        },
      ),
      { numRuns: 30 },
    );
  });
});

// ============ Property 4: tick 不变量 ============

describe('property: tick tick 单调递增', () => {
  it('每次 tick 后 state.tick + 1', () => {
    fc.assert(
      fc.property(
        playerArb,
        fc.array(actionArb, { maxLength: 3 }),
        (p, actions) => {
          const s = seedState(p);
          const before = s.tick;
          const r = tick(s, actions, 50);
          return r.state.tick === before + 1;
        },
      ),
      { numRuns: 50 },
    );
  });

  it('tick 永远 ≥ 0', () => {
    fc.assert(
      fc.property(
        playerArb,
        fc.array(actionArb, { maxLength: 3 }),
        (p, actions) => {
          const s = seedState(p);
          const r = tick(s, actions, 50);
          return r.state.tick >= 0;
        },
      ),
      { numRuns: 30 },
    );
  });
});

// ============ Property 5: move 在地图内 ============

describe('property: move 后位置在 bounds 内', () => {
  it('moveEntity 后位置 (x, y) 还在 [0..width, 0..height]', () => {
    fc.assert(
      fc.property(
        fc.record({ x: fc.integer({ min: 0, max: 39 }), y: fc.integer({ min: 0, max: 29 }) }),
        fc.integer({ min: -1, max: 1 }),
        fc.integer({ min: -1, max: 1 }),
        (pos, dx, dy) => {
          const layout = worldGen(42, 1);
          const player: SimEntity = {
            id: 'e_p' as EntityId,
            kind: 'player',
            pos,
            hp: 100, maxHp: 100,
            atk: 30, def: 5, level: 5,
            faction: 'player',
            inventory: [], equipment: {}, buffs: [],
          };
          const s = seedState(player);
          const result = moveEntity(s, player.id, dx, dy, { bounds: { width: layout.width, height: layout.height }, layout });
          const moved = result.newState.entities[player.id];
          if (!moved) return true;
          return (
            moved.pos.x >= 0 && moved.pos.x < layout.width &&
            moved.pos.y >= 0 && moved.pos.y < layout.height
          );
        },
      ),
      { numRuns: 100 },
    );
  });
});

// ============ Property 6: ITEM_TABLE 数据完整性 ============

describe('property: ITEM_TABLE 不变量', () => {
  it('每个 item 都有 ≥1 affix', () => {
    fc.assert(
      fc.property(fc.constantFrom(...ITEM_TABLE), (item: ItemTemplate) => {
        return Array.isArray(item.affixes) && item.affixes.length >= 1;
      }),
      { numRuns: 50 },
    );
  });

  it('每个 affix 的 value 是正数 (武器/防具/血量)', () => {
    fc.assert(
      fc.property(fc.constantFrom(...ITEM_TABLE), (item: ItemTemplate) => {
        return item.affixes.every((a: Affix) => a.value > 0);
      }),
      { numRuns: 50 },
    );
  });

  it('每个 item 的 id 唯一', () => {
    fc.assert(
      fc.property(fc.constantFrom(...ITEM_TABLE), (item: ItemTemplate) => {
        const sameId = ITEM_TABLE.filter((it) => it.id === item.id);
        return sameId.length === 1;
      }),
      { numRuns: 30 },
    );
  });

  it('affix.key 只能是 atk/def/hp', () => {
    fc.assert(
      fc.property(fc.constantFrom(...ITEM_TABLE), (item: ItemTemplate) => {
        const valid: Array<Affix['key']> = ['atk', 'def', 'hp'];
        return item.affixes.every((a: Affix) => valid.includes(a.key));
      }),
      { numRuns: 30 },
    );
  });

  it('slot 只能是 weapon/armor/helm/accessory', () => {
    fc.assert(
      fc.property(fc.constantFrom(...ITEM_TABLE), (item: ItemTemplate) => {
        const valid: EquipSlot[] = ['weapon', 'armor', 'helm', 'accessory'];
        return valid.includes(item.slot);
      }),
      { numRuns: 30 },
    );
  });
});

// ============ Property 7: total_damage 守恒 ============

describe('property: 战斗总伤害守恒', () => {
  it('单次 combat 后双方 HP 之和 ≤ 之前之和 (伤害守恒)', () => {
    fc.assert(
      fc.property(
        playerArb,
        monsterArb,
        fc.integer({ min: 0, max: 1000 }),
        (p, m, seed) => {
          const s = seedState(p, m);
          const totalBefore = p.hp + m.hp;
          const result = resolveCombat(s, p.id, m.id, seed);
          const pAfter = result.newState.entities[p.id];
          const mAfter = result.newState.entities[m.id];
          if (!pAfter || !mAfter) return true;
          const totalAfter = pAfter.hp + mAfter.hp;
          // 总 HP 不增 (最多持平, 因为死亡不复活)
          return totalAfter <= totalBefore;
        },
      ),
      { numRuns: 100 },
    );
  });
});
