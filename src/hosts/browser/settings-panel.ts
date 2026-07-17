/**
 * src/hosts/browser/settings-panel.ts
 *
 * Day27-28: 设置面板 (Esc)
 * - 音效开关
 * - 显示当前房间 / 操作提示
 */
import { sfx } from '../../render/sfx-gen';
import { defaultRoomId } from './network';

const MUTE_KEY = 'baigui_sfx_muted';

export class SettingsPanel {
  private root: HTMLDivElement;
  private muteBtn: HTMLButtonElement;
  private statusEl: HTMLDivElement;
  private visible = false;

  constructor(container: HTMLElement) {
    // 恢复静音偏好
    const muted = localStorage.getItem(MUTE_KEY) === '1';
    sfx.setEnabled(!muted);

    this.root = document.createElement('div');
    this.root.style.cssText = `
      position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%);
      width: min(360px, 90vw);
      background: rgba(16,18,32,0.97); border: 1px solid #7788aa; border-radius: 10px;
      padding: 14px 16px; display: none; z-index: 60; pointer-events: auto;
    `;
    this.root.innerHTML = `
      <div style="font-size:15px;color:#cce;font-weight:bold;margin-bottom:10px">设置</div>
      <button id="__set_mute" style="width:100%;padding:8px;margin-bottom:8px;cursor:pointer;background:#334;color:#def;border:1px solid #668;border-radius:6px"></button>
      <div id="__set_status" style="font-size:12px;color:#aab;line-height:1.5;margin-bottom:8px"></div>
      <div style="font-size:11px;color:#777;line-height:1.45">
        Esc 关闭 · WASD 移动 · J 攻击 · K 技能 · I 背包<br>
        P PvP · O 存档 · R 重开 · 死亡后可复活
      </div>
    `;
    container.appendChild(this.root);
    this.muteBtn = this.root.querySelector('#__set_mute') as HTMLButtonElement;
    this.statusEl = this.root.querySelector('#__set_status') as HTMLDivElement;
    this.muteBtn.addEventListener('click', () => this.toggleMute());
    this.syncMuteLabel();
    this.refreshStatus();
    window.addEventListener('keydown', this.onKey);
  }

  private onKey = (ev: KeyboardEvent): void => {
    if (ev.code === 'Escape' && !ev.repeat) {
      this.toggle();
      ev.preventDefault();
    }
  };

  toggle(): void {
    this.visible = !this.visible;
    this.root.style.display = this.visible ? 'block' : 'none';
    if (this.visible) this.refreshStatus();
  }

  private toggleMute(): void {
    const next = !sfx.isEnabled();
    sfx.setEnabled(next);
    localStorage.setItem(MUTE_KEY, next ? '0' : '1');
    this.syncMuteLabel();
  }

  private syncMuteLabel(): void {
    this.muteBtn.textContent = sfx.isEnabled() ? '🔊 音效: 开 (点击静音)' : '🔇 音效: 静音 (点击开启)';
  }

  private refreshStatus(): void {
    this.statusEl.textContent = `房间参数: ${defaultRoomId()} · 音效 ${sfx.isEnabled() ? '开' : '关'}`;
  }

  dispose(): void {
    window.removeEventListener('keydown', this.onKey);
    this.root.remove();
  }
}
