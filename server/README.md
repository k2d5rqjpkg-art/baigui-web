# Baigui Server Host

Day1 服务器宿主 - WebSocket (Node + `ws`) + HTTP bridge (原生 `http`,无 express)。

## 模块

| 文件 | 作用 |
|------|------|
| `server.ts` | WebSocket 服务器 (20Hz tick,广播 state 增量给所有客户端) |
| `bridge.ts` | HTTP 桥接 (供 Python RL 环境走 HTTP 调用,**不复用** WebSocket) |
| `state.ts` | `GameRoom` 内存房间状态容器 (≤4 玩家) |

共享 `GameRoom` 单例设计:
- `server.ts` 和 `bridge.ts` 是 **两个独立进程** (Day1 简化,默认端口也相同会冲突)
- 同一时间请只跑一个;Day2 起再拆出进程池或合并。

## WebSocket 协议 (极简 JSON 文本帧)

**client → server**
```json
{ "type": "hello",   "slotId": 1 }
{ "type": "intent",  "entityId": 7, "payload": { "action": 3 } }
```

**server → client**
```json
{ "type": "welcome", "entityId": 1, "room": "room-0",
  "snapshot": { "tick": 0, "entities": [...] } }
{ "type": "state",   "tick": 12, "entities": [...],
  "events": [{ "kind": "damage", "fromId": 7, "toId": 100, "amount": 12 }] }
```

## HTTP Bridge 接口 (供 Python RL 用)

| Method | Path | 说明 |
|--------|------|------|
| GET | `/state` | 返回 `{tick, entities[]}` 当前 snapshot |
| POST | `/action` | body `{action: 0..5, entityId?}`,推进一帧并返回 `{tick, entities, events, reward}` |
| GET | `/reset?seed=123` | 用 seed 重置房间 |
| GET | `/health` | 健康检查 |

## 启动

```bash
# 安装依赖 (一次性)
npm install

# 跑 WebSocket 服务器 (端口 8787,可 SERVER_PORT=xxxx 覆盖)
npm run server

# 或者跑 HTTP bridge (供 Python RL 直接接)
npm run server:bridge
```

成功后控制台:
```
[server] WebSocket + HTTP listening on http://localhost:8787
[server] ws://localhost:8787  (WebSocket)
[server] http://localhost:8787/health
[server] room=room-0, entities=6, tickHz=20
```

## 验证 (curl)

```bash
curl http://localhost:8787/health
# → {"ok":true,"port":8787,"tick":...,"players":1}

curl -X POST http://localhost:8787/action \
  -H "Content-Type: application/json" \
  -d '{"action":3}' | jq .
# → {"action":3,"events":[{...}],"tick":...,"reward":..., "entities":[...]}

curl 'http://localhost:8787/reset?seed=42'
# → {"ok":true,"seed":42,"snapshot":{...}}
```

## 与 sim 核心的契约

`server.ts` / `state.ts` 同时依赖:
- `src/core/sim/types.ts` - `SimEntity`, `Intent`, `TickEvent`, `TickResult`, `EntityId`
- `src/core/sim/tick.ts` - `runTick(entities, intents, playerId?) -> TickResult`, `spawnInitialEntities(playerId, seed)`

当前文件 (`src/core/sim/types.ts` + `src/core/sim/tick.ts`) 由服务器宿主 subagent 先提供一个
最小可跑的占位版本,等待 Day1 sim-核心 subagent 的真实实现替换。
**替换后只需保证上述两个 named export 的签名不变**,server/ 目录无须改动。

## Python RL 对接

见 `../rl/README.md`。
