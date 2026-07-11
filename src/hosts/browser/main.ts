/**
 * src/hosts/browser/main.ts
 *
 * Day2: 浏览器宿主入口
 *
 * 启动流程:
 *   1. 找到 #game-container
 *   2. 创建 BrowserGame (sim 权威) + GameRenderer + GameInput + GameHud
 *   3. 启动 20Hz tick
 *   4. 启动 60Hz 渲染
 *
 * 防止 HMR 重复实例化 (Day0 历史教训)。
 */

import { BrowserGame } from './game';
import { GameRenderer } from './renderer';
import { GameInput } from './input';
import { GameHud } from './hud';
import { GameClient, defaultWsUrl } from './network';
import { log } from '../../core/log';
/// <reference types="vite/client" />

const CONTAINER_ID = 'game-container';
const INSTANCE_KEY = '__baigui_host_browser';

declare global {
  interface Window {
    [INSTANCE_KEY]?: BrowserHost;
  }
}

class BrowserHost {
  game: BrowserGame;
  renderer: GameRenderer;
  input: GameInput;
  hud: GameHud;
  client: GameClient | null = null;

  constructor(container: HTMLElement) {
    // Day4: 启动时尝试连接 WebSocket server
    // 成功 → network 模式 (server 权威);失败 → 本地 sim fallback
    this.client = new GameClient(defaultWsUrl());
    this.client.onOpen = () => {
      // 加入 slot 1 (Day4: 简化 — 自动占 slot 1)
      this.client?.hello(1);
    };
    this.client.onError = (msg) => {
      log.warn('[host] server error:', msg.message);
    };
    this.client.onClose = () => {
      log.info('[host] disconnected, will keep local mode if not yet in network');
    };

    this.game = new BrowserGame({ tickHz: 20, networkClient: this.client });
    this.renderer = new GameRenderer(this.game, container);
    this.input = new GameInput(this.game);
    this.hud = new GameHud(this.game, container);

    // 每帧 renderer 同步 sim state
    this.game.onEvent(() => this.renderer.refresh(this.game));

    // HUD 主动刷新 (HP/level 变化)
    setInterval(() => this.hud.refresh(), 200);

    // 启动 (network 模式不跑 tick, 但 start() 不报错)
    this.game.start();
    this.renderer.start();
  }

  dispose(): void {
    this.game.stop();
    this.client?.close();
    this.renderer.dispose();
    this.input.dispose();
    this.hud.dispose();
  }
}

function startHost(): void {
  const container = document.getElementById(CONTAINER_ID);
  if (!container) {
    log.error(`[host/browser] #${CONTAINER_ID} not found`);
    return;
  }
  // HMR 防御: 销毁旧实例
  if (window[INSTANCE_KEY]) {
    try {
      window[INSTANCE_KEY].dispose();
    } catch (err) {
      log.warn('[host/browser] dispose old instance failed:', err);
    }
  }
  container.innerHTML = '';
  window[INSTANCE_KEY] = new BrowserHost(container);
  log.info('[host/browser] started. WASD 移动 · J/空格 攻击 · 自动拾取 · R 重置');
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', startHost);
} else {
  startHost();
}

// HMR
if (import.meta.hot) {
  import.meta.hot.dispose(() => {
    if (window[INSTANCE_KEY]) {
      window[INSTANCE_KEY].dispose();
      delete window[INSTANCE_KEY];
    }
  });
}