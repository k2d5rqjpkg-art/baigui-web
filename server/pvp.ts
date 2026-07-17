/**
 * server/pvp.ts
 *
 * Day7: PvP 竞技场系统 (借鉴 WoC PvP Arena + Elo 排行)
 *
 * 设计:
 *   - PvPRoom: 2 玩家 sim 同步 (server-side authoritative)
 *   - EloRating: 标准 Elo 算法 (K-factor 32)
 *   - MatchmakingQueue: FIFO 匹配
 *   - 借鉴 WoC PvP 失败教训: server 不直接用 'run_state', 应该用稳定 sim API
 */

import { tick, emptyState, addEntity } from '../src/core/sim/tick.js';
import type { Action, EntityId, GameState } from '../src/core/sim/types.js';
import { log } from '../src/core/log.js';

/** Elo rating (标准算法, K-factor=32) */
export interface EloRating {
  playerId: string;
  rating: number; // 初始 1200
  wins: number;
  losses: number;
}

/** 期望胜率 (Elo 公式) */
export function expectedScore(ratingA: number, ratingB: number): number {
  return 1 / (1 + Math.pow(10, (ratingB - ratingA) / 400));
}

/** 更新 Elo (winnerA=true 表示 A 赢, false 表示 B 赢) */
export function updateElo(
  ratingA: number,
  ratingB: number,
  winnerA: boolean,
  kFactor: number = 32,
): { newA: number; newB: number; deltaA: number } {
  const expA = expectedScore(ratingA, ratingB);
  const scoreA = winnerA ? 1 : 0;
  const deltaA = Math.round(kFactor * (scoreA - expA));
  return {
    newA: ratingA + deltaA,
    newB: ratingB - deltaA,
    deltaA,
  };
}

/** PvP 房间: 2 玩家 1v1 */
export class PvPRoom {
  readonly id: string;
  readonly playerA: EntityId;
  readonly playerB: EntityId;
  /** 共享 map layout (复用 worldGen) */
  readonly state: GameState;
  /** 当前 tick (每方按 20Hz 推, server 仲裁) */
  tickNum = 0;
  /** 双方 Elo 起始 */
  ratingA: number;
  ratingB: number;
  /** 获胜者 (null 表示未结束) */
  winner: 'A' | 'B' | null = null;
  /** tick event 累积 (双方共用) */
  events: any[] = [];

  constructor(id: string, playerA: EntityId, playerB: EntityId, ratingA: number, ratingB: number) {
    this.id = id;
    this.playerA = playerA;
    this.playerB = playerB;
    this.ratingA = ratingA;
    this.ratingB = ratingB;

    // 1v1 共享 sim state
    // 注: PvP 双方用不同 faction (playerA vs playerB), 否则 sim 同派系不互殴
    let s = emptyState(42);
    s = addEntity(s, {
      id: playerA,
      kind: 'player',
      pos: { x: 5, y: 5 },
      hp: 100,
      maxHp: 100,
      atk: 30,
      def: 5,
      level: 5,
      faction: 'team_A',
      inventory: [],
      equipment: {},
      buffs: [],
    });
    s = addEntity(s, {
      id: playerB,
      kind: 'player',
      pos: { x: 15, y: 5 },
      hp: 100,
      maxHp: 100,
      atk: 30,
      def: 5,
      level: 5,
      faction: 'team_B',
      inventory: [],
      equipment: {},
      buffs: [],
    });
    this.state = s;
  }

  /**
   * 推进 1 tick (双方各提交 1 action)
   * 返回事件列表
   */
  step(actions: { A: Action | null; B: Action | null }): {
    state: GameState;
    events: any[];
    winner: 'A' | 'B' | null;
  } {
    const allActions = [actions.A, actions.B].filter((a): a is Action => a !== null);
    const result = tick(this.state, allActions, 50);
    this.state = result.state;
    this.tickNum++;
    this.events.push(...result.events);

    // 检测死亡
    const a = this.state.entities[this.playerA];
    const b = this.state.entities[this.playerB];
    if (a && b) {
      if (a.hp <= 0 && b.hp <= 0) {
        this.winner = null; // 双败 → 平局
      } else if (a.hp <= 0) {
        this.winner = 'B';
      } else if (b.hp <= 0) {
        this.winner = 'A';
      }
    }

    return { state: this.state, events: result.events, winner: this.winner };
  }

  /** 比赛结束 → 结算 Elo */
  finish(): { newRatingA: number; newRatingB: number; deltaA: number } {
    if (this.winner === null) {
      // 平局
      return { newRatingA: this.ratingA, newRatingB: this.ratingB, deltaA: 0 };
    }
    const winnerA = this.winner === 'A';
    return updateElo(this.ratingA, this.ratingB, winnerA);
  }
}

/** 匹配队列 (FIFO) */
export class MatchmakingQueue {
  private queue: Array<{ playerId: EntityId; rating: number; joinedAt: number }> = [];

  /** 加入队列 */
  enqueue(playerId: EntityId, rating: number): void {
    if (this.queue.some((e) => e.playerId === playerId)) {
      log.warn(`[pvp/queue] ${playerId} already in queue`);
      return;
    }
    this.queue.push({ playerId, rating, joinedAt: Date.now() });
    log.info(`[pvp/queue] ${playerId} joined (rating=${rating})`);
  }

  /** 尝试匹配 (返回匹配对, 或 null) */
  tryMatch(): { playerA: EntityId; playerB: EntityId; ratingA: number; ratingB: number } | null {
    if (this.queue.length < 2) return null;
    // FIFO: 取最早两个
    const a = this.queue.shift()!;
    const b = this.queue.shift()!;
    log.info(`[pvp/queue] matched ${a.playerId} vs ${b.playerId}`);
    return {
      playerA: a.playerId,
      playerB: b.playerId,
      ratingA: a.rating,
      ratingB: b.rating,
    };
  }

  /** 队列长度 */
  size(): number {
    return this.queue.length;
  }

  /** 取消 (玩家断线) */
  dequeue(playerId: EntityId): void {
    this.queue = this.queue.filter((e) => e.playerId !== playerId);
  }
}
