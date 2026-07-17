/**
 * tick() —— sim 核心入口
 *
 * 签名: tick(state, actions, dt, options?) → { state, events }
 *
 * 设计契约 (WoC 风格):
 *   - 输入 state 不被修改
 *   - 不读 Date.now / Math.random / fetch / console.log
 *   - 所有随机走 state.rng (Mulberry32)
 *   - 每 tick +1,state.rng 推进
 *   - 每个 action 调对应子模块,收集 events
 *   - 失败 / 不合法的 action → 写 'unknown_action' 事件但不抛错
 *
 * 支持的 Action:
 *   - move { entityId, payload: { dx, dy } }
 *   - attack { entityId, payload: { targetId } }
 *   - pickup { entityId, payload: { itemId } }
 *   - use_item { entityId, payload: { itemId } } —— Day1 stub
 *
 * 边界:
 *   - dt 只用作步进元数据记录 (Day1 没有连续时间物理)
 */

import type { Action, GameEvent, GameState, MapLayout } from './types';
import { resolveCombat } from './combat';
import { pickup } from './items';
import { moveEntity } from './movement';
import { nextRand } from './rng';

export interface TickOptions {
  /** 地图布局 —— move 行为需要 bounds + 墙判定 */
  layout?: MapLayout;
}

export interface TickResult {
  state: GameState;
  events: GameEvent[];
}

export function tick(
  state: GameState,
  actions: Action[],
  dt: number,
  options: TickOptions = {},
): TickResult {
  const events: GameEvent[] = [];
  let working: GameState = {
    tick: state.tick + 1,
    rng: nextRand(state.rng),
    entities: { ...state.entities },
  };

  const layout = options.layout;
  const bounds = layout
    ? { width: layout.width, height: layout.height }
    : { width: 1 << 30, height: 1 << 30 };

  for (const action of actions) {
    switch (action.type) {
      case 'move': {
        const result = moveEntity(
          working,
          action.entityId,
          action.payload.dx,
          action.payload.dy,
          layout ? { bounds, layout } : { bounds },
        );
        working = result.newState;
        events.push(...result.events);
        break;
      }
      case 'attack': {
        const result = resolveCombat(
          working,
          action.entityId,
          action.payload.targetId,
          working.rng,
        );
        working = result.newState;
        events.push(...result.events);
        break;
      }
      case 'pickup': {
        const result = pickup(working, action.entityId, action.payload.itemId);
        working = result.newState;
        events.push(...result.events);
        break;
      }
      case 'use_item': {
        events.push({
          type: 'unknown_action',
          source: action.entityId,
          target: null,
          data: { reason: 'use_item not implemented in Day1', itemId: action.payload.itemId, dt },
          tick: working.tick,
        });
        break;
      }
      default: {
        const unknown = action as { type: string };
        events.push({
          type: 'unknown_action',
          source: null,
          target: null,
          data: { reason: `unknown action type: ${unknown.type}`, dt },
          tick: working.tick,
        });
      }
    }
  }

  // tick 结束元事件
  events.push({
    type: 'tick_end',
    source: null,
    target: null,
    data: { tick: working.tick, dt },
    tick: working.tick,
  });

  return { state: working, events };
}

/** 仅供测试用 —— 构造一个最小 GameState */
export function emptyState(rngSeed: number = 1): GameState {
  return {
    tick: 0,
    rng: rngSeed >>> 0,
    entities: {},
  };
}

/** 测试用 —— 把一个 entity 加进 state,返回新 state */
export function addEntity(
  state: GameState,
  e: GameState['entities'][keyof GameState['entities']],
): GameState {
  return { ...state, entities: { ...state.entities, ...{ [e.id]: e } } };
}
