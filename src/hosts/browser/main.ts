/**
 * src/hosts/browser/main.ts
 *
 * 浏览器宿主入口 (异步加载 Three.js)
 *
 * 启动流程:
 *   1. 找到 #game-container
 *   2. 显示 loading 提示 (主 bundle < 50KB)
 *   3. 异步 import three + GameRenderer (~350KB chunk)
 *   4. 创建 BrowserGame + 渲染层 + 输入 + HUD
 *   5. 启动 20Hz tick + 60Hz 渲染
 *
 * bundle 优化:
 *   - main.ts 不静态 import 'three' 或 GameRenderer
 *   - Vite 自动 code-split, 三大块 chunk 异步加载
 *   - 首屏 < 50KB, 加载完后才看到 3D 场景
 */

import { BrowserGame } from './game';
// ⚠️ 不 import './renderer' (static 会把 three 549KB 拉进主 bundle)
// 改成 dynamic import 进 async startGame()
import type { GameRenderer } from './renderer';
import { GameInput } from './input';
import { GameHud } from './hud';
import { AdvisorPanel } from './advisor-panel';
import { SkillPanel } from './skill-panel';
import { InventoryPanel } from './inventory-panel';
import { PvpPanel } from './pvp-panel';
import { SaveLoadPanel, readSave, applySaveToGame } from './save-load';
import { SettingsPanel } from './settings-panel';
import { StatusBar } from './status-bar';
import { Minimap } from './minimap';
import { GameClient, defaultWsUrl, defaultRoomId } from './network';
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
  renderer: GameRenderer | null = null;  // 异步加载, 加载完才有
  input: GameInput;
  hud: GameHud;
  advisor: AdvisorPanel;
  skills: SkillPanel;
  inventory: InventoryPanel;
  pvp: PvpPanel;
  saveLoad: SaveLoadPanel;
  settings: SettingsPanel;
  statusBar: StatusBar;
  minimap: Minimap;
  client: GameClient | null = null;

  constructor(container: HTMLElement) {
    // Day4: 启动时尝试连接 WebSocket server
    // 成功 → network 模式 (server 权威);失败 → 本地 sim fallback
    this.client = new GameClient(defaultWsUrl());
    this.client.onOpen = () => {
      // Day20: 支持 ?room= 进指定房间 (默认 room-0)
      const roomId = defaultRoomId();
      this.client?.hello(1, roomId);
      log.info('[host] hello room=', roomId);
    };
    this.client.onError = (msg) => {
      log.warn('[host] server error:', msg.message);
    };
    this.client.onClose = () => {
      log.info('[host] disconnected, will keep local mode if not yet in network');
    };

    this.game = new BrowserGame({ tickHz: 20, networkClient: this.client });
    this.input = new GameInput(this.game);
    this.hud = new GameHud(this.game, container);
    // Day18: 技能树 (K 键)
    this.skills = new SkillPanel(this.game, container);
    // Day22: 背包 (I 键)
    this.inventory = new InventoryPanel(this.game, container);
    // Day23: PvP (P 键)
    this.pvp = new PvpPanel(container, 'browser-p1');
    // Day24: 存档 (O 键) · Day25 读档后刷 HUD
    this.saveLoad = new SaveLoadPanel(this.game, container, () => {
      this.hud.refresh();
    });
    // Day27-28: 设置 (Esc) 音效
    this.settings = new SettingsPanel(container);
    // Day30: 状态条
    this.statusBar = new StatusBar(this.game, container);
    // Day36: 小地图
    this.minimap = new Minimap(this.game, container);
    // Day31: 启动自动读档 (仅本地模式, 有存档则应用)
    try {
      const save = readSave();
      if (save) {
        applySaveToGame(this.game, save);
        log.info('[host] auto-loaded save Lv.', save.level);
        this.hud.refresh();
      }
    } catch (err) {
      log.warn('[host] auto-load failed:', err);
    }
    // v1.1: AI 顾问面板 (1Hz 调 LLM/fallback, 无 key 时也跑)
    this.advisor = new AdvisorPanel(container);
    this.advisor.start(
      () => this.game.getState(),
      () => this.game.getEntities().find((e) => e.kind === 'player') || null,
    );

    // HUD 主动刷新 (HP/level 变化)
    setInterval(() => this.hud.refresh(), 200);

    // 启动 sim tick (network 模式不跑 tick, 但 start() 不报错)
    this.game.start();
  }

  /** 异步加载 Three.js 渲染层 (~350KB chunk) */
  async loadRenderer(container: HTMLElement): Promise<void> {
    if (this.renderer) return; // 已加载
    // 动态 import: 触发 Vite code-split, this 模块不进主 bundle
    const { GameRenderer } = await import('./renderer');
    this.renderer = new GameRenderer(this.game, container);
    this.game.onEvent(() => this.renderer!.refresh(this.game));
    this.renderer.start();
    log.info('[host] Three.js renderer loaded');
  }

  dispose(): void {
    this.game.stop();
    this.client?.close();
    this.renderer?.dispose();
    this.input.dispose();
    this.hud.dispose();
    this.skills.dispose();
    this.inventory.dispose();
    this.pvp.dispose();
    this.saveLoad.dispose();
    this.settings.dispose();
    this.statusBar.dispose();
    this.minimap.dispose();
    this.advisor.dispose();
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

  // 显示 loading 提示 (Three.js 加载前)
  const loading = document.createElement('div');
  loading.style.cssText = `
    position: absolute; inset: 0; display: flex;
    align-items: center; justify-content: center; flex-direction: column;
    background: #1a1a2e; color: #d4a017; font-family: 'Microsoft YaHei', sans-serif;
  `;
  loading.innerHTML = `
    <div style="font-size: 32px; margin-bottom: 16px;">百鬼夜行录</div>
    <div id="__loading_status" style="font-size: 14px; color: #888">正在加载...</div>
  `;
  container.appendChild(loading);

  // 同步创建 sim + HUD (无 Three.js, 几十 KB)
  const host = new BrowserHost(container);
  window[INSTANCE_KEY] = host;
  log.info('[host/browser] sim started. Loading renderer...');

  // 异步加载 Three.js 渲染层 + 启动渲染
  host.loadRenderer(container).then(() => {
    loading.remove();
    log.info('[host/browser] started. WASD 移动 · J/空格 攻击 · 自动拾取 · R 重置');
  }).catch((err) => {
    log.error('[host/browser] renderer load failed:', err);
    const status = document.getElementById('__loading_status');
    if (status) status.textContent = `加载失败: ${err.message}`;
  });
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