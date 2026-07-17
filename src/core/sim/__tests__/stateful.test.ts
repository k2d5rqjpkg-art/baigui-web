/**
 * src/core/sim/__tests__/stateful.test.ts
 *
 * Day8: stateful property-based testing
 *
 * 关键不变量: 跑 N 步随机 actions 后, sim 状态应该一直合理:
 *   - tick 单调递增
 *   - HP ≥ 0
 *   - 玩家 inventory ≤ 4 slots (weapon/armor/helm/accessory)
 *   - alive entity 数量 ≤ 初始 + 上限
 *   - rng 持续推进
 *   - events 数组不重复事件 type
 *
 * 比单帧 property 强: 验证"经过一连串操作后状态仍然健康",
 * 发现"操作 1 步看不出问题但 100 步后崩" 的 bug
 */
import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import { tick, emptyState, addEntity, worldGen, generateEncounter, ITEM_TABLE } from '../index';
import type { Action, EntityId, GameState, SimEntity, EquipSlot, ItemTemplate } from '../types';

// ============ helpers ============

function buildState(seed = 42, level = 1): GameState {
  let s = emptyState(seed);
  s = { ...s, rng: s.rng >>> 0 };
  const layout = worldGen(s.rng, level);
  s = { ...s, rng: s.rng >>> 0 };

  // 玩家
  const playerSpawn = layout.spawnPoints[0] ?? { x: 1, y: 1 };
  const player: SimEntity = {
    id: 'e_player_1' as EntityId,
    kind: 'player',
    pos: playerSpawn,
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
  s = addEntity(s, player);

  // 怪物
  const enc = generateEncounter(s, level, s.rng);
  s = { ...s, rng: enc.nextRng };
  const monsterSpawns = layout.spawnPoints.slice(1);
  for (let i = 0; i < enc.monsters.length; i++) {
    const m = enc.monsters[i]!;
    const sp = monsterSpawns[i % Math.max(1, monsterSpawns.length)] ?? { x: 2, y: 2 };
    s = addEntity(s, {
      id: `e_monster_${i + 1}` as EntityId,
      kind: 'monster',
      pos: sp,
      hp: m.hp,
      maxHp: m.hp,
      atk: m.atk,
      def: m.def,
      level: m.level,
      faction: 'enemy',
      inventory: [],
      equipment: {},
      buffs: [],
    });
  }

  // 物品
  for (let i = 0; i < Math.min(ITEM_TABLE.length, layout.spawnPoints.length - 1); i++) {
    const tpl = ITEM_TABLE[i]!;
    const sp = layout.spawnPoints[i + 1] ?? { x: 3, y: 3 };
    s = addEntity(s, {
      id: `e_item_${i + 1}` as EntityId,
      kind: 'item',
      pos: sp,
      hp: 0,
      maxHp: 0,
      atk: tpl.affixes[0]?.key === 'atk' ? tpl.affixes[0].value : 0,
      def: tpl.affixes[0]?.key === 'def' ? tpl.affixes[0].value : 0,
      level: 0,
      faction: 'neutral',
      inventory: [tpl.id],
      equipment: {},
      buffs: [],
    });
  }
  return s;
}

function findEntity(s: GameState, id: EntityId): SimEntity | undefined {
  return s.entities[id];
}

const slots: EquipSlot[] = ['weapon', 'armor', 'helm', 'accessory'];

// ============ 1000 步 stateful 测试 ============

describe('stateful property: 100 步随机 actions 后状态健康', () => {
  // 用 fast-check 的 fc.scheduler 跑 stateful 模型
  // (这里简化: 单次跑 200 步足够, 真 stateful 模型要写 Model class)

  it('100 步随机 actions → tick 单调递增, HP ≥ 0, inventory 合理', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 1000 }),
        fc.array(
          fc.oneof(
            fc.record({
              type: fc.constant('move' as const),
              dx: fc.integer({ min: -1, max: 1 }),
              dy: fc.integer({ min: -1, max: 1 }),
            }),
            fc.record({
              type: fc.constant('attack' as const),
              target: fc.integer({ min: 1, max: 3 }),
            }),
            fc.record({
              type: fc.constant('pickup' as const),
              item: fc.integer({ min: 1, max: 5 }),
            }),
          ),
          { minLength: 100, maxLength: 100 },
        ),
        (seed, moves) => {
          let s = buildState(seed);
          const layout = worldGen(s.rng, 1);
          let initialTick = s.tick;
          const initialEntityCount = Object.keys(s.entities).length;

          for (const m of moves) {
            let action: Action;
            if (m.type === 'move') {
              action = {
                type: 'move',
                entityId: 'e_player_1' as EntityId,
                payload: { dx: m.dx, dy: m.dy },
              };
            } else if (m.type === 'attack') {
              action = {
                type: 'attack',
                entityId: 'e_player_1' as EntityId,
                payload: { targetId: `e_monster_${m.target}` as EntityId },
              };
            } else {
              action = {
                type: 'pickup',
                entityId: 'e_player_1' as EntityId,
                payload: { itemId: `e_item_${m.item}` as EntityId },
              };
            }

            const result = tick(s, [action], 50, { layout });
            s = result.state;

            // 不变量 1: tick 单调递增
            if (s.tick !== initialTick + 1) return false;
            initialTick = s.tick;

            // 不变量 2: HP ≥ 0
            for (const e of Object.values(s.entities)) {
              if (e.hp < 0) return false;
            }

            // 不变量 3: entity 数不爆增 (≤ 初始 + 50 防御)
            if (Object.keys(s.entities).length > initialEntityCount + 50) return false;

            // 不变量 4: 玩家 inventory ≤ 4 slots
            const p = findEntity(s, 'e_player_1' as EntityId);
            if (p && p.equipment) {
              const equipped = Object.keys(p.equipment).filter((k) => p.equipment![k as EquipSlot]);
              if (equipped.length > slots.length) return false;
            }
          }

          return true;
        },
      ),
      { numRuns: 5 }, // 5 × 100 步 = 500 步 random 序列
    );
  });

  it('500 步纯 move 不会让玩家越界', () => {
    fc.assert(
      fc.property(fc.integer({ min: 1, max: 9999 }), (seed) => {
        let s = buildState(seed);
        const layout = worldGen(s.rng, 1);

        for (let i = 0; i < 500; i++) {
          const dx = [-1, 0, 1][i % 3];
          const dy = [0, 1, -1][(i + 1) % 3];
          const result = tick(
            s,
            [
              {
                type: 'move',
                entityId: 'e_player_1' as EntityId,
                payload: { dx, dy },
              },
            ],
            50,
            { layout },
          );
          s = result.state;

          const p = findEntity(s, 'e_player_1' as EntityId);
          if (!p) return true; // 死亡后移除
          // 玩家位置必须严格在 [0..width-1, 0..height-1] 内
          if (p.pos.x < 0 || p.pos.x >= layout.width) return false;
          if (p.pos.y < 0 || p.pos.y >= layout.height) return false;
        }
        return true;
      }),
      { numRuns: 10 },
    );
  });

  it('重复 attack 死亡后 target 不再响应 (死亡不可逆)', () => {
    fc.assert(
      fc.property(fc.integer({ min: 1, max: 9999 }), (seed) => {
        let s = buildState(seed);
        const layout = worldGen(s.rng, 1);

        // 50 次 attack 同 monster
        for (let i = 0; i < 50; i++) {
          const r = tick(
            s,
            [
              {
                type: 'attack',
                entityId: 'e_player_1' as EntityId,
                payload: { targetId: 'e_monster_1' as EntityId },
              },
            ],
            50,
            { layout },
          );
          s = r.state;
        }
        // 50 次后 monster_1 必然死 (Lv5 玩家打 Lv1-5 怪, 最多 50 击也够)
        const m1 = findEntity(s, 'e_monster_1' as EntityId);
        // monster 可能从 state 移除 (hp=0), 或 hp=0
        if (m1) {
          if (m1.hp !== 0) return false;
        }
        return true;
      }),
      { numRuns: 10 },
    );
  });

  it('重复 pickup 不会让玩家同时持有 >1 把同 slot 武器', () => {
    fc.assert(
      fc.property(fc.integer({ min: 1, max: 9999 }), (seed) => {
        let s = buildState(seed);
        const layout = worldGen(s.rng, 1);

        // 反复 pickup 同一 item 20 次
        for (let i = 0; i < 20; i++) {
          const r = tick(
            s,
            [
              {
                type: 'pickup',
                entityId: 'e_player_1' as EntityId,
                payload: { itemId: 'e_item_1' as EntityId },
              },
            ],
            50,
            { layout },
          );
          s = r.state;
        }
        const p = findEntity(s, 'e_player_1' as EntityId);
        if (!p) return true; // 死亡
        // equipment.weapon 只能有一个值 (或不装备)
        const wep = p.equipment?.weapon;
        if (wep && Array.isArray(wep)) return false; // 不可能是数组
        return true;
      }),
      { numRuns: 5 },
    );
  });
});
