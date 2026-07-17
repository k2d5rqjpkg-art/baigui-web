/**
 * src/hosts/browser/save-load.ts
 *
 * Day24: 本地存档 / 读档 (localStorage)
 * - 存: level/xp/inventory/equipment/class buffs 摘要
 * - 读: 重建玩家字段 (不改 map seed 时尽量保留)
 */
import type { BrowserGame } from './game';
import { getXp } from '../../core/sim/progression';
import { getClass, getSkillPoints, getLearnedSkills } from '../../core/sim/skills';
import type { EntityId } from '../../core/sim/types';

const SAVE_KEY = 'baigui_local_save_v1';

export interface LocalSave {
  version: 1;
  savedAt: number;
  level: number;
  xp: number;
  hp: number;
  maxHp: number;
  atk: number;
  def: number;
  inventory: string[];
  equipment: Record<string, string>;
  classKind: string;
  skillPoints: number;
  learnedSkills: string[];
}

export function exportPlayerSave(game: BrowserGame): LocalSave | null {
  const snap = game.getPlayerSnapshot();
  const ent = game.getEntities().find((e) => e.id === snap?.id);
  if (!snap || !ent) return null;
  return {
    version: 1,
    savedAt: Date.now(),
    level: snap.level,
    xp: getXp(ent),
    hp: snap.hp,
    maxHp: snap.maxHp,
    atk: snap.atk,
    def: snap.def,
    inventory: [...(ent.inventory ?? [])],
    equipment: { ...(ent.equipment as Record<string, string>) },
    classKind: getClass(ent),
    skillPoints: getSkillPoints(ent),
    learnedSkills: getLearnedSkills(ent),
  };
}

export function writeSave(save: LocalSave): void {
  localStorage.setItem(SAVE_KEY, JSON.stringify(save));
}

export function readSave(): LocalSave | null {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) return null;
    const data = JSON.parse(raw) as LocalSave;
    if (data.version !== 1) return null;
    return data;
  } catch {
    return null;
  }
}

/** 把存档应用到当前玩家 entity (本地模式) */
export function applySaveToGame(game: BrowserGame, save: LocalSave): boolean {
  // 通过公开 API: 需要 mutate state — 用 game 内部方法
  return game.applyLocalSave(save);
}

export class SaveLoadPanel {
  private root: HTMLDivElement;
  private statusEl: HTMLDivElement;
  private visible = false;
  private game: BrowserGame;

  constructor(game: BrowserGame, container: HTMLElement) {
    this.game = game;
    this.root = document.createElement('div');
    this.root.style.cssText = `
      position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%);
      width: min(360px, 90vw);
      background: rgba(12,16,28,0.96); border: 1px solid #5577aa; border-radius: 10px;
      padding: 14px 16px; display: none; z-index: 50; pointer-events: auto;
    `;
    this.root.innerHTML = `
      <div style="font-size:15px;color:#88aaff;font-weight:bold;margin-bottom:8px">存档 / 读档</div>
      <div style="font-size:11px;color:#888;margin-bottom:10px">O 关闭 · 本地 localStorage</div>
      <button id="__sv_save" style="width:100%;padding:8px;margin-bottom:6px;cursor:pointer;background:#334466;color:#def;border:1px solid #6688cc;border-radius:6px">保存</button>
      <button id="__sv_load" style="width:100%;padding:8px;margin-bottom:8px;cursor:pointer;background:#333;color:#ccc;border:1px solid #555;border-radius:6px">读取</button>
      <div id="__sv_status" style="font-size:12px;color:#cde;line-height:1.4">—</div>
    `;
    container.appendChild(this.root);
    this.statusEl = this.root.querySelector('#__sv_status') as HTMLDivElement;
    this.root.querySelector('#__sv_save')!.addEventListener('click', () => this.save());
    this.root.querySelector('#__sv_load')!.addEventListener('click', () => this.load());
    window.addEventListener('keydown', this.onKey);
    this.refreshStatus();
  }

  private onKey = (ev: KeyboardEvent): void => {
    if (ev.code === 'KeyO' && !ev.repeat) {
      this.toggle();
      ev.preventDefault();
    }
  };

  toggle(): void {
    this.visible = !this.visible;
    this.root.style.display = this.visible ? 'block' : 'none';
    if (this.visible) this.refreshStatus();
  }

  private refreshStatus(): void {
    const s = readSave();
    if (!s) {
      this.statusEl.textContent = '无存档';
      return;
    }
    this.statusEl.textContent = `存档 Lv.${s.level} · ${s.inventory.length} 物 · ${new Date(s.savedAt).toLocaleString()}`;
  }

  private save(): void {
    const data = exportPlayerSave(this.game);
    if (!data) {
      this.statusEl.textContent = '保存失败: 无玩家';
      return;
    }
    writeSave(data);
    this.statusEl.textContent = `已保存 Lv.${data.level} · ${data.inventory.length} 物`;
  }

  private load(): void {
    const data = readSave();
    if (!data) {
      this.statusEl.textContent = '无存档可读取';
      return;
    }
    const ok = applySaveToGame(this.game, data);
    this.statusEl.textContent = ok
      ? `已读取 Lv.${data.level} · 技能点 ${data.skillPoints}`
      : '读取失败 (network 模式?)';
  }

  dispose(): void {
    window.removeEventListener('keydown', this.onKey);
    this.root.remove();
  }
}
