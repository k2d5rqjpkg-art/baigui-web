/**
 * src/hosts/browser/hud.ts
 *
 * Day2: HUD (HP/level/events/死亡提示)
 *
 * 设计:
 *   - 绝对定位 DOM (盖在 Three.js canvas 上)
 *   - 订阅 game.onEvent 累积战斗日志
 *   - 每 tick 更新 HP/level
 *   - 玩家 hp <= 0 显示 Game Over
 */

import { BrowserGame } from './game';
import type { GameEvent, SimEntity } from '../../core/sim';

const MAX_LOG = 6;

export class GameHud {
  private game: BrowserGame;
  private root: HTMLDivElement;
  private hpBar: HTMLDivElement;
  private hpText: HTMLDivElement;
  private levelText: HTMLDivElement;
  private atkDefText: HTMLDivElement;
  private logBox: HTMLDivElement;
  private helpBox: HTMLDivElement;
  private gameOverBox: HTMLDivElement;

  private unsubEvent: () => void;

  constructor(game: BrowserGame, container: HTMLElement) {
    this.game = game;
    container.style.position = 'relative';
    this.root = document.createElement('div');
    this.root.style.cssText = `
      position: absolute; inset: 0; pointer-events: none;
      font-family: 'Microsoft YaHei', sans-serif;
      color: #f5e6c8; user-select: none;
    `;
    container.appendChild(this.root);

    // === 左上 HP 区 ===
    const topLeft = document.createElement('div');
    topLeft.style.cssText = `
      position: absolute; top: 12px; left: 12px;
      background: rgba(0,0,0,0.6); padding: 10px 14px; border-radius: 6px;
      border: 1px solid #444488; min-width: 220px;
    `;
    topLeft.innerHTML = `
      <div style="font-size:13px;color:#aaa;margin-bottom:4px">HP</div>
      <div id="__hpbar" style="width:200px;height:14px;background:#330000;border:1px solid #663333;border-radius:3px;overflow:hidden">
        <div id="__hpfill" style="width:100%;height:100%;background:linear-gradient(90deg,#cc3333,#ee5555);transition:width 200ms"></div>
      </div>
      <div id="__hptext" style="font-size:12px;margin-top:4px;color:#f5e6c8">100 / 100</div>
      <div id="__level" style="font-size:12px;margin-top:6px;color:#d4a017">Lv.5</div>
      <div id="__atkdef" style="font-size:11px;margin-top:2px;color:#aaa">ATK 30 · DEF 5</div>
    `;
    this.root.appendChild(topLeft);

    this.hpBar = topLeft.querySelector('#__hpfill') as HTMLDivElement;
    this.hpText = topLeft.querySelector('#__hptext') as HTMLDivElement;
    this.levelText = topLeft.querySelector('#__level') as HTMLDivElement;
    this.atkDefText = topLeft.querySelector('#__atkdef') as HTMLDivElement;

    // === 右下 战斗日志 ===
    const bottomRight = document.createElement('div');
    bottomRight.style.cssText = `
      position: absolute; bottom: 12px; right: 12px;
      background: rgba(0,0,0,0.6); padding: 8px 12px; border-radius: 6px;
      border: 1px solid #444488; min-width: 280px; max-width: 380px;
    `;
    bottomRight.innerHTML = `
      <div style="font-size:12px;color:#888;margin-bottom:4px">战斗日志</div>
      <div id="__log" style="font-size:12px;line-height:1.5"></div>
    `;
    this.root.appendChild(bottomRight);
    this.logBox = bottomRight.querySelector('#__log') as HTMLDivElement;

    // === 左下 帮助 ===
    const bottomLeft = document.createElement('div');
    bottomLeft.style.cssText = `
      position: absolute; bottom: 12px; left: 12px;
      background: rgba(0,0,0,0.5); padding: 6px 10px; border-radius: 6px;
      border: 1px solid #333355; font-size: 11px;
    `;
    bottomLeft.innerHTML = `
      <div style="color:#d4a017;margin-bottom:3px">操作</div>
      <div>WASD/方向键: 移动 · J/空格: 攻击 · 自动拾取 · R: 重置</div>
    `;
    this.root.appendChild(bottomLeft);
    this.helpBox = bottomLeft;

    // === Game Over (默认隐藏) ===
    const go = document.createElement('div');
    go.style.cssText = `
      position: absolute; inset: 0; display: none;
      background: rgba(0,0,0,0.7); align-items: center; justify-content: center;
      flex-direction: column; pointer-events: auto; cursor: pointer;
    `;
    go.innerHTML = `
      <div style="font-size:64px;color:#cc3333;font-weight:bold;text-shadow:0 0 20px #ff0000">GAME OVER</div>
      <div style="font-size:18px;color:#aaa;margin-top:20px">点击或按 R 重来</div>
    `;
    go.addEventListener('click', () => game.reset());
    this.root.appendChild(go);
    this.gameOverBox = go;

    // 订阅事件
    this.unsubEvent = game.onEvent((e) => this.handleEvent(e));
    // 死亡回调
    game.onPlayerDeath = () => this.showGameOver();

    // 初次刷新
    this.refresh();
  }

  dispose(): void {
    this.unsubEvent();
    this.root.remove();
  }

  /** 每帧从 game state 刷 HUD */
  refresh(): void {
    const p = this.game.getPlayerSnapshot();
    if (!p) return;
    const ratio = Math.max(0, Math.min(1, p.hp / p.maxHp));
    this.hpBar.style.width = `${ratio * 100}%`;
    this.hpText.textContent = `${p.hp} / ${p.maxHp}`;
    this.levelText.textContent = `Lv.${p.level}`;
    this.atkDefText.textContent = `ATK ${p.atk} · DEF ${p.def}`;
  }

  /** 处理战斗事件, 写日志 */
  private handleEvent(e: GameEvent): void {
    let text = '';
    let color = '#f5e6c8';

    switch (e.type) {
      case 'damage': {
        const amt = (e.data as any)?.amount ?? 0;
        const crit = (e.data as any)?.crit ?? false;
        const srcName = e.source ? this.nameOf(e.source) : '?';
        const tgtName = e.target ? this.nameOf(e.target) : '?';
        text = `${srcName} → ${tgtName}: ${crit ? '暴击!' : ''}-${amt}`;
        color = crit ? '#ff5555' : '#ffaa44';
        break;
      }
      case 'death': {
        const tgtName = e.target ? this.nameOf(e.target) : '?';
        text = `${tgtName} 阵亡`;
        color = '#cc3333';
        break;
      }
      case 'pickup': {
        const tgtName = e.target ? this.nameOf(e.target) : '?';
        text = `拾取 ${tgtName}`;
        color = '#d4a017';
        break;
      }
      case 'move': {
        // 太多 move 事件会刷屏, 跳过
        return;
      }
      case 'unknown_action':
        text = `无效操作`;
        color = '#888';
        break;
      default:
        return;
    }

    const line = document.createElement('div');
    line.textContent = text;
    line.style.color = color;
    this.logBox.insertBefore(line, this.logBox.firstChild);

    // 限制条数
    while (this.logBox.children.length > MAX_LOG) {
      this.logBox.removeChild(this.logBox.lastChild!);
    }

    this.refresh();
  }

  private showGameOver(): void {
    this.gameOverBox.style.display = 'flex';
  }

  private hideGameOver(): void {
    this.gameOverBox.style.display = 'none';
  }

  private nameOf(id: string): string {
    const e: SimEntity | undefined = this.game.getState().entities[id as any];
    if (!e) return id;
    if (e.kind === 'player') return '你';
    if (e.kind === 'monster') return '鬼物';
    if (e.kind === 'item') {
      // inventory[0] 存的是 ItemTemplate id
      const tplId = e.inventory?.[0] ?? id;
      // 简单映射几个常见物品
      const names: Record<string, string> = {
        sword_iron: '玄铁剑',
        sword_steel: '精钢剑',
        sword_legendary: '妖刀村正',
        armor_leather: '皮甲',
        armor_plate: '锁子甲',
        ring_focus: '聚魂戒',
        helm_iron: '铁盔',
      };
      return names[tplId] ?? tplId;
    }
    return id;
  }

  /** 当 game.reset() 调用时, 清掉 Game Over */
  reset(): void {
    this.hideGameOver();
    this.logBox.innerHTML = '';
    this.refresh();
  }
}