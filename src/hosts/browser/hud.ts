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
import type { GameEvent, SimEntity, EntityId } from '../../core/sim';

const MAX_LOG = 6;

export class GameHud {
  private game: BrowserGame;
  private root: HTMLDivElement;
  private hpBar: HTMLDivElement;
  private hpText: HTMLDivElement;
  private levelText: HTMLDivElement;
  private atkDefText: HTMLDivElement;
  private xpBar: HTMLDivElement;
  private xpText: HTMLDivElement;
  private skillText: HTMLDivElement;
  private invText: HTMLDivElement;
  private logBox: HTMLDivElement;
  private helpBox: HTMLDivElement;
  private gameOverBox: HTMLDivElement;

  private unsubEvent: () => void;
  // Day6.1: 任务 + NPC 对话
  private questBox: HTMLDivElement;
  private questTitle: HTMLDivElement;
  private questDesc: HTMLDivElement;
  private questObj: HTMLDivElement;
  private dialogueOverlay: HTMLDivElement | null = null;
  private dialogueTextShown = false;

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
      <div id="__level" style="font-size:12px;margin-top:6px;color:#d4a017">Lv.1</div>
      <div style="font-size:11px;color:#888;margin-top:4px">XP</div>
      <div id="__xpbar" style="width:200px;height:8px;background:#1a1a33;border:1px solid #444466;border-radius:3px;overflow:hidden;margin-top:2px">
        <div id="__xpfill" style="width:0%;height:100%;background:linear-gradient(90deg,#4488ff,#66aaff);transition:width 200ms"></div>
      </div>
      <div id="__xptext" style="font-size:11px;margin-top:2px;color:#88aacc">0 / 100</div>
      <div id="__atkdef" style="font-size:11px;margin-top:4px;color:#aaa">ATK 30 · DEF 5</div>
      <div id="__skillpts" style="font-size:11px;margin-top:2px;color:#88cc88">技能点 0</div>
      <div id="__inv" style="font-size:11px;margin-top:6px;color:#bbb;line-height:1.35;max-width:220px">背包 0</div>
    `;
    this.root.appendChild(topLeft);

    this.hpBar = topLeft.querySelector('#__hpfill') as HTMLDivElement;
    this.hpText = topLeft.querySelector('#__hptext') as HTMLDivElement;
    this.levelText = topLeft.querySelector('#__level') as HTMLDivElement;
    this.atkDefText = topLeft.querySelector('#__atkdef') as HTMLDivElement;
    this.xpBar = topLeft.querySelector('#__xpfill') as HTMLDivElement;
    this.xpText = topLeft.querySelector('#__xptext') as HTMLDivElement;
    this.skillText = topLeft.querySelector('#__skillpts') as HTMLDivElement;
    this.invText = topLeft.querySelector('#__inv') as HTMLDivElement;

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
      <div>WASD/方向键: 移动 · J/空格: 攻击 · K: 技能树 · 自动拾取 · R: 重置</div>
    `;
    this.root.appendChild(bottomLeft);
    this.helpBox = bottomLeft;

    // === 右上 当前任务 (Day6.1) ===
    const q = document.createElement('div');
    q.style.cssText = `
      position: absolute; top: 12px; right: 12px;
      background: rgba(0,0,0,0.6); padding: 10px 14px; border-radius: 6px;
      border: 1px solid #444488; min-width: 260px; max-width: 340px;
      display: none;
    `;
    q.innerHTML = `
      <div style="font-size:13px;color:#d4a017;font-weight:bold;margin-bottom:4px">📜 当前任务</div>
      <div id="__quest_title" style="font-size:14px;color:#f5e6c8"></div>
      <div id="__quest_desc" style="font-size:12px;color:#aaa;margin-top:4px"></div>
      <div id="__quest_obj" style="font-size:12px;color:#88aacc;margin-top:4px"></div>
    `;
    this.root.appendChild(q);
    this.questBox = q;
    this.questTitle = q.querySelector('#__quest_title') as HTMLDivElement;
    this.questDesc = q.querySelector('#__quest_desc') as HTMLDivElement;
    this.questObj = q.querySelector('#__quest_obj') as HTMLDivElement;

    // 注册 content 更新回调
    game.onContentUpdate((content: any) => this.handleContent(content));

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
    // Day15: XP 进度条 + 技能点
    const xpNeed = Math.max(1, p.xpToNext);
    const xpRatio = Math.max(0, Math.min(1, p.xp / xpNeed));
    this.xpBar.style.width = `${xpRatio * 100}%`;
    this.xpText.textContent = `${p.xp} / ${p.xpToNext}`;
    this.skillText.textContent = `技能点 ${p.skillPoints}`;
    this.skillText.style.color = p.skillPoints > 0 ? '#aaff88' : '#88cc88';
    // Day21: 背包/装备
    const eq = Object.entries(p.equipment ?? {});
    const eqStr = eq.length ? eq.map(([s, n]) => `${s}:${n}`).join(' · ') : '无';
    const invStr = p.inventoryNames?.length ? p.inventoryNames.join(', ') : '空';
    this.invText.textContent = `背包装备 ${p.inventoryCount} | ${eqStr}\n${invStr}`;
    this.invText.style.whiteSpace = 'pre-wrap';
  }

  /** 处理战斗事件, 写日志 */
  private handleEvent(e: GameEvent): void {
    let text = '';
    let color = '#f5e6c8';

    switch (e.type) {
      case 'damage': {
        // narrowed by e.type, data 一定是 DamageData (combat.ts 保证)
        const amt = 'amount' in e.data ? e.data.amount : 0;
        const crit = 'crit' in e.data ? e.data.crit : false;
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
      case 'level_up': {
        const lv = 'newLevel' in e.data ? e.data.newLevel : '?';
        text = `⬆ 升级! Lv.${lv}`;
        color = '#66ff99';
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

  // ============ Day6.1: 任务 + NPC 对话 ============

  /** 收到 content 时显示/隐藏 quest 面板 */
  private handleContent(content: any): void {
    if (content?.quest?.title) {
      this.questTitle.textContent = `「${content.quest.title}」`;
      this.questDesc.textContent = content.quest.description ?? '';
      this.questObj.textContent = `目标: ${content.quest.objective}  |  奖励: ${content.quest.reward}`;
      this.questBox.style.display = 'block';
    } else {
      this.questBox.style.display = 'none';
    }
  }

  /**
   * 显示对话框 (NPC 对话)
   * 调用者 (GameRenderer 或主循环) 在 NPC 邻接时触发
   */
  showDialogueOverlay(npcName: string, dialogue: { greeting: string; hint: string; farewell: string }): void {
    // 移除旧的
    if (this.dialogueOverlay) this.dialogueOverlay.remove();

    const overlay = document.createElement('div');
    overlay.style.cssText = `
      position: absolute; inset: 20%; pointer-events: auto; z-index: 20;
      background: rgba(10,10,30,0.92); border: 2px solid #8888bb; border-radius: 12px;
      padding: 24px; display: flex; flex-direction: column; align-items: center; gap: 12px;
    `;
    overlay.innerHTML = `
      <div style="color:#d4a017;font-size:18px;font-weight:bold">${npcName}</div>
      <div style="color:#f5e6c8;font-size:14px;text-align:center;margin:8px 0">${dialogue.greeting}</div>
      <div style="color:#bbcccc;font-size:13px;text-align:center;font-style:italic">${dialogue.hint}</div>
      <div style="color:#aaa;font-size:13px;text-align:center;margin-top:8px">${dialogue.farewell}</div>
      <div style="color:#666;font-size:11px;margin-top:8px">[ 点击或按 ESC 关闭 ]</div>
    `;
    overlay.addEventListener('click', () => overlay.remove());
    const closeHandler = (ev: KeyboardEvent) => {
      if (ev.code === 'Escape' || ev.code === 'Space') {
        overlay.remove();
        window.removeEventListener('keydown', closeHandler);
      }
    };
    window.addEventListener('keydown', closeHandler);

    this.root.appendChild(overlay);
    this.dialogueOverlay = overlay;
  }

  private nameOf(id: EntityId): string {
    const e: SimEntity | undefined = this.game.getState().entities[id];
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