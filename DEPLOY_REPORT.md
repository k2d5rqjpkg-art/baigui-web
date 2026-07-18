# 百鬼夜行录 — 部署报告

> 2026-07-18 · Hermes Agent 会话记录

---

## 一、项目概况

| 维度     | 数值                                                         |
| -------- | ------------------------------------------------------------ |
| 项目名   | 百鬼夜行录 (baigui-web)                                      |
| 类型     | 浏览器端 2D 像素风 MMORPG (Vite + Three.js + TS)             |
| 代码规模 | ~12,200 行 (src/ + server/)                                  |
| 测试     | 561 通过 / 1 跳过 (61 文件)                                  |
| 覆盖率   | 76.88%                                                       |
| 验证     | TypeScript / ESLint / Test / AI Test / Prettier / Build 全绿 |

---

## 二、GitHub 部署信息

| 项目                | 值                                           |
| ------------------- | -------------------------------------------- |
| **仓库地址**        | https://github.com/k2d5rqjpkg-art/baigui-web |
| **部署地址**        | https://k2d5rqjpkg-art.github.io/baigui-web/ |
| **用户名**          | k2d5rqjpkg-art                               |
| **Token (classic)** | （敏感信息，见本地文件 DEPLOY_REPORT.local.md） |
| **Token 权限**      | repo (全选)                                  |
| **主分支**          | main (完整源代码 + 测试)                     |
| **部署分支**        | gh-pages (仅 dist 构建产物)                  |

---

## 三、可用的 API Token

### GitHub

```
（敏感信息，见本地文件 DEPLOY_REPORT.local.md）
```

- 类型: Classic token
- 权限: repo (全选)
- 已验证: `curl -H "Authorization: Bearer <token>" https://api.github.com/user` 返回 200 (k2d5rqjpkg-art)
- 用于: git push, API 操作

### Cloudflare

```
d4c15ef3270f7dc385a5a10b0d18867f
```

- 类型: Account ID
- 账户邮箱: Fzs25jj2g8@privaterelay.appleid.com (Apple ID 登录)

> ⚠️ Cloudflare API Token 从未成功创建/验证。多次尝试的 cfat_ 和 v1.0- 格式 token 在 Cloudflare API 均返回 "Invalid API Token (1000)"。可能是 Apple ID privaterelay 账号限制。

---

## 四、已完成的 18 项工程化改进

1. 清理遗留代码 ~1,619 行 (旧 ECS / main.ts / scenes / systems / ui)
2. Buff 类型系统重构 (EntityData 判别联合, 消除 17 处 as any)
3. ESLint 配置修复 (删除旧 .eslintrc.json)
4. pg 包从 devDependencies 移至 dependencies
5. 5 个预定义副本配置 (DUNGEON_POOL)
6. Postgres 持久化接入 WebSocket server.ts
7. CI 并行 5 job + npm audit
8. 感知半径 LLM 节流 (WoC 1800 AI 私服模式)
9. 事件触发 NPC 评论 (击杀/升级时 NPC 自动评论)
10. LLM 对话异步化 (generateAsync non-blocking)
11. 12 种妖怪人格系统 (yokai-personality.ts)
12. LLM Provider 接口抽象 (DeepSeek / OpenAI 切换)
13. PostgresLeaderboard 真实 SQL 查询
14. REPORT.md 文档更新
15. behavior-coverage.test.ts 路径修正
16. ai:test 脚本路径修正
17. final-verify.mjs 路径修正
18. wrangler.toml 创建

---

## 五、AI 测试套件

| 命令                   | 文件数         | 描述                                                     |
| ---------------------- | -------------- | -------------------------------------------------------- |
| `npm run ai:test`      | 5 文件 16 测试 | fuzz + replay + behavior-coverage + smoke-e2e + rl-agent |
| `npm run ai:bench`     | 1 文件         | perf-bench.test.ts (1.4-2.2M ticks/s)                    |
| `npm run ai:fuzz`      | 1 文件         | fast-check property-based fuzz                           |
| `npm run final:verify` | 6 套件         | TypeScript/ESLint/Test/AI/Prettier/Build                 |

---

## 六、本地路径

```
D:/HermesProjects/baigui-web/
```

## 七、npm scripts 关键命令

| 命令                   | 用途                             |
| ---------------------- | -------------------------------- |
| `npm run dev`          | Vite 开发服务器 (localhost:3000) |
| `npm run build`        | 生产构建 → dist/                 |
| `npm run test`         | 全测试套件                       |
| `npm run final:verify` | 6 套件一键验收                   |
| `npm run server`       | WebSocket 服务器 (:8787)         |
