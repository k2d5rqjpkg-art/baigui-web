/**
 * src/hosts/browser/hotbar.ts
 *
 * Day39: 技能热键栏 — 数字键 1-3 学/显示 basic 三系技能
 */
import type { BrowserGame } from './game';
import { getClass, getLearnedSkills, getSkillsByClass, sortByTier } from '../../core/sim/skills';

export class SkillHotbar {
  private root: HTMLDivElement;
  private slots: HTMLDivElement[] = [];
  private game: BrowserGame;
  private timer: number | null = null;

  constructor(game: BrowserGame, container: HTMLElement) {
    this.game = game;
    this.root = document.createElement('div');
    this.root.style.cssText = `
      position: absolute; bottom: 48px; left: 50%; transform: translateX(-50%);
      display: flex; gap: 6px; z-index: 25; pointer-events: auto;
    `;
    for (let i = 0; i < 3; i++) {
      const slot = document.createElement('div');
      slot.style.cssText = `
        width: 52px; height: 52px; border: 1px solid #556; border-radius: 8px;
        background: rgba(10,12,24,0.85); color: #cde; font-size: 10px;
        display: flex; flex-direction: column; align-items: center; justify-content: center;
        cursor: pointer; text-align: center; padding: 2px;
      `;
      slot.dataset.index = String(i);
      slot.addEventListener('click', () => this.activate(i));
      this.slots.push(slot);
      this.root.appendChild(slot);
    }
    container.appendChild(this.root);
    window.addEventListener('keydown', this.onKey);
    this.timer = window.setInterval(() => this.refresh(), 500);
    this.refresh();
  }

  private onKey = (ev: KeyboardEvent): void => {
    if (ev.repeat) return;
    if (ev.code === 'Digit1' || ev.code === 'Numpad1') this.activate(0);
    if (ev.code === 'Digit2' || ev.code === 'Numpad2') this.activate(1);
    if (ev.code === 'Digit3' || ev.code === 'Numpad3') this.activate(2);
  };

  private basics() {
    const p = this.game.getEntities().find((e) => e.kind === 'player');
    if (!p) return [];
    const cls = getClass(p);
    return sortByTier(getSkillsByClass(cls).filter((s) => s.tier === 'basic')).slice(0, 3);
  }

  refresh(): void {
    const p = this.game.getEntities().find((e) => e.kind === 'player');
    const learned = new Set(p ? getLearnedSkills(p) : []);
    const skills = this.basics();
    for (let i = 0; i < 3; i++) {
      const s = skills[i];
      const el = this.slots[i]!;
      if (!s) {
        el.innerHTML = `<span style="color:#666">${i + 1}</span>`;
        continue;
      }
      const done = learned.has(s.id);
      el.style.borderColor = done ? '#5a5' : '#668';
      el.style.opacity = done ? '1' : '0.9';
      el.innerHTML = `
        <div style="font-size:9px;color:#888">${i + 1}</div>
        <div style="font-size:11px;color:${done ? '#9f9' : '#def'}">${s.name}</div>
        <div style="font-size:8px;color:#777">${done ? '已学' : '学'}</div>
      `;
    }
  }

  private activate(i: number): void {
    const skills = this.basics();
    const s = skills[i];
    if (!s) return;
    const p = this.game.getEntities().find((e) => e.kind === 'player');
    if (!p) return;
    if (getLearnedSkills(p).includes(s.id)) return; // 被动已生效
    this.game.learnPlayerSkill(s.id);
    this.refresh();
  }

  dispose(): void {
    window.removeEventListener('keydown', this.onKey);
    if (this.timer !== null) clearInterval(this.timer);
    this.root.remove();
  }
}
