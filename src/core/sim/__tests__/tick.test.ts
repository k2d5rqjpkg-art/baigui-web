/**
 * vitest: tick (核心入口 round-trip)
 *  - state + actions → newState + events
 *  - 不修改入参 state (纯函数)
 *  - 每 tick tick+1, rng 推进
 *  - move / attack / pickup 都正确路由
 *  - 同 seed 同 actions → 同结果 (确定性)
 */

import { describe, it, expect } from 'vitest';
import { tick, emptyState, addEntity } from '../tick';
import { seedFromString } from '../rng';
import type { SimEntity, EntityId, GameState } from '../types';

function mkPlayer(id: EntityId, x: number, y: number, opts: Partial<SimEntity> = {}): SimEntity {
  return {
    id,
    kind: 'player',
    pos: { x, y },
    hp: 100,
    maxHp: 100,
    atk: 30,
    def: 5,
    level: 5,
    faction: 'player',
    inventory: [],
    equipment: {},
    buffs: [],
    ...opts,
  };
}

function mkMonster(id: EntityId, x: number, y: number, opts: Partial<SimEntity> = {}): SimEntity {
  return {
    id,
    kind: 'monster',
    pos: { x, y },
    hp: 50,
    maxHp: 50,
    atk: 5,
    def: 2,
    level: 1,
    faction: 'enemy',
    inventory: [],
    equipment: {},
    buffs: [],
    ...opts,
  };
}

function mkItem(id: EntityId, templateId: string, x: number, y: number): SimEntity {
  return {
    id,
    kind: 'item',
    pos: { x, y },
    hp: 0,
    maxHp: 0,
    atk: 0,
    def: 0,
    level: 0,
    faction: 'neutral',
    inventory: [templateId],
    equipment: {},
    buffs: [],
  };
}

const layout = {
  width: 20,
  height: 20,
  rooms: [{ x: 1, y: 1, w: 18, h: 18 }],
  walls: [] as Array<{ x: number; y: number }>,
  spawnPoints: [{ x: 10, y: 10 }],
};

describe('tick()', () => {
  it('round-trip: state + actions → newState + events', () => {
    let s: GameState = emptyState(seedFromString('round-trip-1'));
    s = addEntity(s, mkPlayer('e_p', 5, 5));
    s = addEntity(s, mkMonster('e_m', 6, 5));

    const actions = [
      { type: 'attack' as const, entityId: 'e_p' as EntityId, payload: { targetId: 'e_m' as EntityId } },
    ];
    const r = tick(s, actions, 1.0, { layout });
    expect(r.state.tick).toBe(s.tick + 1);
    expect(r.events.length).toBeGreaterThan(0);
    expect(r.events[r.events.length - 1]!.type).toBe('tick_end');
  });

  it('does NOT mutate input state (pure function)', () => {
    let s: GameState = emptyState(seedFromString('pure-test'));
    s = addEntity(s, mkPlayer('e_p', 5, 5));
    s = addEntity(s, mkMonster('e_m', 6, 5));
    const before = JSON.stringify(s);
    const beforeTick = s.tick;
    const beforeRng = s.rng;

    tick(s, [
      { type: 'move' as const, entityId: 'e_p' as EntityId, payload: { dx: 1, dy: 0 } },
      { type: 'attack' as const, entityId: 'e_p' as EntityId, payload: { targetId: 'e_m' as EntityId } },
    ], 1.0, { layout });

    expect(JSON.stringify(s)).toBe(before);
    expect(s.tick).toBe(beforeTick);
    expect(s.rng).toBe(beforeRng);
  });

  it('advances tick by exactly 1', () => {
    let s: GameState = emptyState(42);
    s = addEntity(s, mkPlayer('e_p', 5, 5));
    const r1 = tick(s, [], 0.5);
    expect(r1.state.tick).toBe(s.tick + 1);
    const r2 = tick(r1.state, [], 0.5);
    expect(r2.state.tick).toBe(r1.state.tick + 1);
  });

  it('rng state advances each tick', () => {
    let s: GameState = emptyState(100);
    s = addEntity(s, mkPlayer('e_p', 5, 5));
    const r = tick(s, [], 1.0);
    expect(r.state.rng).not.toBe(s.rng);
  });

  it('same seed + same actions → same result (deterministic)', () => {
    function build(): GameState {
      let s = emptyState(seedFromString('deterministic'));
      s = addEntity(s, mkPlayer('e_p', 5, 5));
      s = addEntity(s, mkMonster('e_m', 6, 5));
      return s;
    }
    const s1 = build();
    const s2 = build();
    const a1 = [
      { type: 'attack' as const, entityId: 'e_p' as EntityId, payload: { targetId: 'e_m' as EntityId } },
    ];
    const r1 = tick(s1, a1, 1.0, { layout });
    const r2 = tick(s2, a1, 1.0, { layout });

    expect(r1.state.tick).toBe(r2.state.tick);
    expect(r1.state.rng).toBe(r2.state.rng);
    expect(r1.state.entities['e_m']!.hp).toBe(r2.state.entities['e_m']!.hp);
  });

  it('routes move action to movement sub-module', () => {
    let s: GameState = emptyState(1);
    s = addEntity(s, mkPlayer('e_p', 5, 5));
    const r = tick(s, [
      { type: 'move' as const, entityId: 'e_p' as EntityId, payload: { dx: 1, dy: 0 } },
    ], 1.0, { layout });
    expect(r.state.entities['e_p']!.pos).toEqual({ x: 6, y: 5 });
    expect(r.events.some((e) => e.type === 'move')).toBe(true);
  });

  it('routes attack action to combat sub-module', () => {
    let s: GameState = emptyState(1);
    s = addEntity(s, mkPlayer('e_p', 5, 5, { atk: 100 }));
    s = addEntity(s, mkMonster('e_m', 5, 6, { def: 0, level: 1, hp: 50, maxHp: 50 }));
    const r = tick(s, [
      { type: 'attack' as const, entityId: 'e_p' as EntityId, payload: { targetId: 'e_m' as EntityId } },
    ], 1.0, { layout });
    expect(r.events.some((e) => e.type === 'damage')).toBe(true);
    expect(r.state.entities['e_m']!.hp).toBeLessThan(50);
  });

  it('routes pickup action to items sub-module', () => {
    let s: GameState = emptyState(1);
    s = addEntity(s, mkPlayer('e_p', 5, 5));
    s = addEntity(s, mkItem('e_i', 'sword_iron', 5, 5));
    const r = tick(s, [
      { type: 'pickup' as const, entityId: 'e_p' as EntityId, payload: { itemId: 'e_i' as EntityId } },
    ], 1.0, { layout });
    expect(r.state.entities['e_p']!.equipment.weapon).toBe('sword_iron');
    expect(r.events.some((e) => e.type === 'pickup')).toBe(true);
  });

  it('handles unknown action gracefully (no throw)', () => {
    let s: GameState = emptyState(1);
    s = addEntity(s, mkPlayer('e_p', 5, 5));
    const r = tick(s, [
      // @ts-expect-error 故意测试非法 action
      { type: 'teleport', entityId: 'e_p', payload: {} },
    ], 1.0, { layout });
    expect(r.events.some((e) => e.type === 'unknown_action')).toBe(true);
    expect(r.state.tick).toBe(s.tick + 1);
  });

  it('emits tick_end event with dt', () => {
    let s: GameState = emptyState(1);
    s = addEntity(s, mkPlayer('e_p', 5, 5));
    const r = tick(s, [], 0.25, { layout });
    const tickEnd = r.events.find((e) => e.type === 'tick_end');
    expect(tickEnd).toBeDefined();
    if (tickEnd && 'dt' in tickEnd.data) {
      expect(tickEnd.data.dt).toBe(0.25);
    }
  });
});