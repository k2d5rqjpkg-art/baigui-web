import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html', 'lcov'],
      include: [
        'src/**/*.ts',
        'server/**/*.ts',
      ],
      exclude: [
        '**/__tests__/**',
        '**/*.test.ts',
        '**/node_modules/**',
        'scripts/**',
        // 浏览器/DOM 层靠手动 E2E 验证,不在单元测试范围
        'src/hosts/browser/main.ts',
        'src/hosts/browser/renderer.ts',
        'src/hosts/browser/input.ts',
        'src/hosts/browser/hud.ts',
        'src/hosts/browser/network.ts',
        'src/main.ts', // Day0 旧代码
        'src/scenes/**',
        'src/systems/**',
        'src/ui/**',
        'src/entities/sprites.ts', // 像素绘制
        // 类型/常量文件
        'src/core/sim/types.ts',
        'src/core/sim/index.ts',
        'src/core/components.ts',
        'src/core/ecs.ts',
        'src/core/log.ts', // 测试覆盖
        // LLM 的脚本端到端测试在 scripts/test-llm.ts, 但 client/cache/fallback/index 由 vitest 覆盖
        'src/core/llm/prompts/**',
      ],
      // 阈值只针对 sim 核心 + game.ts (浏览器 sim 集成层)
      // 这两个是项目核心逻辑,必须保持高覆盖
      thresholds: {
        'src/core/sim/': {
          lines: 85,
          functions: 80,
          branches: 75,
          statements: 85,
        },
        'src/core/llm/': {
          lines: 80,
          functions: 85,
          branches: 75,
          statements: 80,
        },
        'server/state.ts': {
          lines: 75,
          functions: 80,
          branches: 65,
          statements: 75,
        },
        'server/bridge.ts': {
          // bridge.ts 是 HTTP 入口, 80% 是 HTTP 路由 (createServer + req/res 处理)
          // 单测覆盖 computeRewardFromEvents (纯函数) + 部分 utils
          // 完整 HTTP 覆盖靠 scripts/test-multiplayer.ts E2E
          // 阈值定很低反映单测范围
          lines: 10,
          functions: 15,
          branches: 10,
          statements: 10,
        },
        'src/hosts/browser/game.ts': {
          lines: 60,
          functions: 70,
          branches: 55,
          statements: 60,
        },
      },
    },
  },
});