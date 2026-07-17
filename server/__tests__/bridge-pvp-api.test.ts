/**
 * server/__tests__/bridge-pvp-api.test.ts
 * Day19: PvP HTTP 路由存在性 (源码) + PvPMatchService 与 bridge 同路径
 */
import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import { PvPMatchService } from '../pvp-match.js';
import { RoomPool } from '../room-pool.js';

describe('Day19: bridge PvP 端点声明', () => {
  const src = fs.readFileSync(path.resolve(__dirname, '../bridge.ts'), 'utf-8');
  it('注册 /pvp/queue /cancel /match', () => {
    expect(src).toMatch(/\/pvp\/queue/);
    expect(src).toMatch(/\/pvp\/cancel/);
    expect(src).toMatch(/\/pvp\/match/);
    expect(src).toMatch(/PvPMatchService/);
  });
});

describe('Day19: 匹配后可进 room', () => {
  it('双人 queue → match.roomId 在 pool', () => {
    const pool = new RoomPool();
    const svc = new PvPMatchService(pool);
    svc.enqueue('a', 1200);
    svc.enqueue('b', 1200);
    const m = svc.tryMatch();
    expect(m).not.toBeNull();
    expect(pool.list().some((r) => r.id === m!.roomId)).toBe(true);
  });
});
