# Release Process

## 自动化 (CI)
推 `v*` tag → GitHub Actions 跑完整 pipeline → 自动发 release

```bash
# 1. 跑全验证
npm run typecheck
npm run lint
npm test
npm run ai:test
npm run build

# 2. 收集基准 + 仪表板
npm run bench:collect
npm run metrics

# 3. CHANGELOG 更新
npm run changelog

# 4. bump version (手动)
# package.json: "version": "1.1.0"
# 写 RELEASE-NOTES v1.1.0

# 5. commit + tag
git add -A
git commit -m "release: v1.1.0"
git tag -a v1.1.0 -m "v1.1.0 — 30+ commits, 561 测试, sim 1.4M ticks/s"
git push origin main --tags
```

## 版本号语义
- `1.0.x` (补丁): bug 修复,小调整
- `1.x.0` (小): 新功能/新模块
- `x.0.0` (大): 架构变更,破坏性 API

## 当前版本
- 见 `package.json`
- 下一个稳定版: `v1.1.0` (Day49-52 已就绪)

## 发布清单
- [ ] typecheck/lint/test 全过
- [ ] AI 测试全过
- [ ] coverage ≥ 当前基线
- [ ] CHANGELOG 更新
- [ ] bench 数据归档
- [ ] tag 推送
- [ ] GitHub release 页面写 release notes

## 借鉴 WoC 的 release cadence
WoC 是 vibe coding, 几乎不发 release.
我们走**工程化**路线, 每个 Day = 1 commit, 累积到 v1.1.0 / v1.2.0 发版.