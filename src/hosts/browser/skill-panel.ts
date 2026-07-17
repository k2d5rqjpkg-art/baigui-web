/**
 * src/hosts/browser/skill-panel.ts
 *
 * Day18: 技能树面板 (K 键切换)
 * - 显示当前职业技能列表
 * - 可学技能高亮, 点击学习
 */
import type { BrowserGame } from './game';
import {
  getSkillsByClass,
  getClass,
  getLearnedSkills,
  getSkillPoints,
  sortByTier,
  type Skill,
} from '../../core/sim/skills';
import type { EntityId } from '../../core/sim/types';

export class SkillPanel {
  private game: BrowserGame;
  private root: HTMLDivElement;
  private listEl: HTMLDivElement;
  private headerEl: HTMLDivElement;
  private visible = false;

  constructor(game: BrowserGame, container: HTMLElement) {
    this.game = game;
    this.root = document.createElement('div');
    this.root.style.cssText = `
      position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%);
      width: min(480px, 92vw); max-height: 70vh; overflow: auto;
      background: rgba(10,10,24,0.95); border: 1px solid #5566aa; border-radius: 10px;
      padding: 14px 16px; display: none; z-index: 50; pointer-events: auto;
      box-shadow: 0 8px 32px rgba(0,0,0,0.6);
    `;
    this.root.innerHTML = `
      <div id="__sk_header" style="font-size:15px;color:#d4a017;font-weight:bold;margin-bottom:10px"></div>
      <div style="font-size:11px;color:#888;margin-bottom:8px">K 关闭 · 点击可学技能</div>
      <div id="__sk_list"></div>
    `;
    this.headerEl = this.root.querySelector('#__sk_header') as HTMLDivElement;
    this.listEl = this.root.querySelector('#__sk_list') as HTMLDivElement;
    container.appendChild(this.root);
    this.root.addEventListener('click', (e) => e.stopPropagation());
    window.addEventListener('keydown', this.onKey);
  }

  private onKey = (ev: KeyboardEvent): void => {
    if (ev.code === 'KeyK' && !ev.repeat) {
      this.toggle();
      ev.preventDefault();
    }
  };

  toggle(): void {
    this.visible = !this.visible;
    this.root.style.display = this.visible ? 'block' : 'none';
    if (this.visible) this.refresh();
  }

  isOpen(): boolean {
    return this.visible;
  }

  hide(): void {
    this.visible = false;
    this.root.style.display = 'none';
  }

  refresh(): void {
    const snap = this.game.getPlayerSnapshot();
    const entity = this.game.getEntities().find((e) => e.id === snap?.id);
    if (!entity || !snap) {
      this.headerEl.textContent = '无玩家';
      this.listEl.innerHTML = '';
      return;
    }
    const cls = getClass(entity);
    const pts = getSkillPoints(entity);
    const learned = new Set(getLearnedSkills(entity));
    this.headerEl.textContent = `技能树 · ${cls} · 技能点 ${pts} · Lv.${snap.level}`;

    const skills = sortByTier(getSkillsByClass(cls));
    this.listEl.innerHTML = '';
    for (const s of skills) {
      const row = document.createElement('div');
      const isLearned = learned.has(s.id);
      const canLearn = !isLearned && pts >= 1 && snap.level >= s.requiredLevel
        && s.prereq.every((p) => learned.has(p));
      row.style.cssText = `
        border: 1px solid ${isLearned ? '#446644' : canLearn ? '#6688cc' : '#333355'};
        background: ${isLearned ? 'rgba(40,80,40,0.4)' : canLearn ? 'rgba(40,50,90,0.5)' : 'rgba(20,20,30,0.5)'};
        border-radius: 6px; padding: 8px 10px; margin-bottom: 6px;
        cursor: ${canLearn ? 'pointer' : 'default'}; opacity: ${isLearned || canLearn ? 1 : 0.55};
      `;
      row.innerHTML = `
        <div style="display:flex;justify-content:space-between;gap:8px">
          <span style="color:#f5e6c8;font-size:13px">${s.name}</span>
          <span style="color:#888;font-size:11px">${s.tier} · ${s.path} · Lv${s.requiredLevel}</span>
        </div>
        <div style="color:#aaa;font-size:11px;margin-top:3px">${s.description}</div>
        <div style="color:#66aacc;font-size:10px;margin-top:2px">${isLearned ? '✓ 已学' : canLearn ? '点击学习' : (s.prereq.length ? `需: ${s.prereq.join(', ')}` : '不可学')}</div>
      `;
      if (canLearn) {
        row.addEventListener('click', () => this.tryLearn(entity.id, s));
      }
      this.listEl.appendChild(row);
    }
  }

  private tryLearn(entityId: EntityId, skill: Skill): void {
    const ok = this.game.learnPlayerSkill(skill.id);
    if (ok) this.refresh();
  }

  dispose(): void {
    window.removeEventListener('keydown', this.onKey);
    this.root.remove();
  }
}
