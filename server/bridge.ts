/**
 * server/bridge.ts - HTTP 桥接 (供 Python RL 用)
 *
 * Day1.5 适配:
 *   - Discrete action (0..5) → 真实 Action (move/attack/pickup)
 *   - action 4 (attack) 自动找最近 enemy 作为 targetId
 *   - action 5 (pickup) 自动找最近 item 作为 itemId
 *   - reward shaping 用真实 GameEvent 字段:
 *       damage  source===self → +10
 *       damage  target===self → -5
 *       death   source===self → +50  (击杀事件 source 是击杀者)
 *       pickup  source===self → +5
 *       每帧 -0.1 (存活代价)
 *
 * 三个端点 (Node 原生 http,无 express):
 *   GET  /state    → 返回当前 room 快照 JSON
 *   POST /action   → 接收 {action: 0..5, entityId?},推进一帧并返回 obs + events + reward
 *   GET  /reset?seed=xx → 重置房间
 *   GET  /health   → 健康检查
 *
 * 启动: tsx server/bridge.ts (默认 8787,可 PORT env 覆盖)
 */

import http from 'node:http';
import { GameRoom } from './state.js';
import { ROOM_PLAYER_ID } from './state.js';
import type { Action, Intent, EntityId, GameEvent, SimEntity } from '../src/core/sim/types.js';
import { log } from '../src/core/log.js';

const PORT = parseInt(process.env.PORT ?? process.env.SERVER_PORT ?? '8787', 10);
const TICK_DT_MS = 50; // 20Hz

// 全局单房间 (Day1.5 足够;Day2 改成房间池)
const room = new GameRoom('room-0');

function readJson(req: http.IncomingMessage): Promise<any> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on('data', (c) => chunks.push(c));
    req.on('end', () => {
      const raw = Buffer.concat(chunks).toString('utf8');
      if (!raw) return resolve({});
      try { resolve(JSON.parse(raw)); }
      catch (err) { reject(err); }
    });
    req.on('error', reject);
  });
}

function send(res: http.ServerResponse, status: number, body: unknown, contentType = 'application/json') {
  res.writeHead(status, {
    'Content-Type': contentType,
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  });
  if (typeof body === 'string') res.end(body);
  else res.end(JSON.stringify(body));
}

/** 找 player 视野内最近的 monster (曼哈顿距离) */
function findNearestEnemy(player: SimEntity, entities: Record<EntityId, SimEntity>): EntityId | null {
  let bestId: EntityId | null = null;
  let bestDist = Infinity;
  for (const [id, e] of Object.entries(entities) as [EntityId, SimEntity][]) {
    if (e.kind !== 'monster') continue;
    if (e.hp <= 0) continue;
    const dx = e.pos.x - player.pos.x;
    const dy = e.pos.y - player.pos.y;
    const d = Math.abs(dx) + Math.abs(dy);
    if (d < bestDist) {
      bestDist = d;
      bestId = id;
    }
  }
  return bestId;
}

/** 找 player 视野内最近的 item (曼哈顿距离) */
function findNearestItem(player: SimEntity, entities: Record<EntityId, SimEntity>): EntityId | null {
  let bestId: EntityId | null = null;
  let bestDist = Infinity;
  for (const [id, e] of Object.entries(entities) as [EntityId, SimEntity][]) {
    if (e.kind !== 'item') continue;
    const dx = e.pos.x - player.pos.x;
    const dy = e.pos.y - player.pos.y;
    const d = Math.abs(dx) + Math.abs(dy);
    if (d < bestDist) {
      bestDist = d;
      bestId = id;
    }
  }
  return bestId;
}

/**
 * Discrete action (0..5) → 真实 Action (move/attack/pickup)
 *
 *   0/1/2/3 (上/下/左/右) → move
 *   4 → attack 最近 enemy
 *   5 → pickup 最近 item
 */
function discreteToAction(
  discrete: number,
  selfId: EntityId,
  entities: Record<EntityId, SimEntity>,
): Action | null {
  const self = entities[selfId];
  if (!self) return null;

  switch (discrete) {
    case 0: // 上
      return { type: 'move', entityId: selfId, payload: { dx: 0, dy: -1 } };
    case 1: // 下
      return { type: 'move', entityId: selfId, payload: { dx: 0, dy: 1 } };
    case 2: // 左
      return { type: 'move', entityId: selfId, payload: { dx: -1, dy: 0 } };
    case 3: // 右
      return { type: 'move', entityId: selfId, payload: { dx: 1, dy: 0 } };
    case 4: {
      // attack 最近敌人
      const targetId = findNearestEnemy(self, entities);
      if (!targetId) return null;
      return { type: 'attack', entityId: selfId, payload: { targetId } };
    }
    case 5: {
      // pickup 最近物品
      const itemId = findNearestItem(self, entities);
      if (!itemId) return null;
      return { type: 'pickup', entityId: selfId, payload: { itemId } };
    }
    default:
      return null;
  }
}

/**
 * 用 GameEvent 算 RL reward (与 Python 端 rl/env.py compute_reward 一致)
 *
 * 字段契约 (Day1.5 sim):
 *   - GameEvent.source / target: EntityId | null (不是 undefined!)
 *   - GameEvent.data: Record<string, string|number|boolean>
 *   - 'damage' 事件 source=攻击者 target=被攻击者
 *   - 'death' 事件 source=击杀者 target=死者
 *   - 'pickup' 事件 source=拾取者
 */
export function computeRewardFromEvents(events: GameEvent[], selfId: EntityId): number {
  let r = 0;
  for (const e of events) {
    if (e.type === 'damage') {
      if (e.source === selfId) r += 10;
      if (e.target === selfId) r -= 5;
    } else if (e.type === 'death') {
      // source = 击杀者,target = 死者
      if (e.source === selfId) r += 50;
    } else if (e.type === 'pickup') {
      if (e.source === selfId) r += 5;
    }
  }
  // 每帧存活奖励 -0.1 (鼓励快结束)
  r -= 0.1;
  return r;
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url ?? '/', `http://localhost:${PORT}`);
  // CORS preflight
  if (req.method === 'OPTIONS') return send(res, 204, '');

  try {
    if (req.method === 'GET' && url.pathname === '/state') {
      const snap = room.getSnapshot();
      return send(res, 200, {
        tick: snap.tick,
        entities: snap.entities,
        content: room.content,  // Day6.1: quest + npcs
      });
    }

    if (req.method === 'POST' && url.pathname === '/action') {
      let body: any = {};
      try { body = await readJson(req); } catch { body = {}; }

      const actionNum: number = Number(body.action ?? -1);
      if (!Number.isInteger(actionNum) || actionNum < 0 || actionNum > 5) {
        return send(res, 400, { error: 'action must be integer in [0..5]', got: body.action });
      }
      // entityId 默认 ROOM_PLAYER_ID ('e_player_1')
      const entityId: EntityId = ((): EntityId => {
        const raw = body.entityId;
        if (typeof raw === 'string' && raw.startsWith('e_')) return raw as EntityId;
        return ROOM_PLAYER_ID;
      })();

      // 转 discrete → real Action
      const realAction = discreteToAction(actionNum, entityId, room.state.entities);
      if (!realAction) {
        // 找不到目标 (attack 没敌人 / pickup 没物品) → 不推进,只返回当前快照 + 0 reward
        const snap = room.getSnapshot();
        return send(res, 200, {
          tick: snap.tick,
          entities: snap.entities,
          events: [],
          reward: -0.1,
          action: actionNum,
          note: 'no target available (attack/pickup with no entity in range)',
        });
      }

      const result = room.advance([realAction], TICK_DT_MS);
      return send(res, 200, {
        tick: result.tick,
        entities: Object.values(result.state.entities),
        events: result.events,
        reward: computeRewardFromEvents(result.events, entityId),
        action: actionNum,
      });
    }

    if (req.method === 'POST' && url.pathname === '/dialogue') {
      // Day6.1: 玩家与邻接 NPC 对话
      const body = await readJson(req).catch(() => ({}));
      const entityId = (typeof body.entityId === 'string' && body.entityId.startsWith('e_'))
        ? (body.entityId as EntityId)
        : ROOM_PLAYER_ID;
      const ctx = typeof body.context === 'string' ? body.context : '';
      try {
        const result = await room.talkToNearestNpc(entityId, ctx);
        if (!result) {
          return send(res, 200, { ok: true, npc: null, dialogue: null, reason: 'no adjacent NPC' });
        }
        return send(res, 200, {
          ok: true,
          npc: { id: result.npc.id, name: result.npc.name, pos: result.npc.pos },
          dialogue: result.dialogue,
        });
      } catch (err) {
        return send(res, 500, { error: `dialogue failed: ${(err as Error).message}` });
      }
    }

    if (req.method === 'GET' && url.pathname === '/reset') {
      const seedRaw = url.searchParams.get('seed');
      const seed = seedRaw !== null ? (Number(seedRaw) >>> 0) : (Date.now() % 1_000_000);
      room.reset(seed);
      return send(res, 200, { ok: true, seed, snapshot: room.getSnapshot() });
    }

    if (req.method === 'GET' && url.pathname === '/health') {
      return send(res, 200, {
        ok: true,
        port: PORT,
        tick: room.tick,
        entityCount: room.entityCount,
        players: room.occupiedSlots.size,
      });
    }

    send(res, 404, { error: 'not found', path: url.pathname });
  } catch (err) {
    log.error('[bridge] handler error:', err);
    send(res, 500, { error: String(err instanceof Error ? err.message : err) });
  }
});

/**
 * Day6.3: 启动 HTTP bridge server (可被测试或主进程调用)
 * 单独导出, 避免 import 副作用自动 listen
 */
export function startBridgeServer(port: number = PORT): Promise<http.Server> {
  return new Promise((resolve) => {
    const s = server.listen(port, () => {
      log.info(`[bridge] HTTP bridge + RL hook listening on http://localhost:${port}`);
      log.info(`[bridge] endpoints: GET /state, POST /action, GET /reset?seed, GET /health`);
      resolve(s);
    });
  });
}

// 兼容旧的 import 风格: 仅当直接 tsx 跑 bridge.ts 时才 listen
// 被 import 时不触发 — vitest/tsx import 不应该起 server
// 检测 argv[1] 是否指向 bridge.ts (兼容 npm run / 直接 tsx / node)
function isDirectRun(): boolean {
  if (typeof process === 'undefined' || !process.argv[1]) return false;
  const entry = process.argv[1].toLowerCase();
  return entry.endsWith('bridge.ts') || entry.endsWith('bridge.js');
}
if (isDirectRun()) {
  startBridgeServer().catch((err) => {
    log.error('[bridge] failed to start:', err);
    process.exit(1);
  });
}