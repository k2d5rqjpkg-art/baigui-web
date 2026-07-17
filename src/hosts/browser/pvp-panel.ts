/**
 * src/hosts/browser/pvp-panel.ts
 *
 * Day23: PvP 入队面板 (P 键)
 * - POST /pvp/queue
 * - 匹配成功显示 roomId + 提示用 ?room=
 */
export class PvpPanel {
  private root: HTMLDivElement;
  private statusEl: HTMLDivElement;
  private visible = false;
  private playerId: string;
  private bridgeBase: string;

  constructor(container: HTMLElement, playerId: string = 'browser-p1') {
    this.playerId = playerId;
    // bridge 默认 8787; 开发时可用同源 proxy 或绝对地址
    this.bridgeBase =
      (import.meta as any).env?.VITE_BRIDGE_URL ??
      `${window.location.protocol}//${window.location.hostname}:8787`;

    this.root = document.createElement('div');
    this.root.style.cssText = `
      position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%);
      width: min(380px, 90vw);
      background: rgba(20,10,20,0.96); border: 1px solid #aa5566; border-radius: 10px;
      padding: 14px 16px; display: none; z-index: 50; pointer-events: auto;
    `;
    this.root.innerHTML = `
      <div style="font-size:15px;color:#ee8899;font-weight:bold;margin-bottom:8px">PvP 匹配</div>
      <div style="font-size:11px;color:#888;margin-bottom:10px">P 关闭 · 需要 bridge :8787</div>
      <button id="__pvp_q" style="width:100%;padding:8px;margin-bottom:6px;cursor:pointer;background:#663344;color:#fee;border:1px solid #aa6677;border-radius:6px">入队匹配</button>
      <button id="__pvp_c" style="width:100%;padding:8px;margin-bottom:8px;cursor:pointer;background:#333;color:#ccc;border:1px solid #555;border-radius:6px">取消</button>
      <div id="__pvp_status" style="font-size:12px;color:#f5c8d0;line-height:1.4;min-height:40px">待命</div>
    `;
    container.appendChild(this.root);
    this.statusEl = this.root.querySelector('#__pvp_status') as HTMLDivElement;
    this.root.querySelector('#__pvp_q')!.addEventListener('click', () => this.enqueue());
    this.root.querySelector('#__pvp_c')!.addEventListener('click', () => this.cancel());
    window.addEventListener('keydown', this.onKey);
  }

  private onKey = (ev: KeyboardEvent): void => {
    if (ev.code === 'KeyP' && !ev.repeat) {
      this.toggle();
      ev.preventDefault();
    }
  };

  toggle(): void {
    this.visible = !this.visible;
    this.root.style.display = this.visible ? 'block' : 'none';
  }

  private async enqueue(): Promise<void> {
    this.statusEl.textContent = '入队中…';
    try {
      const res = await fetch(`${this.bridgeBase}/pvp/queue`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ playerId: this.playerId, rating: 1200 }),
      });
      const data = await res.json();
      if (data.match?.roomId) {
        this.statusEl.innerHTML = `匹配成功!<br>房间 <b>${data.match.roomId}</b><br>3 秒后跳转…`;
        // Day34: 自动进房
        setTimeout(() => {
          const url = new URL(window.location.href);
          url.searchParams.set('room', data.match.roomId);
          window.location.href = url.toString();
        }, 1500);
      } else {
        this.statusEl.textContent = `已入队，等待对手 (queue=${data.queueSize})`;
      }
    } catch (err) {
      this.statusEl.textContent = `失败: bridge 未启动? ${String(err)}`;
    }
  }

  private async cancel(): Promise<void> {
    try {
      await fetch(`${this.bridgeBase}/pvp/cancel`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ playerId: this.playerId }),
      });
      this.statusEl.textContent = '已取消';
    } catch (err) {
      this.statusEl.textContent = `取消失败: ${String(err)}`;
    }
  }

  dispose(): void {
    window.removeEventListener('keydown', this.onKey);
    this.root.remove();
  }
}
