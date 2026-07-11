/**
 * src/hosts/browser/input.ts
 *
 * Day2: 键盘输入 → Action 转换
 *
 * 设计:
 *   - 1 按下 = 1 Action (防止按住连发卡死 sim)
 *   - WASD/方向键 → move
 *   - J/空格 → attack 最近敌人 (auto-target)
 *   - E → pickup 最近物品 (auto-target)
 *   - R → reset (重新生成地图)
 *   - ESC → 显示帮助
 */

import { BrowserGame } from './game';
import type { Action, EntityId, SimEntity } from '../../core/sim';

export class GameInput {
  private game: BrowserGame;
  private keysDown = new Set<string>();
  private enabled = true;

  constructor(game: BrowserGame) {
    this.game = game;
    window.addEventListener('keydown', this.onKeyDown);
    window.addEventListener('keyup', this.onKeyUp);
  }

  dispose(): void {
    window.removeEventListener('keydown', this.onKeyDown);
    window.removeEventListener('keyup', this.onKeyUp);
  }

  setEnabled(v: boolean): void {
    this.enabled = v;
  }

  private onKeyDown = (ev: KeyboardEvent): void => {
    if (!this.enabled) return;
    // 防止重复 keydown 触发多个 action (按住时 keydown 重复)
    if (this.keysDown.has(ev.code)) return;
    this.keysDown.add(ev.code);

    let action: Action | null = null;

    switch (ev.code) {
      // 移动
      case 'KeyW':
      case 'ArrowUp':
        action = this.makeMove(0, -1);
        break;
      case 'KeyS':
      case 'ArrowDown':
        action = this.makeMove(0, 1);
        break;
      case 'KeyA':
      case 'ArrowLeft':
        action = this.makeMove(-1, 0);
        break;
      case 'KeyD':
      case 'ArrowRight':
        action = this.makeMove(1, 0);
        break;

      // 攻击
      case 'KeyJ':
      case 'Space':
        action = this.makeAttack();
        break;

      // 重置
      case 'KeyR':
        this.game.reset();
        ev.preventDefault();
        return;

      default:
        return;
    }

    if (action) {
      this.game.pushAction(action);
      ev.preventDefault();
    }
  };

  private onKeyUp = (ev: KeyboardEvent): void => {
    this.keysDown.delete(ev.code);
  };

  // ============ Action 工厂 ============

  private makeMove(dx: number, dy: number): Action {
    return {
      type: 'move',
      entityId: BrowserGame.PLAYER_ID,
      payload: { dx, dy },
    };
  }

  private makeAttack(): Action | null {
    const targetId = this.findNearestMonster();
    if (!targetId) return null;
    return {
      type: 'attack',
      entityId: BrowserGame.PLAYER_ID,
      payload: { targetId },
    };
  }

  // ============ 自动寻最近目标 ============

  private findNearestMonster(): EntityId | null {
    const player = this.game.getState().entities[BrowserGame.PLAYER_ID];
    if (!player) return null;
    let best: EntityId | null = null;
    let bestDist = Infinity;
    for (const [id, e] of Object.entries(this.game.getState().entities) as [EntityId, SimEntity][]) {
      if (e.kind !== 'monster' || e.hp <= 0) continue;
      const d = Math.abs(e.pos.x - player.pos.x) + Math.abs(e.pos.y - player.pos.y);
      if (d < bestDist) {
        bestDist = d;
        best = id;
      }
    }
    // 必须相邻 (曼哈顿距离 ≤ 1) 才攻击
    return bestDist <= 1 ? best : null;
  }
}