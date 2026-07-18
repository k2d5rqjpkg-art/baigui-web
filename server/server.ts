/**
 * server/server.ts - WebSocket 服务器宿主
 *
 * 协议 (极简,文本帧 JSON):
 *   client → server:
 *     {"type":"hello",  "slotId": 1, "roomId"?: "room-0"}  ← Day16: 可选 roomId
 *     {"type":"intent", "action": <0..5>}
 *   server → client:
 *     {"type":"welcome", "entityId", "room", "tick", "snapshot"}
 *     {"type":"state",   "tick", "entities", "events", "room"?}
 *     {"type":"error",   "message"}
 *     {"type":"content", "content"}
 *
 * Day16: RoomPool 多房间 + hello.roomId
 */
import http from 'node:http';
import { WebSocketServer, WebSocket } from 'ws';
import { GameRoom, ROOM_PLAYER_ID } from './state.js';
import type { Action, EntityId } from '../src/core/sim/types.js';
import { log } from '../src/core/log.js';
import { RoomPool, sanitizeRoomId } from './room-pool.js';

// re-export for tests
export { sanitizeRoomId } from './room-pool.js';

const PORT = parseInt(process.env.SERVER_PORT ?? '8787', 10);
const TICK_HZ = 20;
const TICK_DT_MS = Math.floor(1000 / TICK_HZ);

// Day16: 房间池 (默认 room-0 兼容旧客户端)
const roomPool = new RoomPool();
const defaultRoom = roomPool.getOrCreate('room-0', 1);

// v2.0: 持久化 (异步初始化, 非阻塞)
(async () => {
  try {
    const m = await import('./persistence.js');
    const p = await m.createPersistence();
    for (const info of roomPool.list()) {
      const room = roomPool.getOrCreate(info.id, 1);
      room.persistence = p;
    }
    log.info('[server] persistence initialized');
  } catch (err) {
    log.warn('[server] persistence not available (memory-only mode)', err);
  }
})();

interface ClientMeta {
  roomId: string;
  entityId: EntityId;
}
const clientMeta = new WeakMap<WebSocket, ClientMeta>();

// 每帧 intents (带 roomId)
let pendingDiscrete: Array<{ roomId: string; action: number; entityId?: EntityId }> = [];

const http_server = http.createServer((req, res) => {
  try {
    const url = new URL(req.url ?? '/', `http://localhost:${PORT}`);
    if (url.pathname === '/health') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(
        JSON.stringify({
          ok: true,
          port: PORT,
          tick: defaultRoom.tick,
          players: defaultRoom.occupiedSlots.size,
          entityCount: defaultRoom.entityCount,
          rooms: roomPool.size(),
          totalPlayers: roomPool.getTotalPlayers(),
        }),
      );
      return;
    }
    if (url.pathname === '/rooms') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(
        JSON.stringify({
          rooms: roomPool.list(),
          total: roomPool.size(),
          totalPlayers: roomPool.getTotalPlayers(),
        }),
      );
      return;
    }
    res.writeHead(404, { 'Content-Type': 'text/plain' });
    res.end('not found');
  } catch (err) {
    log.error('[ws-http] error:', err);
    try {
      res.writeHead(500, { 'Content-Type': 'text/plain' });
      res.end('internal error');
    } catch {
      /* socket already closed */
    }
  }
});

const wss = new WebSocketServer({ server: http_server });

function broadcastToRoom(roomId: string, msg: object) {
  const data = JSON.stringify(msg);
  for (const ws of wss.clients) {
    if (ws.readyState !== WebSocket.OPEN) continue;
    const meta = clientMeta.get(ws);
    // 无 meta 的旧连接: 只收 room-0
    if (!meta && roomId !== 'room-0') continue;
    if (meta && meta.roomId !== roomId) continue;
    try {
      ws.send(data);
    } catch (err) {
      log.error('[ws] broadcast error:', err);
    }
  }
}

/**
 * 把 Discrete action (0..5) 翻译成真实 Action 数组。
 */
function translateDiscrete(discrete: number, entityId: EntityId, room: GameRoom): Action[] {
  const self = room.getEntity(entityId);
  if (!self || self.hp <= 0) return [];

  switch (discrete) {
    case 0:
      return [{ type: 'move', entityId, payload: { dx: 0, dy: -1 } }];
    case 1:
      return [{ type: 'move', entityId, payload: { dx: 0, dy: 1 } }];
    case 2:
      return [{ type: 'move', entityId, payload: { dx: -1, dy: 0 } }];
    case 3:
      return [{ type: 'move', entityId, payload: { dx: 1, dy: 0 } }];
    case 4: {
      let bestId: EntityId | null = null;
      let bestDist = Infinity;
      for (const [id, e] of Object.entries(room.state.entities) as [EntityId, typeof self][]) {
        if (e.kind !== 'monster' || e.hp <= 0) continue;
        const d = Math.abs(e.pos.x - self.pos.x) + Math.abs(e.pos.y - self.pos.y);
        if (d < bestDist) {
          bestDist = d;
          bestId = id;
        }
      }
      if (!bestId) return [];
      return [{ type: 'attack', entityId, payload: { targetId: bestId } }];
    }
    case 5: {
      let bestId: EntityId | null = null;
      let bestDist = Infinity;
      for (const [id, e] of Object.entries(room.state.entities) as [EntityId, typeof self][]) {
        if (e.kind !== 'item') continue;
        const d = Math.abs(e.pos.x - self.pos.x) + Math.abs(e.pos.y - self.pos.y);
        if (d < bestDist) {
          bestDist = d;
          bestId = id;
        }
      }
      if (!bestId) return [];
      return [{ type: 'pickup', entityId, payload: { itemId: bestId } }];
    }
    default:
      return [];
  }
}

wss.on('connection', (ws: WebSocket) => {
  let assignedEid: EntityId = ROOM_PLAYER_ID;
  let assignedRoomId = 'room-0';
  log.info(`[ws] connected, total=${wss.clients.size}`);

  ws.on('message', (raw) => {
    try {
      const msg = JSON.parse(String(raw));

      switch (msg.type) {
        case 'hello': {
          const wanted = Number(msg.slotId ?? 1);
          const roomId = sanitizeRoomId(msg.roomId);
          const room = roomPool.getOrCreate(roomId, 1);
          const eid = room.addPlayer(wanted);
          if (eid === null || eid === undefined) {
            assignedEid = ROOM_PLAYER_ID;
          } else {
            assignedEid = eid;
          }
          assignedRoomId = roomId;
          clientMeta.set(ws, { roomId, entityId: assignedEid });
          ws.send(
            JSON.stringify({
              type: 'welcome',
              entityId: assignedEid,
              room: room.id,
              tick: room.tick,
              snapshot: room.getSnapshot(),
            }),
          );
          // 立刻推 content (任务/NPC)
          if (room.content?.generatedAt) {
            ws.send(JSON.stringify({ type: 'content', content: room.content }));
          }
          log.info(`[ws] hello room=${roomId} eid=${assignedEid}`);
          break;
        }
        case 'intent': {
          const action = Number(msg.action);
          if (!Number.isInteger(action) || action < 0 || action > 5) {
            ws.send(JSON.stringify({ type: 'error', message: `invalid action: ${msg.action}` }));
            break;
          }
          const meta = clientMeta.get(ws);
          const roomId = meta?.roomId ?? assignedRoomId;
          const eid =
            typeof msg.entityId === 'string' && msg.entityId.startsWith('e_')
              ? (msg.entityId as EntityId)
              : (meta?.entityId ?? assignedEid);
          pendingDiscrete.push({ roomId, action, entityId: eid });
          break;
        }
        default:
          ws.send(JSON.stringify({ type: 'error', message: `unknown type: ${msg.type}` }));
      }
    } catch (err) {
      log.error('[ws] message error:', err);
      try {
        ws.send(JSON.stringify({ type: 'error', message: 'bad message' }));
      } catch {
        /* socket closed */
      }
    }
  });

  ws.on('close', () => {
    try {
      const meta = clientMeta.get(ws);
      const roomId = meta?.roomId ?? assignedRoomId;
      const eid = meta?.entityId ?? assignedEid;
      const room = roomPool.getOrCreate(roomId, 1);
      room.removePlayer(eid);
    } catch (err) {
      log.error('[ws] removePlayer error:', err);
    }
    log.info(`[ws] closed, total=${wss.clients.size}`);
  });

  ws.on('error', (err) => {
    log.error('[ws] socket error:', err);
  });
});

wss.on('error', (err) => {
  log.error('[ws] server error:', err);
});

// 20Hz tick: 按房间推进
setInterval(() => {
  try {
    const items = pendingDiscrete;
    pendingDiscrete = [];
    // group by roomId
    const byRoom = new Map<string, Array<{ action: number; entityId?: EntityId }>>();
    for (const it of items) {
      const list = byRoom.get(it.roomId) ?? [];
      list.push({ action: it.action, entityId: it.entityId });
      byRoom.set(it.roomId, list);
    }
    // 至少推进有连接的房间 + room-0
    const activeRoomIds = new Set<string>(['room-0']);
    for (const ws of wss.clients) {
      const m = clientMeta.get(ws);
      if (m) activeRoomIds.add(m.roomId);
    }
    for (const rid of byRoom.keys()) activeRoomIds.add(rid);

    for (const roomId of activeRoomIds) {
      const room = roomPool.getOrCreate(roomId, 1);
      const actions: Action[] = [];
      const roomIntents = byRoom.get(roomId) ?? [];
      for (const it of roomIntents) {
        actions.push(...translateDiscrete(it.action, it.entityId ?? ROOM_PLAYER_ID, room));
      }
      const result = room.advance(actions, TICK_DT_MS);
      broadcastToRoom(roomId, {
        type: 'state',
        tick: result.tick,
        entities: Object.values(result.state.entities),
        events: result.events,
        room: roomId,
      });
    }
  } catch (err) {
    log.error('[tick-loop] error:', err);
  }
}, TICK_DT_MS);

// content 广播 (每房独立 version)
const lastContentVersion = new Map<string, number>();
setInterval(() => {
  try {
    for (const info of roomPool.list()) {
      const room = roomPool.getOrCreate(info.id, 1);
      const v = room.content.generatedAt;
      const prev = lastContentVersion.get(info.id) ?? 0;
      if (v > prev) {
        lastContentVersion.set(info.id, v);
        broadcastToRoom(info.id, { type: 'content', content: room.content });
      }
    }
  } catch (err) {
    log.error('[content-poll] error:', err);
  }
}, 200);

http_server.listen(PORT, () => {
  log.info(`[server] WebSocket + HTTP listening on http://localhost:${PORT}`);
  log.info(`[server] ws://localhost:${PORT}  (WebSocket)`);
  log.info(`[server] http://localhost:${PORT}/health  GET /rooms`);
  log.info(`[server] roomPool default=room-0, tickHz=${TICK_HZ}`);
});
