/**
 * 移动 + 碰撞 —— 纯函数
 *
 * 4 方向网格移动 (dx, dy) ∈ {(-1,0),(1,0),(0,-1),(0,1)} 或其零向量。
 * 碰撞规则 (按优先级):
 *   1. 越界 (超出 [0, maxX) × [0, maxY)) → 拒绝
 *   2. 目标格有 entity 且 kind === 'item' → 允许走到该格 (item 可拾)
 *   3. 目标格有 entity 且 kind ∈ {'player','monster'} → 拒绝
 *   4. walls 集合里有该格 → 拒绝
 *
 * 注:walls 由 world.ts 的 MapLayout 提供,通过 state 之外的参数传入,
 *     因为地图本身不属于 state.entities。
 */

import type { EntityId, GameEvent, GameState, MapLayout, SimEntity } from './types';

export interface MoveResult {
  events: GameEvent[];
  newState: GameState;
}

/** 检查 (x,y) 是否被 wall 占用 */
function isWall(layout: MapLayout, x: number, y: number): boolean {
  for (const w of layout.walls) {
    if (w.x === x && w.y === y) return true;
  }
  return false;
}

/** 检查 (x,y) 是否有阻挡实体 (player/monster) */
function blockerAt(state: GameState, x: number, y: number, selfId: EntityId): SimEntity | null {
  for (const id of Object.keys(state.entities) as EntityId[]) {
    if (id === selfId) continue;
    const e = state.entities[id]!;
    if (e.pos.x !== x || e.pos.y !== y) continue;
    if (e.kind === 'player' || e.kind === 'monster') return e;
    // item 不阻挡 (可走过,可拾取)
  }
  return null;
}

export interface MoveOptions {
  /** 地图布局 —— 用于碰撞墙判定。不传则只用 entities 阻挡判定。 */
  layout?: MapLayout;
  /** 地图宽高 (用于边界) —— 必须传 */
  bounds: { width: number; height: number };
}

/**
 * 移动 entity。
 *
 * @returns MoveResult (含 events 与新 state)
 */
export function moveEntity(
  state: GameState,
  entityId: EntityId,
  dx: number,
  dy: number,
  opts: MoveOptions,
): MoveResult {
  const entity = state.entities[entityId];
  if (!entity) {
    return { events: [], newState: state };
  }
  // 死的不能动
  if (entity.hp <= 0) {
    return { events: [], newState: state };
  }
  // 必须是 4 方向之一 (含零向量 = 不动)
  const adx = Math.abs(dx);
  const ady = Math.abs(dy);
  const isCardinal =
    (adx === 1 && dy === 0) || (adx === 0 && ady === 1) || (adx === 0 && ady === 0);
  if (!isCardinal) {
    return { events: [], newState: state };
  }

  const newX = entity.pos.x + dx;
  const newY = entity.pos.y + dy;

  // 1) 越界
  if (newX < 0 || newX >= opts.bounds.width || newY < 0 || newY >= opts.bounds.height) {
    return { events: [], newState: state };
  }
  // 2) wall
  if (opts.layout && isWall(opts.layout, newX, newY)) {
    return { events: [], newState: state };
  }
  // 3) blocker
  if (blockerAt(state, newX, newY, entityId)) {
    return { events: [], newState: state };
  }

  // 允许移动
  const newEntity: SimEntity = {
    ...entity,
    pos: { x: newX, y: newY },
  };
  const newEntities: Record<EntityId, SimEntity> = {
    ...state.entities,
    [entityId]: newEntity,
  };

  const events: GameEvent[] = [
    {
      type: 'move',
      source: entityId,
      target: null,
      data: { fromX: entity.pos.x, fromY: entity.pos.y, toX: newX, toY: newY },
      tick: state.tick,
    },
  ];

  return {
    events,
    newState: { ...state, entities: newEntities },
  };
}
