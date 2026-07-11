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
  },
});
