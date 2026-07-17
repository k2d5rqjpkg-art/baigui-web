/**
 * src/hosts/browser/advisor-panel.ts
 *
 * v1.1: AI 顾问面板 (HUD 左下角)
 *
 * 显示:
 *   - 当前目标 (goal)
 *   - LLM 给出的一句话原因
 *   - 来源 (LLM / 缓存 / fallback)
 *   - 1Hz 自动更新
 *
 * 不影响游戏逻辑, 只是 UI 提示
 */
import type { GameState, SimEntity } from '../../core/sim';
import { log } from '../../core/log';
import { suggestNextAction, fallbackAdvisor } from '../../core/llm/advisor';
import type { AdvisorSuggestion } from '../../core/llm/advisor';

export class AdvisorPanel {
  private root: HTMLDivElement;
  private goalEl: HTMLDivElement;
  private reasonEl: HTMLDivElement;
  private sourceEl: HTMLSpanElement;
  private current: AdvisorSuggestion | null = null;
  private intervalId: number | null = null;
  private apiKey: string | undefined;

  constructor(container: HTMLElement, apiKey?: string) {
    this.apiKey = apiKey;
    this.root = document.createElement('div');
    this.root.style.cssText = `
      position: absolute; left: 12px; bottom: 220px;
      width: 240px; padding: 10px 12px;
      background: rgba(26, 26, 46, 0.85); color: #f5e6c8;
      font-family: 'Microsoft YaHei', sans-serif; font-size: 12px;
      border: 1px solid #d4a017; border-radius: 4px;
      display: none;
    `;
    this.root.innerHTML = `
      <div style="color: #d4a017; font-weight: bold; margin-bottom: 6px;">
        🤖 AI 顾问
      </div>
      <div data-goal style="font-size: 14px; font-weight: bold;"></div>
      <div data-reason style="margin-top: 4px; color: #ccc; font-size: 11px;"></div>
      <div style="margin-top: 6px; font-size: 10px; color: #888;">
        来源: <span data-source style="color: #888;"></span>
      </div>
    `;
    container.appendChild(this.root);
    this.goalEl = this.root.querySelector('[data-goal]')!;
    this.reasonEl = this.root.querySelector('[data-reason]')!;
    this.sourceEl = this.root.querySelector('[data-source]')!;
  }

  /** 启动 1Hz 调 LLM 拿建议 */
  start(getState: () => GameState | null, getPlayer: () => SimEntity | null): void {
    if (this.intervalId !== null) return;
    this.intervalId = window.setInterval(async () => {
      const state = getState();
      const player = getPlayer();
      if (!state || !player) return;
      try {
        this.current = await suggestNextAction(player, state, this.apiKey);
        this.render();
      } catch (err) {
        log.warn('[advisor-panel] update failed:', err);
        this.current = fallbackAdvisor(player, state);
        this.render();
      }
    }, 1000);
    this.root.style.display = 'block';
    log.info('[advisor-panel] started, 1Hz refresh');
  }

  stop(): void {
    if (this.intervalId !== null) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
    this.root.style.display = 'none';
    log.info('[advisor-panel] stopped');
  }

  private render(): void {
    if (!this.current) return;
    const goalLabels: Record<string, string> = {
      attack: '⚔️ 攻击',
      retreat: '🏃 撤退',
      heal: '💊 治疗',
      explore: '🗺️ 探索',
      quest: '📜 任务',
      talk: '💬 对话',
      idle: '⏸️ 等待',
    };
    this.goalEl.textContent = goalLabels[this.current.goal] || this.current.goal;
    this.reasonEl.textContent = this.current.reason;
    const sourceColors: Record<string, string> = {
      llm: '#d4a017',
      cache: '#8e44ad',
      fallback: '#7f8c8d',
    };
    this.sourceEl.textContent = this.current.source;
    this.sourceEl.style.color = sourceColors[this.current.source] || '#888';
  }

  dispose(): void {
    this.stop();
    this.root.remove();
  }
}
