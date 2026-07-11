/**
 * server/server.ts - WebSocket 服务器宿主 (Day1.5)
 *
 * 协议 (极简,文本帧 JSON):
 *   client → server:
 *     {"type":"intent", "action": <0..5>}                    ← 客户端输入 (Discrete)
 *     {"type":"hello",  "slotId": 1}                         ← 加入房间
 *   server → client:
 *     {"type":"welcome", "entityId":"e_player_1", ...}      ← 握手响应
 *     {"type":"state",   "tick":123, "entities":[...], "events":[...]}  ← 20Hz 广播
 *     {"type":"error",   "message":"..."}
 *
 * Day1.5 适配:
 *   - 用真实 GameRoom (持有 GameState + MapLayout)
 *   - Discrete action (0..5) → 真实 Action 通过 GameRoom.advance
 *   - try/catch 包住 message handler 和 tick loop,不让 server 崩
 *
 * 启动: tsx server/server.ts  (端口 SERVER_PORT,默认 8787)
 */

import http from 'node:http';
import { WebSocketServer, WebSocket } from 'ws';
import { GameRoom, ROOM_PLAYER_ID } from './state.js';
import type { Action, EntityId } from '../src/core/sim/types.js';
import { log } from '../src/core/log.js';

const PORT = parseInt(process.env.SERVER_PORT ?? '8787', 10);
const TICK_HZ = 20;
const TICK_DT_MS = Math.floor(1000 / TICK_HZ);

// 全局单房间 (Day1.5)
const room = new GameRoom('room-0');

// 每帧推进前收集的 intents (Discrete 数字)
let pendingDiscrete: Array<{ action: number; entityId?: EntityId }> = [];

const http_server = http.createServer((req, res) => {
  try {
    if (req.url === '/health') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        ok: true,
        port: PORT,
        tick: room.tick,
        players: room.occupiedSlots.size,
        entityCount: room.entityCount,
      }));
      return;
    }
    res.writeHead(404, { 'Content-Type': 'text/plain' });
    res.end('not found');
  } catch (err) {
    log.error('[ws-http] error:', err);
    try {
      res.writeHead(500, { 'Content-Type': 'text/plain' });
      res.end('internal error');
    } catch { /* socket already closed */ }
  }
});

const wss = new WebSocketServer({ server: http_server });

function broadcast(msg: object) {
  const data = JSON.stringify(msg);
  for (const ws of wss.clients) {
    if (ws.readyState === WebSocket.OPEN) {
      try { ws.send(data); }
      catch (err) { log.error('[ws] broadcast error:', err); }
    }
  }
}

/**
 * 把 Discrete action (0..5) 翻译成真实 Action 数组。
 * 0..3 = move 4 方向, 4 = attack 最近敌人, 5 = pickup 最近物品
 * 失败 (找不到目标) 返回空数组,本帧不报错。
 */
function translateDiscrete(
  discrete: number,
  entityId: EntityId,
): Action[] {
  const self = room.getEntity(entityId);
  if (!self || self.hp <= 0) return [];

  switch (discrete) {
    case 0: return [{ type: 'move', entityId, payload: { dx: 0, dy: -1 } }];
    case 1: return [{ type: 'move', entityId, payload: { dx: 0, dy: 1 } }];
    case 2: return [{ type: 'move', entityId, payload: { dx: -1, dy: 0 } }];
    case 3: return [{ type: 'move', entityId, payload: { dx: 1, dy: 0 } }];
    case 4: {
      // attack 最近 monster
      let bestId: EntityId | null = null;
      let bestDist = Infinity;
      for (const [id, e] of Object.entries(room.state.entities) as [EntityId, typeof self][]) {
        if (e.kind !== 'monster' || e.hp <= 0) continue;
        const d = Math.abs(e.pos.x - self.pos.x) + Math.abs(e.pos.y - self.pos.y);
        if (d < bestDist) { bestDist = d; bestId = id; }
      }
      if (!bestId) return [];
      return [{ type: 'attack', entityId, payload: { targetId: bestId } }];
    }
    case 5: {
      // pickup 最近 item
      let bestId: EntityId | null = null;
      let bestDist = Infinity;
      for (const [id, e] of Object.entries(room.state.entities) as [EntityId, typeof self][]) {
        if (e.kind !== 'item') continue;
        const d = Math.abs(e.pos.x - self.pos.x) + Math.abs(e.pos.y - self.pos.y);
        if (d < bestDist) { bestDist = d; bestId = id; }
      }
      if (!bestId) return [];
      return [{ type: 'pickup', entityId, payload: { itemId: bestId } }];
    }
    default: return [];
  }
}

wss.on('connection', (ws: WebSocket) => {
  // 每个连接默认占 RL slot (e_player_1),复杂分配留 Day2
  let assignedEid: EntityId = ROOM_PLAYER_ID;
  log.info(`[ws] connected, total=${wss.clients.size}`);

  ws.on('message', (raw) => {
    try {
      const msg = JSON.parse(String(raw));

      switch (msg.type) {
        case 'hello': {
          // 让 client 占一个 slot;若 RL slot 已占,fallback to first free
          const wanted = Number(msg.slotId ?? 1);
          const eid = room.addPlayer(wanted);
          if (eid === null || eid === undefined) {
            // 没 slot 了,继续用 RL slot
            assignedEid = ROOM_PLAYER_ID;
          } else {
            assignedEid = eid;
          }
          ws.send(JSON.stringify({
            type: 'welcome',
            entityId: assignedEid,
            room: room.id,
            tick: room.tick,
            snapshot: room.getSnapshot(),
          }));
          break;
        }
        case 'intent': {
          // msg: { type: 'intent', action: 0..5, entityId?: string }
          const action = Number(msg.action);
          if (!Number.isInteger(action) || action < 0 || action > 5) {
            ws.send(JSON.stringify({ type: 'error', message: `invalid action: ${msg.action}` }));
            break;
          }
          const eid = (typeof msg.entityId === 'string' && msg.entityId.startsWith('e_'))
            ? (msg.entityId as EntityId)
            : assignedEid;
          pendingDiscrete.push({ action, entityId: eid });
          break;
        }
        default:
          ws.send(JSON.stringify({ type: 'error', message: `unknown type: ${msg.type}` }));
      }
    } catch (err) {
      // bad JSON / handler error — 不让 server 崩
      log.error('[ws] message error:', err);
      try {
        ws.send(JSON.stringify({ type: 'error', message: 'bad message' }));
      } catch { /* socket closed */ }
    }
  });

  ws.on('close', () => {
    try { room.removePlayer(assignedEid); }
    catch (err) { log.error('[ws] removePlayer error:', err); }
    log.info(`[ws] closed, total=${wss.clients.size}`);
  });

  ws.on('error', (err) => {
    log.error('[ws] socket error:', err);
  });
});

wss.on('error', (err) => {
  log.error('[ws] server error:', err);
});

// 20Hz tick loop —— try/catch 包住,不让单次错误中断 server
setInterval(() => {
  try {
    const actions: Action[] = [];
    if (pendingDiscrete.length > 0) {
      const items = pendingDiscrete;
      pendingDiscrete = [];
      for (const it of items) {
        actions.push(...translateDiscrete(it.action, it.entityId ?? ROOM_PLAYER_ID));
      }
    }
    const result = room.advance(actions, TICK_DT_MS);
    // 只在有状态变化 / 有事件时广播,减少噪声
    const state = Object.values(result.state.entities);
    broadcast({
      type: 'state',
      tick: result.tick,
      entities: state,
      events: result.events,
    });
  } catch (err) {
    log.error('[tick-loop] error:', err);
  }
}, TICK_DT_MS);

http_server.listen(PORT, () => {
  log.info(`[server] WebSocket + HTTP listening on http://localhost:${PORT}`);
  log.info(`[server] ws://localhost:${PORT}  (WebSocket)`);
  log.info(`[server] http://localhost:${PORT}/health`);
  log.info(`[server] room=${room.id}, entities=${room.entityCount}, tickHz=${TICK_HZ}`);
});