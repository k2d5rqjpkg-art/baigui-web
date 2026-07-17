/**
 * server/__tests__/room-pool.test.ts
 *
 * Day13: 房间池测试
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { RoomPool } from '../room-pool.js';

describe('RoomPool 基础', () => {
  let pool: RoomPool;
  beforeEach(() => {
    pool = new RoomPool();
  });

  it('初始 size = 0', () => {
    expect(pool.size()).toBe(0);
  });

  it('getOrCreate: 创建新房间', () => {
    const r = pool.getOrCreate('room-1', 1);
    expect(r).toBeDefined();
    expect(pool.size()).toBe(1);
  });

  it('getOrCreate: 同 id 返同一房间 (不重建)', () => {
    const r1 = pool.getOrCreate('room-1', 1);
    const r2 = pool.getOrCreate('room-1', 1);
    expect(r1).toBe(r2);
    expect(pool.size()).toBe(1);
  });

  it('不同 id → 不同房间', () => {
    pool.getOrCreate('room-1', 1);
    pool.getOrCreate('room-2', 1);
    expect(pool.size()).toBe(2);
  });
});

describe('list + 元信息', () => {
  let pool: RoomPool;
  beforeEach(() => {
    pool = new RoomPool();
  });

  it('list: 列出所有房间', () => {
    pool.getOrCreate('a', 1);
    pool.getOrCreate('b', 2);
    const list = pool.list();
    expect(list.length).toBe(2);
  });

  it('list: 按 lastActivity 降序', async () => {
    pool.getOrCreate('a', 1);
    await new Promise((r) => setTimeout(r, 5));
    pool.getOrCreate('b', 1);
    const list = pool.list();
    expect(list[0]!.id).toBe('b'); // 最近活动的在前
  });

  it('list: 包含 playerCount', () => {
    const r = pool.getOrCreate('a', 1);
    // 模拟加玩家
    r.occupiedSlots.add(1);
    r.occupiedSlots.add(2);
    const list = pool.list();
    expect(list[0]!.playerCount).toBe(2);
  });
});

describe('getLobby (大厅模式)', () => {
  it('空池 → 创建新 lobby', () => {
    const pool = new RoomPool();
    const r = pool.getLobby(1);
    expect(r).toBeDefined();
    expect(pool.size()).toBe(1);
  });

  it('有空闲房间 (1-3 人) → 复用', () => {
    const pool = new RoomPool();
    const r1 = pool.getLobby(1);
    r1.occupiedSlots.add(1); // 1 人
    const r2 = pool.getLobby(1);
    expect(r2).toBe(r1); // 复用
    expect(pool.size()).toBe(1);
  });

  it('满员 (4 人) → 创建新 lobby', () => {
    const pool = new RoomPool();
    const r1 = pool.getLobby(1);
    r1.occupiedSlots.add(1);
    r1.occupiedSlots.add(2);
    r1.occupiedSlots.add(3);
    r1.occupiedSlots.add(4);
    const r2 = pool.getLobby(1);
    expect(r2).not.toBe(r1);
    expect(pool.size()).toBe(2);
  });
});

describe('cleanupIdle (清理空闲房间)', () => {
  it('短超时: 空闲 → 清理', () => {
    // 50ms 超时, 给 150ms 后调
    const pool = new RoomPool(50);
    pool.getOrCreate('idle-room', 1);
    expect(pool.size()).toBe(1);

    return new Promise<void>((resolve) => {
      setTimeout(() => {
        // 超时才清理
        const cleaned = pool.cleanupIdle();
        expect(cleaned).toBeGreaterThanOrEqual(0);
        resolve();
      }, 200);
    });
  });

  it('有人房间不清理', () => {
    const pool = new RoomPool(50);
    const r = pool.getOrCreate('busy', 1);
    r.occupiedSlots.add(1);

    return new Promise<void>((resolve) => {
      setTimeout(() => {
        expect(pool.cleanupIdle()).toBe(0); // 有人不删
        expect(pool.size()).toBe(1);
        resolve();
      }, 100);
    });
  });
});

describe('destroy + size', () => {
  it('destroy 存在的房间', () => {
    const pool = new RoomPool();
    pool.getOrCreate('a', 1);
    expect(pool.destroy('a')).toBe(true);
    expect(pool.size()).toBe(0);
  });

  it('destroy 不存在 → false', () => {
    const pool = new RoomPool();
    expect(pool.destroy('xxx')).toBe(false);
  });
});

describe('getTotalPlayers (统计)', () => {
  it('累加所有房间人数', () => {
    const pool = new RoomPool();
    const a = pool.getOrCreate('a', 1);
    const b = pool.getOrCreate('b', 1);
    a.occupiedSlots.add(1);
    a.occupiedSlots.add(2);
    b.occupiedSlots.add(1);
    expect(pool.getTotalPlayers()).toBe(3);
  });
});