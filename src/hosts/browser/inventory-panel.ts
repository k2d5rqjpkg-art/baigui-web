/**
 * src/hosts/browser/inventory-panel.ts
 *
 * Day22: 背包面板 (I 键)
 * - 列出 inventory template ids
 * - 点击装备
 */
import type { BrowserGame } from './game';
import { ITEM_TABLE } from '../../core/sim';

export class InventoryPanel {
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
      width: min(400px, 90vw); max-height: 60vh; overflow: auto;
      background: rgba(10,12,28,0.96); border: 1px solid #668844; border-radius: 10px;
      padding: 14px 16px; display: none; z-index: 50; pointer-events: auto;
      box-shadow: 0 8px 32px rgba(0,0,0,0.55);
    `;
    this.root.innerHTML = `
      <div id="__inv_header" style="font-size:15px;color:#aadd66;font-weight:bold;margin-bottom:8px">背包</div>
      <div style="font-size:11px;color:#888;margin-bottom:8px">I 关闭 · 点击物品装备</div>
      <div id="__inv_list"></div>
    `;
    this.headerEl = this.root.querySelector('#__inv_header') as HTMLDivElement;
    this.listEl = this.root.querySelector('#__inv_list') as HTMLDivElement;
    container.appendChild(this.root);
    this.root.addEventListener('click', (e) => e.stopPropagation());
    window.addEventListener('keydown', this.onKey);
  }

  private onKey = (ev: KeyboardEvent): void => {
    if (ev.code === 'KeyI' && !ev.repeat) {
      this.toggle();
      ev.preventDefault();
    }
  };

  toggle(): void {
    this.visible = !this.visible;
    this.root.style.display = this.visible ? 'block' : 'none';
    if (this.visible) this.refresh();
  }

  refresh(): void {
    const p = this.game.getPlayerSnapshot();
    if (!p) {
      this.headerEl.textContent = '背包 · 无玩家';
      this.listEl.innerHTML = '';
      return;
    }
    const entity = this.game.getEntities().find((e) => e.id === p.id);
    const inv = entity?.inventory ?? [];
    this.headerEl.textContent = `背包 · ${inv.length} 件 · 装备 ${Object.keys(p.equipment).length}`;

    this.listEl.innerHTML = '';
    if (inv.length === 0) {
      this.listEl.innerHTML = `<div style="color:#666;font-size:12px">空 · 拾取地上物品可装备</div>`;
      return;
    }
    for (const id of inv) {
      const tpl = ITEM_TABLE.find((it) => it.id === id);
      const name = tpl?.name ?? id;
      const slot = tpl?.slot ?? '?';
      const rarity = tpl?.rarity ?? 'common';
      const row = document.createElement('div');
      row.style.cssText = `
        border: 1px solid #445533; border-radius: 6px; padding: 8px 10px; margin-bottom: 6px;
        cursor: pointer; background: rgba(30,40,20,0.5);
      `;
      row.innerHTML = `
        <div style="display:flex;justify-content:space-between">
          <span style="color:#e8f5c8;font-size:13px">${name}</span>
          <span style="color:#888;font-size:11px">${slot} · ${rarity}</span>
        </div>
        <div style="color:#88aa66;font-size:10px;margin-top:2px">点击装备</div>
      `;
      row.addEventListener('click', () => {
        if (this.game.equipInventoryItem(id)) this.refresh();
      });
      this.listEl.appendChild(row);
    }

    // 当前装备
    const eq = Object.entries(p.equipment);
    if (eq.length) {
      const box = document.createElement('div');
      box.style.cssText =
        'margin-top:10px;padding-top:8px;border-top:1px solid #334422;font-size:11px;color:#99aa88';
      box.textContent = '已装备: ' + eq.map(([s, n]) => `${s}=${n}`).join(' · ');
      this.listEl.appendChild(box);
    }
  }

  dispose(): void {
    window.removeEventListener('keydown', this.onKey);
    this.root.remove();
  }
}
