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
        'src/core/llm/**', // LLM 靠 fallback + scripts/test-llm.ts 验证
        'src/core/log.ts', // 测试覆盖
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
        'src/hosts/browser/game.ts': {
          lines: 75,
          functions: 70,
          branches: 60,
          statements: 75,
        },
      },
    },
  },
});