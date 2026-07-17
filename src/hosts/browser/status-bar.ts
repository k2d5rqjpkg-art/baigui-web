/**
 * src/hosts/browser/status-bar.ts
 *
 * Day30: 顶部状态条 — 房间 / tick / FPS
 */
import type { BrowserGame } from './game';
import { defaultRoomId } from './network';

export class StatusBar {
  private root: HTMLDivElement;
  private textEl: HTMLDivElement;
  private game: BrowserGame;
  private frames = 0;
  private lastFpsAt = performance.now();
  private fps = 0;
  private timer: number | null = null;

  constructor(game: BrowserGame, container: HTMLElement) {
    this.game = game;
    this.root = document.createElement('div');
    this.root.style.cssText = `
      position: absolute; top: 0; left: 50%; transform: translateX(-50%);
      background: rgba(0,0,0,0.45); color: #9ab; font-size: 11px;
      padding: 3px 12px; border-radius: 0 0 6px 6px; z-index: 20;
      pointer-events: none; font-family: ui-monospace, monospace;
    `;
    this.root.innerHTML = `<div id="__status_txt">—</div>`;
    this.textEl = this.root.querySelector('#__status_txt') as HTMLDivElement;
    container.appendChild(this.root);
    this.timer = window.setInterval(() => this.tick(), 250);
  }

  private tick(): void {
    this.frames++;
    const now = performance.now();
    if (now - this.lastFpsAt >= 1000) {
      this.fps = this.frames;
      this.frames = 0;
      this.lastFpsAt = now;
    }
    const st = this.game.getState();
    const tick = st.tick;
    const room = defaultRoomId();
    const ents = this.game.getEntities().length;
    this.textEl.textContent = `room=${room} · tick=${tick} · ents=${ents} · ~${this.fps}fps`;
  }

  dispose(): void {
    if (this.timer !== null) clearInterval(this.timer);
    this.root.remove();
  }
}
