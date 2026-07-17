/**
 * src/core/sim/__tests__/fuzz-tick.test.ts
 *
 * Day41: 随机输入 fuzz — sim tick 接收任意 action, 验证 invariant
 */
import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import { emptyState, addEntity, worldGen, tick } from '../index';
import type { EntityId, Action, GameState, SimEntity } from '../types';

/** 构造最小可工作世界 */
function seedWorld(): { state: GameState; layout: ReturnType<typeof worldGen> } {
  let state = emptyState(42);
  state = addEntity(state, {
    id: 'e_p1' as EntityId,
    kind: 'player',
    pos: { x: 10, y: 10 },
    hp: 100,
    maxHp: 100,
    atk: 30,
    def: 5,
    level: 3,
    faction: 'player',
    inventory: [],
    equipment: {},
    buffs: [],
  });
  state = addEntity(state, {
    id: 'e_m1' as EntityId,
    kind: 'monster',
    pos: { x: 11, y: 10 },
    hp: 30,
    maxHp: 30,
    atk: 10,
    def: 1,
    level: 1,
    faction: 'enemy',
    inventory: [],
    equipment: {},
    buffs: [],
  });
  const layout = worldGen(42, 3);
  return { state, layout };
}

const actionArb = (eid: EntityId, tid: EntityId): fc.Arbitrary<Action> =>
  fc
    .oneof(
      fc.tuple(
        fc.constant('move'),
        fc.integer({ min: -1, max: 1 }),
        fc.integer({ min: -1, max: 1 }),
      ),
      fc.tuple(fc.constant('attack'), fc.constant(tid)),
      fc.tuple(fc.constant('pickup'), fc.constant(tid)),
    )
    .map(([k, x, y]) => {
      if (k === 'move') return { type: 'move', entityId: eid, payload: { dx: x, dy: y } } as Action;
      if (k === 'attack')
        return { type: 'attack', entityId: eid, payload: { targetId: x } } as Action;
      return { type: 'pickup', entityId: eid, payload: { itemId: x } } as Action;
    });

describe('Day41: fuzz sim tick 100 轮', () => {
  it('随机 actions 不崩 + invariant 维持', () => {
    const { layout } = seedWorld();
    fc.assert(
      fc.property(fc.integer({ min: 1, max: 100 }), (n) => {
        const { state: init } = seedWorld();
        let state = init;
        const eid = 'e_p1' as EntityId;
        for (let i = 0; i < n; i++) {
          const p = state.entities[eid];
          if (!p || p.hp <= 0) break;
          // 每次 fuzz 一个 action
          const actions: Action[] = [];
          for (let j = 0; j < 1; j++) {
            const sample = actionArb(eid, 'e_m1' as EntityId);
            const seed = i * 1000 + n + j;
            let chosen: Action | null = null;
            fc.assert(
              fc.property(sample, (a) => {
                chosen = a;
              }),
              { seed, numRuns: 1 },
            );
            if (chosen) actions.push(chosen);
          }
          const r = tick(state, actions, 50, { layout });
          state = r.state;
          const cur = state.entities[eid];
          if (cur) {
            expect(cur.hp).toBeGreaterThanOrEqual(0);
            expect(cur.hp).toBeLessThanOrEqual(cur.maxHp);
          }
          expect(state.tick).toBeGreaterThanOrEqual(i);
        }
        return true;
      }),
      { numRuns: 20 },
    );
  });

  it('100 轮空 action 不崩', () => {
    const { layout } = seedWorld();
    let state = seedWorld().state;
    for (let i = 0; i < 100; i++) {
      const r = tick(state, [], 50, { layout });
      state = r.state;
      expect(state.tick).toBe(i + 1);
      expect(state.entities['e_p1' as EntityId]).toBeDefined();
    }
  });

  it('大量随机动作 (50-150 步) 后 state 仍结构合法', () => {
    fc.assert(
      fc.property(
        fc.array(actionArb('e_p1' as EntityId, 'e_m1' as EntityId), {
          minLength: 50,
          maxLength: 150,
        }),
        (batch) => {
          const { state: init, layout } = seedWorld();
          let state = init;
          for (const a of batch) {
            const r = tick(state, [a], 50, { layout });
            state = r.state;
          }
          const ids = Object.keys(state.entities);
          expect(new Set(ids).size).toBe(ids.length);
          expect(state.tick).toBe(batch.length);
        },
      ),
      { numRuns: 20 },
    );
  });
});
