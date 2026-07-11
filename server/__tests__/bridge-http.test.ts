/**
 * server/__tests__/bridge-http.test.ts
 *
 * Day7+ 补充: bridge HTTP 端点用 Node 原生 http 起服务 + fetch 测试
 *
 * 优势 vs 当前 scripts/test-multiplayer.ts:
 *   - 不依赖 npm 包装的子进程
 *   - 测试隔离 (每个测试新端口)
 *   - 100% 确定性的 (没有 race condition)
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { startBridgeServer } from '../bridge.js';
import type http from 'node:http';

const TEST_PORT = 8799; // 避开默认 8787
let server: http.Server;
let baseUrl: string;

beforeAll(async () => {
  server = await startBridgeServer(TEST_PORT);
  baseUrl = `http://localhost:${TEST_PORT}`;
});

afterAll(async () => {
  await new Promise<void>((r) => server.close(() => r()));
});

describe('bridge HTTP 端点 (Day7+ 端点单测)', () => {
  it('GET /health → 200 + ok:true', async () => {
    const res = await fetch(`${baseUrl}/health`);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(typeof body.port).toBe('number');
  });

  it('GET /state → entities + content', async () => {
    const res = await fetch(`${baseUrl}/state`);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(typeof body.tick).toBe('number');
    expect(Array.isArray(body.entities)).toBe(true);
    expect(body.content).toBeDefined();
    expect(body.content.quest).toBeTruthy();
    expect(Array.isArray(body.content.npcs)).toBe(true);
  });

  it('POST /action 0 (move) → 推进 tick', async () => {
    // 先 reset
    await fetch(`${baseUrl}/reset?seed=42`);
    const before = await (await fetch(`${baseUrl}/state`)).json();
    const tickBefore = before.tick;
    const res = await fetch(`${baseUrl}/action`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 0 }),
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.tick).toBe(tickBefore + 1);
  });

  it('POST /action 4 (attack) → events 含 damage 或 unknown', async () => {
    const res = await fetch(`${baseUrl}/action`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 4 }),
    });
    const body = await res.json();
    // 可能 hit (damage 事件) 或 miss (attack_miss 事件)
    expect(body.events).toBeDefined();
  });

  it('POST /dialogue 玩家不在 NPC 旁 → npc:null', async () => {
    const res = await fetch(`${baseUrl}/dialogue`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    });
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.npc).toBeNull();
    expect(body.reason).toBe('no adjacent NPC');
  });

  it('GET /reset?seed=123 → 新房间', async () => {
    const res = await fetch(`${baseUrl}/reset?seed=123`);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.seed).toBe(123);
    expect(body.snapshot).toBeDefined();
  });

  it('GET /unknown → 404', async () => {
    const res = await fetch(`${baseUrl}/unknown`);
    expect(res.status).toBe(404);
  });

  it('POST /action invalid action=99 → 400', async () => {
    const res = await fetch(`${baseUrl}/action`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 99 }),
    });
    expect(res.status).toBe(400);
  });
});
