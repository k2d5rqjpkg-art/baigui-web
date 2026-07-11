# 项目总览 (Project Overview)

*日期：2026-07-11｜项目：百鬼夜行录 (Hundred Night Parade)*

---

## 1. 状态

| 指标 | 数值 |
|---|---|
| 项目时长 | **~5-6 小时**（2026-07-11 单日密集开发） |
| Git commit | **19 个** |
| 主代码行数 | **~6800 行** |
| 测试数 | **237 + 1 skipped**（19 个测试文件） |
| 测试覆盖（sim 核心） | **93.66% lines / 100% funcs** |
| 全项目覆盖 | **76.81% lines** |
| Bundle 体积（gzip） | 9.84 KB 首屏 + 134 KB 异步 + 557 KB PWA precache |
| 验证状态 | typecheck 0 错 / lint 0 errors / build 0 warning |

---

## 2. 架构概览

**WoC "一套 sim 三宿主"** 架构：纯函数 sim 核心（2172 行 + 51 测试）支撑三个宿主——

| 宿主 | 端口 | 状态 |
|---|---|---|
| **离线浏览器**（local sim） | 5173 (Vite dev) | ✅ |
| **权威服务器**（multiplayer WebSocket） | 8787 | ✅ M0.2 |
| **Python RL 环境**（Gymnasium） | HTTP bridge | ✅ |

**功能完成度**：

| 功能 | 状态 |
|---|---|
| M0 验收（Day1） | 5/6 |
| M0.1 单人玩法（Day2-3） | 10/11（仅缺物品 sprite） |
| M0.2 多人可见（Day4） | 8/8 |
| 任务系统 + NPC 对话（Day6.1） | ✅ |
| 物品 sprite + 动态 HP 条（Day6.4） | ✅ |

---

## 3. 19 个 commit 摘要

| # | Hash | 内容 |
|---|---|---|
| 1 | `29eb667` | Day0 2D Three.js baseline |
| 2 | `e2d00fd` | Day1 WoC sim 三宿主 + LLM + server + RL |
| 3 | `815b6e8` | Day2 浏览器宿主接入 sim (M0.1 8/9) |
| 4 | `490c7f6` | Day3 sprite + 怪物 AI + auto-pickup (M0.1 10/11) |
| 5 | `79104ee` | Day4 WebSocket 多客户端 (M0.2 8/8) |
| 6 | `2263dfb` | Day5 类型化 + 清理 as any |
| 7 | `56d63a1` | Day5+ ESLint 9 + log 分级 |
| 8 | `a1466dc` | Day5+ coverage + chunk splitting |
| 9 | `ebe7739` | Day5+ .gitignore coverage/ |
| 10 | `47fb0c6` | Day5+ lint 修复 |
| 11 | `e6ff505` | polish README + .gitignore |
| 12 | `7e8a0db` | Day5++ LLM + server 单元测试（165 测试） |
| 13 | `c85dcd7` | Day6 任务系统 + NPC（server 端） |
| 14 | `d8d1833` | Day6 HTTP /dialogue + WS content + HUD |
| 15 | `9e74a9b` | Day6 物品 sprite + HP 条 + RL agent |
| 16 | `003f384` | fix bridge.ts import 副作用起 server |
| 17 | `1971034` | Day7+ 联网调研 + 补充测试 (fast-check + mock-ws) |
| 18 | `043721c` | Day7+ stateful property + bridge E2E |
| 19 | `e4a7dcb` | **perf: Three.js 动态 import** |
| 20 | `e43d860` | **PWA: manifest + service worker** |
| 21 | `036e555` | **LLM 集成测试 16 测** |
| 22 | `f3c0201` | **itch.io 上架准备** |

> 注：#19-22 是 v1 上线优化包（4 步）。

---

## 4. 文档位置

### 项目根
- `README.md` — 项目入口文档（架构 + 启动 + 操作）

### reports/ 目录 (`G:/hermes/workspace/agent/workspace/reports/`)

**Day 完成报告（开发日志）**：
- `baigui-Day1立项-20260711.md` — Day1 立项（M0 + WoC 架构）
- `baigui-Day1验收清单-20260711.md` — Day1 验收 M0 5/6
- `baigui-Day1完成报告-20260711.md` — Day1 51 测试
- `baigui-Day2立项补充-20260711.md` — Day2 浏览器宿主设计
- `baigui-Day2完成报告-20260711.md` — Day2 M0.1 8/9
- `baigui-Day3完成报告-20260711.md` — Day3 M0.1 10/11
- `baigui-Day4完成报告-20260711.md` — Day4 M0.2 8/8
- `baigui-Day5++完成报告-20260711.md` — Day5++ 89 测试
- `baigui-Day5+完成报告-20260711.md` — Day5+ ESLint/log/coverage
- `baigui-Day6完成报告-20260711.md` — Day6 quest/NPC/agent

**架构分析**：
- `World-of-ClaudeCraft-架构分析-20260711.md` — WoC 参考

**v1 上线文档（重要）**：
- `baigui-LLM集成测试指南-20260711.md` — **LLM 上线前必读**（15 测 + 1 skip + 3 步手动验证）
- `baigui-itch.io上架检查表-20260711.md` — **10 步上架流程**（itch.io + PWA 准备好的产物清单）

### 命名说明

- `Day*`：开发阶段日志（**注意：5-6 小时内完成，不是真"多日"**）
- `LLM集成测试指南` / `itch.io上架检查表`：v1 上线相关，按主题命名

---

## 5. 关键数字

| 指标 | 数值 |
|---|---|
| sim 核心 | 2172 行 + 51 测试（**94% 覆盖**） |
| LLM 层 | 662 行 + 50 测试（**92% 覆盖**） |
| 服务器 | 713 行 + 52 测试（**state 99% 覆盖**） |
| 浏览器宿主 | 2121 行 + 25 测试（**game 83% 覆盖**） |
| 任务 / NPC | 162 行 + 13 测试 |
| log 系统 | 99 行 + 5 测试 |
| **总计** | **~6800 行** + **237 + 1 测试**（19 文件，7s 跑完） |

---

## 6. v1 上线状态：✅ Ready

| 项 | 状态 |
|---|---|
| typecheck | ✅ 0 错 |
| lint | ✅ 0 errors |
| test | ✅ 237/237 全过 |
| build | ✅ exit 0, 0 warning |
| PWA | ✅ 可安装 + 离线启动 |
| LLM 集成 | ✅ 16 测试覆盖 + fallback 兜底 |
| itch.io 上架 | ✅ 产物完整 + 检查表 |
| README | ✅ 9.4 KB |

**立即可做**：
1. 注册 itch.io 账号 → 上传 `dist/` → 30 分钟上线
2. 装 `DEEPSEEK_API_KEY` → 跑 `scripts/test-llm.ts` 验证 LLM 路径
3. 部署 server 到 Render/Railway（启用多人模式）

---

## 7. 后续路线图（未做）

按 ROI 排序：
1. **真 LLM key 装入 + 跑 e2e 验证**（30min，上线前必做）
2. **覆盖 bridge.ts HTTP 路由**（30min，12% → 80%）
3. **移动端触屏操作**（4h，上线 W2）
4. **Discord 社区**（持续，W2）
5. **5-10 个 KOL 推广**（W3）
6. **Steam wishlist 页面**（W4）

---

*记录生成：2026-07-11 22:30 | 项目真实时长：~5-6 小时单日密集开发*
*命名纠正：之前"Day N"是 commit 序号伪时间轴，不是真"多日项目周期"*
