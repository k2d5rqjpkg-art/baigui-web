/**
 * server/pvp-match.ts
 *
 * Day17: PvP 匹配 → 创建独立房间
 *
 * 流程:
 *   enqueue(playerId, rating) → tryMatch → create pvp-{id} room
 *   返回双方应 join 的 roomId
 */
import { MatchmakingQueue, updateElo } from './pvp.js';
import { RoomPool } from './room-pool.js';
import { log } from '../src/core/log.js';
import type { EntityId } from '../src/core/sim/types.js';

export interface MatchFound {
  roomId: string;
  playerA: string;
  playerB: string;
  ratingA: number;
  ratingB: number;
}

export class PvPMatchService {
  private queue = new MatchmakingQueue();
  private pool: RoomPool;
  private matchSeq = 0;

  constructor(pool: RoomPool) {
    this.pool = pool;
  }

  /** 加入匹配队列 */
  enqueue(playerId: string, rating: number = 1200): void {
    this.queue.enqueue(playerId as EntityId, rating);
  }

  /** 取消匹配 */
  cancel(playerId: string): void {
    this.queue.dequeue(playerId as EntityId);
  }

  /** 尝试匹配; 成功则建房并返回 MatchFound */
  tryMatch(): MatchFound | null {
    const m = this.queue.tryMatch();
    if (!m) return null;
    this.matchSeq++;
    const roomId = `pvp-${this.matchSeq}-${Date.now().toString(36)}`;
    // 创建独立 PvP 房间 (level 种子)
    this.pool.getOrCreate(roomId, 1);
    log.info(`[pvp-match] ${m.playerA} vs ${m.playerB} → ${roomId}`);
    return {
      roomId,
      playerA: m.playerA,
      playerB: m.playerB,
      ratingA: m.ratingA,
      ratingB: m.ratingB,
    };
  }

  /** 队列长度 */
  queueSize(): number {
    return this.queue.size();
  }

  /** Elo 结算 helper (供 PvPRoom.finish 后调用) */
  settleElo(ratingA: number, ratingB: number, winnerA: boolean | null): {
    newA: number;
    newB: number;
    deltaA: number;
  } {
    if (winnerA === null) {
      return { newA: ratingA, newB: ratingB, deltaA: 0 };
    }
    return updateElo(ratingA, ratingB, winnerA);
  }
}
