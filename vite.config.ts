import { defineConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';
import path from 'path';

export default defineConfig({
  root: '.',
  base: './',
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'src'),
    },
  },
  plugins: [
    VitePWA({
      // Day8+ PWA: 离线 cache + installable
      registerType: 'autoUpdate',
      includeAssets: ['favicon.svg'],
      manifest: {
        name: '百鬼夜行录',
        short_name: '百鬼夜行',
        description: 'Hundred Night Parade — 浏览器肉鸽 MMO',
        theme_color: '#1a1a2e',
        background_color: '#1a1a2e',
        display: 'fullscreen',
        orientation: 'landscape',
        start_url: './',
        scope: './',
        icons: [
          {
            src: 'pwa-192x192.png',
            sizes: '192x192',
            type: 'image/png',
          },
          {
            src: 'pwa-512x512.png',
            sizes: '512x512',
            type: 'image/png',
          },
          {
            src: 'pwa-512x512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'any maskable',
          },
        ],
      },
      workbox: {
        // 预缓存主 bundle (启动时直接可用)
        globPatterns: ['**/*.{js,css,html,svg,png,ico,woff2}'],
        // 运行时缓存策略
        runtimeCaching: [
          {
            urlPattern: /^https:\/\/api\.deepseek\.com\//,
            handler: 'NetworkOnly', // LLM API 不缓存 (避免 stale)
            options: {
              backgroundSync: { name: 'llm-queue', options: { maxRetentionTime: 24 * 60 } },
            },
          },
          {
            urlPattern: /\.(?:png|jpg|jpeg|svg|gif|webp)$/,
            handler: 'CacheFirst',
            options: {
              cacheName: 'images',
              expiration: { maxEntries: 60, maxAgeSeconds: 30 * 24 * 60 * 60 },
            },
          },
        ],
      },
    }),
  ],
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
