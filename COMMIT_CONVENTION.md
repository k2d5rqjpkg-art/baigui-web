# Commit Convention

## Format
```
<type>(<scope>): <subject>
```

## Types
- `feat`: 新功能
- `fix`: bug 修复
- `refactor`: 重构 (无新功能/修复)
- `test`: 测试
- `docs`: 文档
- `chore`: 杂项 (构建/CI/工具)
- `style`: 代码格式

## Scopes
- `sim`: src/core/sim
- `server`: server/
- `host`: src/hosts/browser
- `llm`: src/core/llm
- `test`: __tests__
- `ci`: CI/scripts

## Subject
- 中文/英文均可 (推荐中文)
- ≤ 60 字符
- 祈使语气 ("添加" 而非 "添加了")

## Examples
```
feat(host): 背包 (I键) 点击装备 + K键技能树
fix(sim): learnSkill 清掉已学技能 buff
test: AI fuzz 100 步 invariant + 录制回放
chore(ci): Day45 GitHub Actions + CHANGELOG 自动生成
```

## Multi-line body (optional)
```
feat(host): HP/EXP/技能/背包 HUD

- 左上 stat block
- 右上任务 (Day6.1)
- 右下战斗日志
- Esc 设置
```

## Bad
```
fixed bug         (无 type, 无 scope)
FEAT: 改了        (大写)
feat:             (空 subject)
```