/**
 * server/__tests__/pvp-match.test.ts
 * Day17: PvP 匹配 → 房间
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { PvPMatchService } from '../pvp-match.js';
import { RoomPool } from '../room-pool.js';

describe('PvPMatchService', () => {
  let pool: RoomPool;
  let svc: PvPMatchService;

  beforeEach(() => {
    pool = new RoomPool();
    svc = new PvPMatchService(pool);
  });

  it('1 人入队 → tryMatch null', () => {
    svc.enqueue('p1', 1200);
    expect(svc.tryMatch()).toBeNull();
    expect(svc.queueSize()).toBe(1);
  });

  it('2 人入队 → 匹配并创建 pvp- 房间', () => {
    svc.enqueue('p1', 1200);
    svc.enqueue('p2', 1300);
    const m = svc.tryMatch();
    expect(m).not.toBeNull();
    expect(m!.playerA).toBe('p1');
    expect(m!.playerB).toBe('p2');
    expect(m!.roomId).toMatch(/^pvp-/);
    expect(pool.size()).toBeGreaterThanOrEqual(1);
    // 房间可 getOrCreate
    const room = pool.getOrCreate(m!.roomId, 1);
    expect(room.id).toBe(m!.roomId);
  });

  it('匹配后队列清空', () => {
    svc.enqueue('a', 1000);
    svc.enqueue('b', 1000);
    svc.tryMatch();
    expect(svc.queueSize()).toBe(0);
  });

  it('cancel 退出队列', () => {
    svc.enqueue('p1', 1200);
    svc.enqueue('p2', 1200);
    svc.cancel('p1');
    expect(svc.tryMatch()).toBeNull();
    expect(svc.queueSize()).toBe(1);
  });

  it('settleElo: 平局 delta 0', () => {
    const r = svc.settleElo(1200, 1200, null);
    expect(r.deltaA).toBe(0);
  });

  it('settleElo: A 赢 +16', () => {
    const r = svc.settleElo(1200, 1200, true);
    expect(r.deltaA).toBe(16);
    expect(r.newA).toBe(1216);
  });

  it('连续两场匹配 roomId 不同', () => {
    svc.enqueue('a', 1200);
    svc.enqueue('b', 1200);
    const m1 = svc.tryMatch()!;
    svc.enqueue('c', 1200);
    svc.enqueue('d', 1200);
    const m2 = svc.tryMatch()!;
    expect(m1.roomId).not.toBe(m2.roomId);
  });
});
