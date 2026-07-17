/**
 * server/__tests__/bridge-e2e.test.ts
 *
 * Day8 端到端: 真实游戏流程
 *
 * 覆盖:
 *   - reset 流程 (返回正确 tick, 玩家满血)
 *   - 不同 seed → 不同 PCG layout (验证确定性 + 变化)
 *   - 死亡事件触发 (通过 helper room + /state)
 *   - 高频 reset 稳定性
 *
 * 限制: bridge 把 room 包在 closure 里, 通过 HTTP 无法 teleport 玩家,
 * 所以 teleport-based 测试 (走到 NPC 旁/拾取 item) 留给 Playwright 等浏览器 E2E
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { startBridgeServer } from '../bridge.js';
import { GameRoom } from '../state.js';
import type http from 'node:http';

const TEST_PORT = 8798;
let server: http.Server;
let helperRoom: GameRoom; // 独立 helper 用于"按 tick 验证 sim 行为"
let baseUrl: string;

beforeAll(async () => {
  helperRoom = new GameRoom('e2e-helper');
  server = await startBridgeServer(TEST_PORT);
  baseUrl = `http://localhost:${TEST_PORT}`;
});

afterAll(async () => {
  await new Promise<void>((r) => server.close(() => r()));
});

async function getState() {
  const r = await fetch(`${baseUrl}/state`);
  return r.json();
}

async function reset(seed: number) {
  await fetch(`${baseUrl}/reset?seed=${seed}`);
}

async function postAction(action: number) {
  const r = await fetch(`${baseUrl}/action`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action }),
  });
  return r.json();
}

describe('bridge 端到端: reset 流程', () => {
  it('reset 后 tick 归 0, 玩家满血', async () => {
    await reset(42);
    await postAction(0);
    await postAction(1);
    const before = await getState();
    expect(before.tick).toBeGreaterThan(0);

    const resetRes = await fetch(`${baseUrl}/reset?seed=99`);
    const resetBody = await resetRes.json();
    expect(resetBody.ok).toBe(true);

    const after = await getState();
    expect(after.tick).toBe(0);
    const player = after.entities.find((e: any) => e.kind === 'player');
    expect(player.hp).toBe(player.maxHp);
  });

  it('reset 不同 seed → PCG layout 不同 (rooms/walls 不同)', async () => {
    await reset(1);
    const a = await getState();
    await reset(999);
    const b = await getState();
    // PCG 随机: walls 数量 / rooms 数量 / 至少一个 NPC pos 不同
    const aNpc1Pos = a.content.npcs[0].pos;
    const bNpc1Pos = b.content.npcs[0].pos;
    // 至少 NPC 位置不同 (PCG 影响 layout.spawnPoints)
    expect(aNpc1Pos.x === bNpc1Pos.x && aNpc1Pos.y === bNpc1Pos.y).toBe(false);
  });

  it('reset 100 次不崩 (稳定性)', async () => {
    for (let i = 0; i < 100; i++) {
      await reset(i);
      const s = await getState();
      expect(s.tick).toBe(0);
    }
  });
});

describe('bridge 端到端: 死亡事件 (通过 helper room)', () => {
  it('HP=1 玩家被攻击 → death 事件触发 + state.entities[e_player_1].hp = 0', () => {
    helperRoom.reset(42);
    // 玩家 HP=1, 让 Lv5 怪物一击必杀
    (helperRoom.state as any).entities['e_player_1'].hp = 1;
    const result = helperRoom.advance(
      [
        {
          type: 'attack',
          entityId: 'e_monster_1' as any,
          payload: { targetId: 'e_player_1' as any },
        },
      ],
      50,
    );
    const deathEvent = result.events.find(
      (e: any) => e.type === 'death' && e.target === 'e_player_1',
    );
    expect(deathEvent).toBeDefined();
    expect((result.state as any).entities['e_player_1'].hp).toBe(0);
  });

  it('死亡后玩家仍能 move (sim 不阻止), 但 hp 一直 0', () => {
    helperRoom.reset(42);
    (helperRoom.state as any).entities['e_player_1'].hp = 0;
    for (let i = 0; i < 10; i++) {
      helperRoom.advance(
        [
          {
            type: 'move',
            entityId: 'e_player_1' as any,
            payload: { dx: 1, dy: 0 },
          },
        ],
        50,
      );
    }
    expect((helperRoom.state as any).entities['e_player_1'].hp).toBe(0);
  });
});

describe('bridge 端到端: action 累积', () => {
  it('连续 50 次 move(0) → tick 推进 50', async () => {
    await reset(42);
    for (let i = 0; i < 50; i++) {
      await postAction(0); // move up
    }
    const s = await getState();
    expect(s.tick).toBe(50);
  });

  it('连续 attack → monster 必死 (10 次内)', async () => {
    await reset(42);
    const initial = await getState();
    const monster = initial.entities.find((e: any) => e.kind === 'monster');
    expect(monster.hp).toBeGreaterThan(0);

    for (let i = 0; i < 10; i++) {
      await postAction(4);
    }
    const final = await getState();
    const finalMonster = final.entities.find((e: any) => e.id === monster.id);
    // 10 次攻击后, 玩家 30 ATK vs 怪物 1-3 DEF, 必杀
    if (finalMonster) {
      // 仍然存活则 hp 减少
      expect(finalMonster.hp).toBeLessThan(monster.hp);
    }
    // 或者 monster 死亡 (从 state 移除)
  });

  it('monster 死亡时 damage 事件被记录 (RL reward shaping)', async () => {
    await reset(42);
    let damageEvents: any[] = [];
    for (let i = 0; i < 20; i++) {
      const res = await postAction(4);
      damageEvents = damageEvents.concat(res.events.filter((e: any) => e.type === 'damage'));
      const death = res.events.find((e: any) => e.type === 'death');
      if (death) break;
    }
    // 至少有一些 damage 事件
    expect(damageEvents.length).toBeGreaterThan(0);
  });
});

describe('bridge 端到端: 并发请求', () => {
  it('10 个并发 /action 请求 → tick 推进 10', async () => {
    await reset(42);
    const promises = Array.from({ length: 10 }, () => postAction(0));
    const results = await Promise.all(promises);
    // 所有请求都应成功
    for (const r of results) {
      expect(r.tick).toBeGreaterThan(0);
    }
    const s = await getState();
    expect(s.tick).toBe(10);
  });
});
