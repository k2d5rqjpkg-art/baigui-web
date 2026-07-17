/**
 * src/core/sim/__tests__/perf-bench.test.ts
 *
 * AI 测试 #4: 性能基准 + 回归阈值
 *
 * 跑 1000 步 sim, 断言耗时 < 阈值 (CI 回归门)
 */
import { describe, it, expect } from 'vitest';
import { emptyState, addEntity, worldGen, generateEncounter, tick } from '../index';
import type { EntityId, GameState, SimEntity, Action } from '../types';

function aiStep(p: SimEntity, s: GameState): Action | null {
  if (p.hp <= 0) return null;
  let best: SimEntity | undefined;
  let bestD = Infinity;
  for (const e of Object.values(s.entities)) {
    if (e.kind !== 'monster' || e.hp <= 0) continue;
    const d = Math.abs(e.pos.x - p.pos.x) + Math.abs(e.pos.y - p.pos.y);
    if (d < bestD) {
      bestD = d;
      best = e;
    }
  }
  if (!best) return null;
  if (bestD <= 1) return { type: 'attack', entityId: p.id, payload: { targetId: best.id } };
  const dx = Math.sign(best.pos.x - p.pos.x);
  const dy = Math.sign(best.pos.y - p.pos.y);
  if (dx !== 0) return { type: 'move', entityId: p.id, payload: { dx, dy: 0 } };
  return { type: 'move', entityId: p.id, payload: { dx: 0, dy } };
}

function buildWorld(nMonsters: number, seed: number): GameState {
  let s = emptyState(seed);
  s = addEntity(s, {
    id: 'e_p1' as EntityId,
    kind: 'player',
    pos: { x: 5, y: 5 },
    hp: 200,
    maxHp: 200,
    atk: 50,
    def: 10,
    level: 5,
    faction: 'player',
    inventory: [],
    equipment: {},
    buffs: [],
  });
  for (let i = 0; i < nMonsters; i++) {
    s = addEntity(s, {
      id: `e_m_${i}` as EntityId,
      kind: 'monster',
      pos: { x: (i % 20) + 1, y: ((i / 20) | 0) + 5 },
      hp: 30,
      maxHp: 30,
      atk: 8,
      def: 1,
      level: 1,
      faction: 'enemy',
      inventory: [],
      equipment: {},
      buffs: [],
    });
  }
  return s;
}

describe('AI 测试 #4: 性能基准', () => {
  it('100 怪 × 500 步 < 2s', () => {
    const layout = worldGen(1, 5);
    let state = buildWorld(100, 1);
    const t0 = performance.now();
    for (let i = 0; i < 500; i++) {
      const p = state.entities['e_p1' as EntityId];
      if (!p || p.hp <= 0) break;
      const a = aiStep(p, state);
      state = tick(state, a ? [a] : [], 50, { layout }).state;
    }
    const t1 = performance.now();
    const ms = t1 - t0;
    // 阈值: 2s (宽松; CI 上若 < 2s 算合格)
    expect(ms).toBeLessThan(2000);
  });

  it('20 怪 × 1000 步 < 1.5s', () => {
    const layout = worldGen(2, 5);
    let state = buildWorld(20, 2);
    const t0 = performance.now();
    for (let i = 0; i < 1000; i++) {
      const p = state.entities['e_p1' as EntityId];
      if (!p || p.hp <= 0) break;
      const a = aiStep(p, state);
      state = tick(state, a ? [a] : [], 50, { layout }).state;
    }
    const ms = performance.now() - t0;
    expect(ms).toBeLessThan(1500);
  });

  it('纯 sim 1000 步 < 500ms (无 I/O, 极限)', () => {
    const layout = worldGen(3, 5);
    const state0 = buildWorld(20, 3);
    const t0 = performance.now();
    for (let i = 0; i < 1000; i++) {
      const r = tick(state0, [], 50, { layout });
      // 简单计时器防止 JIT 优化掉
      if (r.events.length < 0) throw new Error('unreachable');
    }
    const ms = performance.now() - t0;
    expect(ms).toBeLessThan(500);
  });
});
