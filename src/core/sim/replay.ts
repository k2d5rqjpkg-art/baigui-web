/**
 * src/core/sim/replay.ts
 *
 * Day42: 录制 / 回放 (deterministic replay)
 *
 * 思路:
 *   record: 每步存 {tick, rng, action, events count} 等
 *   replay: 用同样 seed, 同样 action 序列, 验 final state 等价
 *
 * 借 WoC "时间机器" 思想: 同一 seed 下确定性 replay 应该 bit-identical
 */
import type { Action, GameState, EntityId } from './types';
import { emptyState, addEntity, worldGen, generateEncounter, tick } from './index';

export interface ReplayFrame {
  tick: number;
  rng: number;
  actions: Action[];
  eventsCount: number;
  playersHp: Record<string, number>;
}

export class Recorder {
  private frames: ReplayFrame[] = [];
  private seed: number;

  constructor(seed: number) {
    this.seed = seed;
  }

  record(state: GameState, actions: Action[], eventsCount: number): void {
    const playersHp: Record<string, number> = {};
    for (const [id, e] of Object.entries(state.entities)) {
      if (e.kind === 'player') playersHp[id] = e.hp;
    }
    this.frames.push({
      tick: state.tick,
      rng: state.rng,
      actions: [...actions],
      eventsCount,
      playersHp,
    });
  }

  getFrames(): ReplayFrame[] {
    return this.frames;
  }

  getSeed(): number {
    return this.seed;
  }
}

export interface ReplayResult {
  ok: boolean;
  /** 哪一步开始差异 (-1 表示完全一致) */
  diffAt: number;
  /** 真实状态 (最后) */
  finalState: GameState;
}

/**
 * 重放: 用同样 seed + 同样 action 序列, 检查最终 state 等价
 */
export function replay(seed: number, frames: ReplayFrame[]): ReplayResult {
  // 注: 简化 — 假设 caller 已经传了真实录制时的初始 state 作为 frame[0].state
  // 这里只验证 tick + rng 等价, 不重建 entities
  let state = emptyState(seed);
  state = { ...state, rng: seed };

  let diffAt = -1;
  for (const f of frames) {
    // 期望 frame.actions → 推一步
    const layout = worldGen(seed, 1);
    const r = tick(state, f.actions, 50, { layout });
    state = r.state;
    if (state.tick !== f.tick + 1) {
      // frame.tick 是动作前的
      diffAt = f.tick;
      break;
    }
    if (state.rng !== f.rng) {
      diffAt = f.tick;
      break;
    }
  }

  return { ok: diffAt === -1, diffAt, finalState: state };
}
