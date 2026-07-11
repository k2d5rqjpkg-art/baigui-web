# 百鬼夜行录 (Baigui Yēxíng Lù)

> 网页端肉鸽 (Roguelike) · 多宿主 MMO 框架 · 基于 WoC 架构设计哲学

[![GitHub](https://img.shields.io/badge/license-ISC-blue)]()
[![TS](https://img.shields.io/badge/TypeScript-6.0-blue)]()
[![Three.js](https://img.shields.io/badge/Three.js-r165-orange)]()
[![Tests](https://img.shields.io/badge/tests-76%20passing-brightgreen)]()
[![Coverage](https://img.shields.io/badge/sim%20coverage-93.66%25-brightgreen)]()

参考 [World of ClaudeCraft](https://github.com/levy-street/world-of-claudecraft) (新西兰 Levy Street 用 Claude Fable 5 在 48 小时 vibe code 出的浏览器 MMO) 的架构，构建《百鬼夜行录》。

---

## 🎯 当前进度

| Day | 完成 | 内容 | 状态 |
|---|---|---|---|
| Day0 | 2D Three.js baseline | 2D 骨架 + 选职业界面 + 技能系统 | ✅ |
| Day1 | sim 三宿主 + LLM + server + RL | WoC "一套 sim 三宿主" 架构 + 51 sim 测试 + Python Gymnasium env | ✅ M0 5/6 |
| Day2 | 浏览器宿主 (M0.1 8/9) | PCG 地图 + 移动 + 攻击 + HUD | ✅ |
| Day3 | sprite + AI + auto-pickup (M0.1 10/11) | Day0 sprite 工厂 + 怪物主动追 + 自动拾取 | ✅ |
| Day4 | WebSocket 多客户端 (M0.2 8/8) | vite proxy + GameClient + network mode + 双 tab 互见 | ✅ |
| Day5 | 类型化 + 清理 as any | GameEvent.data discriminated union + 修 sim tick 漏填 bug | ✅ |
| Day5+ | ESLint 9 + log 分级 + coverage + chunk splitting | 0 error / 76 tests / sim 93.66% 覆盖 / build 0 warning | ✅ |

**M0 验收总进度：5 + 10/11 + 8/8 = 23/24**（仅剩物品 sprite）

---

## 🏗️ 架构：一套 sim 三宿主

```
┌────────────────────────────────────────────────┐
│  src/core/sim/  ← 纯函数权威 (2172 行, 51 测试)   │
│  tick(state, actions, dt, options) → {state, events} │
└──────────────────┬─────────────────────────────┘
                   │
       ┌───────────┼───────────────┐
       ▼           ▼               ▼
  BrowserHost    Server        RL Environment
  (本地 sim)     (权威 sim)     (无头 sim)
  Three.js      ws + http     Gymnasium API
  5173 端口      8787 端口      Python
```

**sim 核心保持纯函数性**：无 I/O、无 Date.now、无 Math.random，所有随机走 Mulberry32 PRNG。
**宿主层**负责输入采集 / 渲染 / 网络 / AI 注入 / 自动行为。

---

## 🚀 快速开始

### 前置要求

- Node.js 18+（含 fetch / TextEncoder 等原生 API）
- npm 8+
- Python 3.11+（仅 RL 环境需要）
- uv（推荐 Python 包管理）

### 安装

```bash
# 1) JS 依赖
npm install

# 2) Python RL 依赖（可选, 仅 rl/ 需要）
cd rl && uv venv && source .venv/bin/activate  # Windows: rl\.venv\Scripts\activate
uv pip install -r requirements.txt
cd ..
```

### 启动开发模式

打开 **3 个终端**：

```bash
# 终端 1: 启动游戏服务器 (WebSocket + HTTP bridge)
npm run server
# → 监听 ws://localhost:8787 + http://localhost:8787

# 终端 2: 启动 Vite dev server
npm run dev
# → 打开 http://localhost:3000

# 终端 3 (可选): 启动 Python RL agent
cd rl
.venv/Scripts/python.exe test_env.py  # Windows
# 或 .venv/bin/python test_env.py  # Linux/macOS
```

**多客户端测试**：开两个浏览器 tab 都连 `http://localhost:3000`，按 WASD / J 攻击，两个 tab 都能看到对方移动 + 攻击伤害飘字。

---

## ⌨️ 浏览器操作

| 键 | 作用 |
|---|---|
| `W` `A` `S` `D` / 方向键 | 4 方向移动 |
| `J` / `Space` | 攻击相邻怪物（auto-target） |
| 自动 | 走到物品上自动入包 |
| `R` | 重置地图（新 seed） |

---

## 📂 项目结构

```
baigui-web/
├── src/
│   ├── core/
│   │   ├── sim/             ← sim 权威 (2172 行, 93.66% 覆盖)
│   │   │   ├── types.ts     ← EntityId / Action / GameEvent 严格契约
│   │   │   ├── rng.ts       ← Mulberry32 确定性 PRNG
│   │   │   ├── combat.ts    ← 战斗公式 (dmg/crit/dodge)
│   │   │   ├── movement.ts  ← 移动 + 碰撞 + bounds clamp
│   │   │   ├── items.ts     ← 9 件装备 (含 1 传说级)
│   │   │   ├── encounters.ts ← 5 种怪物 PCG 遭遇
│   │   │   ├── world.ts     ← BSP 地图生成
│   │   │   └── tick.ts     ← 核心入口 tick(state, actions, dt, opts)
│   │   ├── llm/             ← DeepSeek HTTP + LRU 缓存 + fallback
│   │   ├── log.ts           ← 统一日志 (debug/info/warn/error)
│   │   └── components.ts    ← Day0 旧 ECS 类型
│   ├── hosts/browser/       ← 浏览器宿主 (2121 行)
│   │   ├── game.ts          ← BrowserGame 双模式 (local/network)
│   │   ├── network.ts       ← GameClient WS 客户端 + 自动重连
│   │   ├── renderer.ts      ← Three.js 正交相机 + sprite + HP 条
│   │   ├── input.ts         ← 键盘 → Action
│   │   ├── hud.ts           ← HP/level/战斗日志/Game Over
│   │   └── main.ts          ← 入口 + HMR 防御
│   ├── entities/sprites.ts   ← Day0 像素风 sprite (4 职业 + 4 怪物)
│   └── main.ts               ← Day0 旧入口 (tsconfig 已 exclude)
├── server/                   ← WoC 权威服务器宿主
│   ├── server.ts             ← WebSocket + 20Hz tick loop
│   ├── bridge.ts             ← HTTP 桥接 (供 Python RL 调用)
│   └── state.ts              ← GameRoom (≤4 player slot)
├── rl/                       ← Gymnasium RL 环境
│   ├── env.py                ← BaiguiEnv (obs(33,), Discrete(6))
│   ├── agent.py              ← RandomAgent (Day1 占位)
│   └── test_env.py           ← 集成测试 [PASS]
├── scripts/                  ← 一次性测试脚本
│   ├── test-llm.ts           ← LLM fallback 验证
│   └── test-multiplayer.ts   ← 多客户端 E2E
├── docs/                     ← 设计文档
└── reports/                  ← Day1~Day5 完成报告（HERMES 工作区）
```

---

## 🧪 测试

```bash
# 单元测试
npm test                    # 76 tests
npm run test:watch          # 监听模式
npm run test:coverage       # 生成 coverage HTML (sim 93.66% / game 83.38%)
```

**测试覆盖**：
- `src/core/sim/`：**93.66% lines / 100% funcs**（核心逻辑）
- `src/hosts/browser/game.ts`：**83.38% lines / 87.5% funcs**（浏览器集成）
- 浏览器 DOM 层（renderer/input/hud/network）靠手动 E2E
- `src/core/llm/` 用 scripts/test-llm.ts 验证
- server/ 用 scripts/test-multiplayer.ts 验证

---

## 🛠️ 开发命令

```bash
npm run dev          # Vite dev server (HMR)
npm run build        # 生产构建 (dist/)
npm run preview      # 预览生产构建
npm run server       # 启动 WebSocket + HTTP server (8787)
npm run server:bridge # 仅 HTTP bridge (8787, 供 Python RL)

npm test             # 单元测试
npm run lint         # ESLint 9 flat config
npm run typecheck    # tsc --noEmit
```

---

## 🌍 环境变量

复制 `.env.example` 到 `.env`：

```bash
DEEPSEEK_API_KEY=sk-...        # 可选, 无则走 fallback 静态表
DEEPSEEK_BASE_URL=https://api.deepseek.com/v1
DEEPSEEK_MODEL=deepseek-chat
LOG_LEVEL=info                  # debug | info | warn | error | silent
```

---

## 🧠 技术决策

### WoC 架构借鉴

参考 WoC 的 `sim.ts` 设计：
- `(state, actions) → (newState, events)` 纯函数签名
- 客户端只发 intent（"想往北走"），服务器仲裁
- 服务器 20Hz tick 推进，广播 state 给所有客户端
- AI VTuber / RL / 重放 debug 全受益于确定性

**我们做的扩展**：
- BrowserGame 双模式（local fallback + network authoritative）
- 客户端 AI 注入：怪物主动追玩家、auto-pickup 在宿主层
- 实测 M3 模型 SWE-bench 80.5% 可独立完成骨架代码（参考架构分析报告）

### sim 纯函数哲学

- 无 I/O、无 `Date.now()` / `Math.random()`、无 `console.log()`
- 所有随机走 Mulberry32 PRNG（种子驱动）
- 单测：相同 seed → 相同输出
- 51 个测试覆盖 combat / movement / items / world / rng / tick

### AI / 自动行为不在 sim 内

`computeAIActions()` / `computeAutoPickup()` 在 BrowserGame（宿主层）实现，
**sim 核心保持被动响应 action 列表**——这是 WoC 的设计哲学。

---

## 📊 累计统计

| 指标 | 数值 |
|---|---|
| 主代码行数（src + server + rl + scripts） | **~5767 行** |
| sim 核心 | 2172 行 + 51 测试 |
| LLM 层 | 662 行 |
| 服务器 | 713 行 |
| 浏览器宿主 | 2121 行 + 20 测试 |
| 总测试数 | **76 vitest + 2 E2E 脚本** |
| sim 覆盖 | **93.66%** |
| 累计 commit | 10 个（Day0~Day5+） |

---

## 📚 相关文档

- `reports/World-of-ClaudeCraft-架构分析-20260711.md` — WoC 架构分析
- `reports/baigui-Day1立项-20260711.md` — Day1 立项
- `reports/baigui-Day1~4完成报告-20260711.md` — Day1~4 完整记录
- `woc-architecture-analysis` skill (HERMES) — WoC 架构参考技能

---

## 📝 License

ISC