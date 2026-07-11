/**
 * vitest: movement
 *  - 撞墙不移动
 *  - 越界不移动
 *  - 阻挡实体不移动
 *  - item 不阻挡 (可踩)
 *  - 合法移动返回 move 事件
 *  - 不修改入参 state
 */

import { describe, it, expect } from 'vitest';
import { moveEntity } from '../movement';
import { emptyState, addEntity } from '../tick';
import type { SimEntity, EntityId, MapLayout } from '../types';

function mkPlayer(id: EntityId, x: number, y: number): SimEntity {
  return {
    id,
    kind: 'player',
    pos: { x, y },
    hp: 100,
    maxHp: 100,
    atk: 10,
    def: 5,
    level: 1,
    faction: 'player',
    inventory: [],
    equipment: {},
    buffs: [],
  };
}

function mkMonster(id: EntityId, x: number, y: number): SimEntity {
  return {
    id,
    kind: 'monster',
    pos: { x, y },
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
}

function mkItem(id: EntityId, x: number, y: number): SimEntity {
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
    inventory: [],
    equipment: {},
    buffs: [],
  };
}

const baseLayout: MapLayout = {
  width: 10,
  height: 10,
  rooms: [{ x: 0, y: 0, w: 10, h: 10 }],
  walls: [
    { x: 0, y: 0 }, { x: 1, y: 0 }, { x: 2, y: 0 }, { x: 3, y: 0 }, { x: 4, y: 0 },
    { x: 5, y: 0 }, { x: 6, y: 0 }, { x: 7, y: 0 }, { x: 8, y: 0 }, { x: 9, y: 0 },
    { x: 0, y: 9 }, { x: 1, y: 9 }, { x: 2, y: 9 }, { x: 3, y: 9 }, { x: 4, y: 9 },
    { x: 5, y: 9 }, { x: 6, y: 9 }, { x: 7, y: 9 }, { x: 8, y: 9 }, { x: 9, y: 9 },
    { x: 0, y: 1 }, { x: 0, y: 2 }, { x: 0, y: 3 }, { x: 0, y: 4 },
    { x: 0, y: 5 }, { x: 0, y: 6 }, { x: 0, y: 7 }, { x: 0, y: 8 },
    { x: 9, y: 1 }, { x: 9, y: 2 }, { x: 9, y: 3 }, { x: 9, y: 4 },
    { x: 9, y: 5 }, { x: 9, y: 6 }, { x: 9, y: 7 }, { x: 9, y: 8 },
  ],
  spawnPoints: [{ x: 5, y: 5 }],
};

describe('moveEntity', () => {
  it('moves into empty floor cell and emits move event', () => {
    const s = addEntity(emptyState(1), mkPlayer('e_p', 5, 5));
    const r = moveEntity(s, 'e_p', 1, 0, { layout: baseLayout, bounds: { width: 10, height: 10 } });
    expect(r.newState.entities['e_p']!.pos).toEqual({ x: 6, y: 5 });
    expect(r.events.some((e) => e.type === 'move')).toBe(true);
  });

  it('does not move into a wall (collision)', () => {
    // 玩家在 (1,5),右移到 (2,5) —— 但 (2,5) 不在 walls 里,所以这里造个真墙
    const layout: MapLayout = {
      ...baseLayout,
      walls: [...baseLayout.walls, { x: 2, y: 5 }],
    };
    const s = addEntity(emptyState(1), mkPlayer('e_p', 1, 5));
    const r = moveEntity(s, 'e_p', 1, 0, { layout, bounds: { width: 10, height: 10 } });
    expect(r.newState.entities['e_p']!.pos).toEqual({ x: 1, y: 5 });
    expect(r.events.length).toBe(0);
  });

  it('does not move out of bounds', () => {
    const s = addEntity(emptyState(1), mkPlayer('e_p', 0, 5));
    const r = moveEntity(s, 'e_p', -1, 0, { layout: baseLayout, bounds: { width: 10, height: 10 } });
    expect(r.newState.entities['e_p']!.pos).toEqual({ x: 0, y: 5 });
    expect(r.events.length).toBe(0);
  });

  it('does not move into a blocking entity (monster)', () => {
    const s0 = addEntity(emptyState(1), mkPlayer('e_p', 5, 5));
    const s1 = addEntity(s0, mkMonster('e_m', 6, 5));
    const r = moveEntity(s1, 'e_p', 1, 0, { layout: baseLayout, bounds: { width: 10, height: 10 } });
    expect(r.newState.entities['e_p']!.pos).toEqual({ x: 5, y: 5 });
    expect(r.events.length).toBe(0);
  });

  it('item does NOT block movement (can walk over)', () => {
    const s0 = addEntity(emptyState(1), mkPlayer('e_p', 5, 5));
    const s1 = addEntity(s0, mkItem('e_i', 6, 5));
    const r = moveEntity(s1, 'e_p', 1, 0, { layout: baseLayout, bounds: { width: 10, height: 10 } });
    expect(r.newState.entities['e_p']!.pos).toEqual({ x: 6, y: 5 });
    expect(r.events.some((e) => e.type === 'move')).toBe(true);
  });

  it('non-cardinal move is ignored', () => {
    const s = addEntity(emptyState(1), mkPlayer('e_p', 5, 5));
    const r = moveEntity(s, 'e_p', 1, 1, { layout: baseLayout, bounds: { width: 10, height: 10 } });
    expect(r.newState.entities['e_p']!.pos).toEqual({ x: 5, y: 5 });
    expect(r.events.length).toBe(0);
  });

  it('dead entity does not move', () => {
    const s = addEntity(emptyState(1), mkPlayer('e_p', 5, 5));
    // 把 hp 改成 0
    s.entities['e_p']!.hp = 0;
    const r = moveEntity(s, 'e_p', 1, 0, { layout: baseLayout, bounds: { width: 10, height: 10 } });
    expect(r.newState.entities['e_p']!.pos).toEqual({ x: 5, y: 5 });
    expect(r.events.length).toBe(0);
  });

  it('does not mutate input state', () => {
    const s = addEntity(emptyState(1), mkPlayer('e_p', 5, 5));
    const before = JSON.stringify(s);
    moveEntity(s, 'e_p', 1, 0, { layout: baseLayout, bounds: { width: 10, height: 10 } });
    expect(JSON.stringify(s)).toBe(before);
  });
});