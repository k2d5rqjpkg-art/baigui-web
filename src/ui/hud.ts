/**
 * 游戏 HUD — HTML 覆盖层
 * 血条、经验条、等级、金币、技能、消息、伤害浮动、模态框
 */

import { Skill } from '../core/components';

export class HUD {
  private element: HTMLDivElement;
  private hpBar: HTMLDivElement;
  private hpText: HTMLSpanElement;
  private xpBar: HTMLDivElement;
  private levelText: HTMLSpanElement;
  private goldText: HTMLSpanElement;
  private skillsContainer: HTMLDivElement;
  private messageBox: HTMLDivElement;
  private modalOverlay: HTMLDivElement;
  private damageLayer: HTMLDivElement;
  private messages: { text: string; timer: number }[] = [];

  constructor(container: HTMLElement) {
    this.element = document.createElement('div');
    this.element.id = 'hud-container';
    this.element.style.cssText = `
      position: absolute; top: 0; left: 0; width: 100%; height: 100%;
      pointer-events: none; font-family: 'Microsoft YaHei', sans-serif;
      color: #f5e6c8; z-index: 10;
    `;

    // ---- 左上：血条 ----
    const hpContainer = document.createElement('div');
    hpContainer.style.cssText = `position:absolute;top:16px;left:16px;width:200px;height:20px;background:#333;border:2px solid #666;border-radius:4px;overflow:hidden;`;
    this.hpBar = document.createElement('div');
    this.hpBar.style.cssText = `width:100%;height:100%;background:linear-gradient(90deg,#c0392b,#e74c3c);transition:width 0.15s;`;
    hpContainer.appendChild(this.hpBar);
    this.hpText = document.createElement('span');
    this.hpText.style.cssText = `position:absolute;top:16px;left:224px;font-size:16px;line-height:20px;text-shadow:1px 1px 2px #000;`;
    this.hpText.textContent = '100/100';

    // ---- 左上第二行：经验条 ----
    const xpContainer = document.createElement('div');
    xpContainer.style.cssText = `position:absolute;top:42px;left:16px;width:200px;height:10px;background:#222;border:1px solid #555;border-radius:3px;overflow:hidden;`;
    this.xpBar = document.createElement('div');
    this.xpBar.style.cssText = `width:0%;height:100%;background:linear-gradient(90deg,#2d7d3a,#2ecc71);transition:width 0.2s;`;
    xpContainer.appendChild(this.xpBar);

    // ---- 等级 ----
    this.levelText = document.createElement('span');
    this.levelText.style.cssText = `position:absolute;top:42px;left:224px;font-size:13px;text-shadow:1px 1px 2px #000;color:#d4a017;`;
    this.levelText.textContent = 'Lv.1';

    // ---- 金币 ----
    this.goldText = document.createElement('span');
    this.goldText.style.cssText = `position:absolute;top:58px;left:16px;font-size:13px;text-shadow:1px 1px 2px #000;color:#f5e6c8;`;
    this.goldText.textContent = '💰 0';

    // ---- 技能栏（底部中间） ----
    this.skillsContainer = document.createElement('div');
    this.skillsContainer.style.cssText = `
      position:absolute;bottom:10px;left:50%;transform:translateX(-50%);
      display:flex;gap:6px;pointer-events:none;
    `;

    // ---- 消息（底部偏上） ----
    this.messageBox = document.createElement('div');
    this.messageBox.style.cssText = `
      position:absolute;bottom:80px;left:50%;transform:translateX(-50%);
      text-align:center;font-size:15px;text-shadow:1px 1px 3px #000;
      min-height:60px;white-space:pre-line;
    `;

    // ---- 伤害浮动层 ----
    this.damageLayer = document.createElement('div');
    this.damageLayer.style.cssText = `
      position:absolute;top:0;left:0;width:100%;height:100%;
      pointer-events:none;overflow:hidden;
    `;

    // ---- 模态框 ----
    this.modalOverlay = document.createElement('div');
    this.modalOverlay.style.cssText = `
      position:absolute;top:0;left:0;width:100%;height:100%;
      background:rgba(0,0,0,0.7);display:flex;align-items:center;justify-content:center;
      pointer-events:auto;z-index:100;
    `;

    this.element.appendChild(hpContainer);
    this.element.appendChild(this.hpText);
    this.element.appendChild(xpContainer);
    this.element.appendChild(this.levelText);
    this.element.appendChild(this.goldText);
    this.element.appendChild(this.skillsContainer);
    this.element.appendChild(this.messageBox);
    this.element.appendChild(this.damageLayer);
    container.appendChild(this.element);
  }

  setHP(current: number, max: number) {
    const pct = Math.max(0, Math.min(100, (current / max) * 100));
    this.hpBar.style.width = `${pct}%`;
    this.hpBar.style.background =
      pct < 25
        ? 'linear-gradient(90deg,#e74c3c,#c0392b)'
        : 'linear-gradient(90deg,#c0392b,#e74c3c)';
    this.hpText.textContent = `${Math.ceil(current)}/${max}`;
  }

  showXP(current: number, next: number) {
    const pct = next > 0 ? (current / next) * 100 : 0;
    this.xpBar.style.width = `${Math.min(100, pct)}%`;
  }

  showLevel(level: number) {
    this.levelText.textContent = `Lv.${level}`;
  }

  showGold(gold: number) {
    this.goldText.textContent = `💰 ${gold}`;
  }

  showSkills(skills: Skill[]) {
    this.skillsContainer.innerHTML = skills
      .map((s, i) => {
        const ready = s.currentCooldown <= 0;
        const cdText = s.currentCooldown > 0 ? s.currentCooldown.toFixed(1) : '';
        return `
        <div style="
          width:52px;height:52px;background:rgba(0,0,0,0.6);border:2px solid ${ready ? s.color : '#555'};
          border-radius:6px;display:flex;flex-direction:column;align-items:center;justify-content:center;
          font-size:10px;color:${ready ? '#fff' : '#666'};position:relative;
        ">
          <div style="font-size:16px;font-weight:bold;color:${s.color}">${i + 1}</div>
          <div style="font-size:9px;margin-top:2px">${s.name}</div>
          ${cdText ? `<div style="position:absolute;inset:0;background:rgba(0,0,0,0.5);display:flex;align-items:center;justify-content:center;font-size:14px;font-weight:bold;color:#e74c3c">${cdText}</div>` : ''}
        </div>
      `;
      })
      .join('');
  }

  showMessage(text: string, duration = 3) {
    this.messages.push({ text, timer: duration });
  }

  /** 伤害数字浮动 */
  showDamageNumber(damage: number, worldX: number, worldY: number) {
    // 世界坐标转屏幕坐标 — game-scene 的相机决定了映射
    // 简化：直接用百分比定位，世界坐标 [-10,10] → 屏幕百分比 [10%, 90%]
    const pctX = 50 + (worldX / 10) * 40;
    const pctY = 50 + (-worldY / 10) * 40; // y 翻转

    const el = document.createElement('div');
    el.textContent = `-${damage}`;
    el.style.cssText = `
      position:absolute;left:${pctX}%;top:${pctY}%;transform:translate(-50%,-50%);
      color:#e74c3c;font-size:${20 + Math.min(damage, 40)}px;font-weight:bold;
      text-shadow:2px 2px 3px #000;pointer-events:none;
      transition:all 0.8s ease-out;opacity:1;
    `;
    this.damageLayer.appendChild(el);

    requestAnimationFrame(() => {
      el.style.top = `${pctY - 15}%`;
      el.style.opacity = '0';
    });

    setTimeout(() => {
      if (el.parentNode) el.remove();
    }, 900);
  }

  showModal(html: string) {
    this.modalOverlay.innerHTML = html;
    if (!this.modalOverlay.parentNode) {
      this.element.appendChild(this.modalOverlay);
    }
    this.modalOverlay.style.display = 'flex';
  }

  closeModal() {
    this.modalOverlay.style.display = 'none';
  }

  update(delta: number) {
    // 消息淡出
    this.messages = this.messages.filter((m) => {
      m.timer -= delta;
      return m.timer > 0;
    });
    this.messageBox.innerHTML = this.messages
      .map((m, i) => `<div style="opacity:${Math.min(1, m.timer)}">${m.text}</div>`)
      .join('');
  }
}
