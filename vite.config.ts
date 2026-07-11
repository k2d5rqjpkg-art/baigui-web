import { defineConfig } from 'vite';
import path from 'path';

export default defineConfig({
  root: '.',
  base: './',
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'src'),
    },
  },
  server: {
    port: 3000,
    open: false,
    proxy: {
      // Day4: WebSocket 代理到 server.ts (8787)
      // 浏览器连 ws://localhost:3000/ws 实际转发到 ws://localhost:8787
      '/ws': {
        target: 'ws://localhost:8787',
        ws: true,
        changeOrigin: true,
      },
      // HTTP bridge (供 Python RL 调用, Day1 已实现)
      '/bridge': {
        target: 'http://localhost:8787',
        changeOrigin: true,
      },
    },
  },
  build: {
    outDir: 'dist',
    assetsInlineLimit: 0,
    // Three.js 本身就 500KB+,超过 Vite 默认 500KB warning 阈值是必然的
    // 调到 1MB 让 warning 不打扰,真实性能影响用动态 import 优化 (Day5+ P1)
    chunkSizeWarningLimit: 1024,
    rollupOptions: {
      output: {
        // 手动分 chunk 让浏览器优先缓存 sim 核心和宿主代码
        // - main.ts: 入口 (无 three, ~10KB)
        // - sim-core: sim 纯函数 (被多处引用)
        // - browser-host: GameRenderer + 三个 Three.js 用法 (~350KB 异步加载)
        // - core: 其他 core 模块 (log/llm)
        // - vendor: node_modules
        // - entities: 旧 sprite (Day0 像素风, 未来可独立)
        manualChunks(id) {
          if (id.includes('node_modules')) return 'vendor';
          if (id.includes('src/hosts/browser/renderer')) return 'three-renderer';
          if (id.includes('src/entities/sprites')) return 'three-sprites';
          if (id.includes('src/hosts/browser/')) return 'browser-host';
          if (id.includes('src/core/sim/')) return 'sim-core';
          if (id.includes('src/core/')) return 'core';
          if (id.includes('src/entities/')) return 'entities';
        },
      },
    },
  },
});
