/**
 * server/room-pool.ts
 *
 * Day13: 房间池 (跨服 / 大世界)
 *
 * 借鉴 WoC: 单一 shard (room-0) → 改成多房间
 *
 * 设计:
 *   - RoomPool: 创建 / 获取 / 列出 / 销毁
 *   - 自动按需创建 (玩家 join 无房间时)
 *   - 空闲超时清理 (1h 无人 → 销毁)
 *   - rooms 列表 API
 */
import { GameRoom } from './state.js';
import { log } from '../src/core/log.js';

export interface RoomInfo {
  id: string;
  level: number;
  playerCount: number;
  createdAt: number;
  lastActivity: number;
}

export class RoomPool {
  private rooms = new Map<string, GameRoom>();
  private createdAt = new Map<string, number>();
  private lastActivity = new Map<string, number>();
  private readonly idleTimeoutMs: number;

  constructor(idleTimeoutMs: number = 60 * 60 * 1000) {
    this.idleTimeoutMs = idleTimeoutMs;
  }

  /** 获取或创建房间 (按需) */
  getOrCreate(roomId: string, level: number = 1): GameRoom {
    let room = this.rooms.get(roomId);
    if (!room) {
      room = new GameRoom(roomId);
      room.reset(level);
      this.rooms.set(roomId, room);
      this.createdAt.set(roomId, Date.now());
      this.lastActivity.set(roomId, Date.now());
      log.info(`[room-pool] created room ${roomId} (level=${level})`);
    } else {
      this.lastActivity.set(roomId, Date.now());
    }
    return room;
  }

  /** 列所有房间 (含元信息) */
  list(): RoomInfo[] {
    const now = Date.now();
    const out: RoomInfo[] = [];
    for (const [id, room] of this.rooms) {
      out.push({
        id,
        level: 1,
        playerCount: room.occupiedSlots.size,
        createdAt: this.createdAt.get(id) ?? now,
        lastActivity: this.lastActivity.get(id) ?? now,
      });
    }
    return out.sort((a, b) => b.lastActivity - a.lastActivity);
  }

  /** 找有人房间 (按等级) */
  findByLevel(level: number): GameRoom | undefined {
    for (const room of this.rooms.values()) {
      if (room.occupiedSlots.size > 0 && room.occupiedSlots.size < 4) {
        return room;
      }
    }
    return undefined;
  }

  /** 找或创建空房间 (大厅模式) */
  getLobby(level: number = 1): GameRoom {
    const existing = this.findByLevel(level);
    if (existing) return existing;
    const id = `lobby-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
    return this.getOrCreate(id, level);
  }

  /** 清理空闲房间 (1h 无活动) */
  cleanupIdle(): number {
    const now = Date.now();
    let removed = 0;
    for (const [id, last] of this.lastActivity) {
      if (now - last > this.idleTimeoutMs) {
        const room = this.rooms.get(id);
        if (room && room.occupiedSlots.size === 0) {
          this.rooms.delete(id);
          this.createdAt.delete(id);
          this.lastActivity.delete(id);
          removed++;
          log.info(`[room-pool] cleaned idle room ${id}`);
        }
      }
    }
    return removed;
  }

  /** 销毁指定房间 */
  destroy(roomId: string): boolean {
    if (!this.rooms.has(roomId)) return false;
    this.rooms.delete(roomId);
    this.createdAt.delete(roomId);
    this.lastActivity.delete(roomId);
    log.info(`[room-pool] destroyed room ${roomId}`);
    return true;
  }

  /** 统计 */
  size(): number {
    return this.rooms.size;
  }
  getTotalPlayers(): number {
    let total = 0;
    for (const r of this.rooms.values()) total += r.occupiedSlots.size;
    return total;
  }
}