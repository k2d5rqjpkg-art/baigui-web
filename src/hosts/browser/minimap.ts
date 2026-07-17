/**
 * src/hosts/browser/minimap.ts
 *
 * Day36: 小地图 (右下角, 房间轮廓 + 玩家点)
 */
import type { BrowserGame } from './game';

export class Minimap {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private game: BrowserGame;
  private timer: number | null = null;
  private size = 120;

  constructor(game: BrowserGame, container: HTMLElement) {
    this.game = game;
    this.canvas = document.createElement('canvas');
    this.canvas.width = this.size;
    this.canvas.height = this.size;
    this.canvas.style.cssText = `
      position: absolute; bottom: 52px; right: 12px;
      width: ${this.size}px; height: ${this.size}px;
      border: 1px solid #445; border-radius: 6px;
      background: rgba(0,0,0,0.55); z-index: 15; pointer-events: none;
    `;
    container.appendChild(this.canvas);
    this.ctx = this.canvas.getContext('2d')!;
    this.timer = window.setInterval(() => this.draw(), 200);
  }

  private draw(): void {
    const layout = this.game.getLayout();
    const p = this.game.getPlayerSnapshot();
    const ctx = this.ctx;
    const W = this.size;
    ctx.clearRect(0, 0, W, W);
    ctx.fillStyle = '#0a0a14';
    ctx.fillRect(0, 0, W, W);

    if (!layout) return;
    const sx = W / layout.width;
    const sy = W / layout.height;

    // rooms
    ctx.fillStyle = '#2a2a55';
    for (const room of layout.rooms ?? []) {
      ctx.fillRect(room.x * sx, room.y * sy, room.w * sx, room.h * sy);
    }

    // entities
    for (const e of this.game.getEntities()) {
      if (e.hp <= 0 && e.kind !== 'item') continue;
      const px = (e.pos.x + 0.5) * sx;
      const py = (e.pos.y + 0.5) * sy;
      if (e.kind === 'monster') {
        ctx.fillStyle = '#c44';
        ctx.fillRect(px - 1.5, py - 1.5, 3, 3);
      } else if (e.kind === 'item') {
        ctx.fillStyle = '#da4';
        ctx.fillRect(px - 1, py - 1, 2, 2);
      } else if (e.kind === 'player' && e.id !== p?.id) {
        ctx.fillStyle = '#4af';
        ctx.beginPath();
        ctx.arc(px, py, 2.5, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    // self
    if (p) {
      const px = (p.pos.x + 0.5) * sx;
      const py = (p.pos.y + 0.5) * sy;
      ctx.fillStyle = '#6f6';
      ctx.beginPath();
      ctx.arc(px, py, 3, 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.strokeStyle = '#667';
    ctx.strokeRect(0.5, 0.5, W - 1, W - 1);
  }

  dispose(): void {
    if (this.timer !== null) clearInterval(this.timer);
    this.canvas.remove();
  }
}
