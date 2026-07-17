/**
 * server/__tests__/room-join.test.ts
 * Day16: roomId 校验 + 多房间隔离
 */
import { describe, it, expect } from 'vitest';
import { RoomPool, sanitizeRoomId } from '../room-pool.js';

describe('sanitizeRoomId', () => {
  it('合法 id 原样返回', () => {
    expect(sanitizeRoomId('room-0')).toBe('room-0');
    expect(sanitizeRoomId('pvp_arena_1')).toBe('pvp_arena_1');
  });
  it('非法 / 空 / 过长 → room-0', () => {
    expect(sanitizeRoomId(null)).toBe('room-0');
    expect(sanitizeRoomId('')).toBe('room-0');
    expect(sanitizeRoomId('../etc')).toBe('room-0');
    expect(sanitizeRoomId('a'.repeat(100))).toBe('room-0');
    expect(sanitizeRoomId('room id')).toBe('room-0');
  });
});

describe('Day16: 多房间玩家隔离', () => {
  it('不同 roomId → 独立 GameRoom 实例', () => {
    const pool = new RoomPool();
    const a = pool.getOrCreate('lobby-a', 1);
    const b = pool.getOrCreate('lobby-b', 1);
    expect(a).not.toBe(b);
    expect(a.id).toBe('lobby-a');
    expect(b.id).toBe('lobby-b');
  });

  it('同 room 两次 getOrCreate 同一实例', () => {
    const pool = new RoomPool();
    const a1 = pool.getOrCreate('shared', 1);
    const a2 = pool.getOrCreate('shared', 1);
    expect(a1).toBe(a2);
  });

  it('玩家加入不同房间互不影响 occupiedSlots', () => {
    const pool = new RoomPool();
    const a = pool.getOrCreate('r1', 1);
    const b = pool.getOrCreate('r2', 1);
    const sizeBBefore = b.occupiedSlots.size;
    a.addPlayer(2); // slot 1 可能已被 reset 占用
    expect(a.occupiedSlots.size).toBeGreaterThanOrEqual(1);
    // b 人数不变
    expect(b.occupiedSlots.size).toBe(sizeBBefore);
  });
});
