/**
 * src/hosts/browser/network.ts
 *
 * Day4: WebSocket 客户端
 *
 * 协议 (与 server/server.ts 一致):
 *   client → server:
 *     {"type":"hello", "slotId": 1}        ← 加入房间
 *     {"type":"intent", "action": 0..5}    ← Discrete action
 *   server → client:
 *     {"type":"welcome", "entityId", "snapshot"}
 *     {"type":"state", "tick", "entities", "events"}
 *     {"type":"error", "message"}
 *
 * 设计:
 *   - 自动重连 (指数退避 1s → 2s → 4s → 8s, 最大 8s)
 *   - 回调: onWelcome / onState / onError / onClose
 *   - intent 队列 (断线时缓存, 重连后 flush)
 *   - 单例 ws 实例 (避免重复连接)
 */

import type { GameEvent, SimEntity } from '../../core/sim';
import { log } from '../../core/log';

export type WsEventType = 'welcome' | 'state' | 'error';

export interface WelcomeMessage {
  type: 'welcome';
  entityId: string;
  room: string;
  tick: number;
  snapshot: { tick: number; entities: SimEntity[] };
}

export interface StateMessage {
  type: 'state';
  tick: number;
  entities: SimEntity[];
  events: GameEvent[];
}

export interface ErrorMessage {
  type: 'error';
  message: string;
}

export interface ContentMessage {
  type: 'content';
  content: any;
}

export type ServerMessage = WelcomeMessage | StateMessage | ErrorMessage | ContentMessage;

export class GameClient {
  private url: string;
  private ws: WebSocket | null = null;
  // 回调字段 (唯一回调源): 由外部 (BrowserGame.attachNetworkClient 或 main.ts) 赋值
  onWelcome: ((msg: WelcomeMessage) => void) | undefined;
  onState: ((msg: StateMessage) => void) | undefined;
  onError: ((msg: ErrorMessage) => void) | undefined;
  onClose: ((event: CloseEvent) => void) | undefined;
  onOpen: (() => void) | undefined;
  /** Day6.1: 独立的 content 更新 (quest + npcs, server 单独广播) */
  onContent: ((content: any) => void) | undefined;
  private reconnectDelay = 1000;
  private readonly MAX_RECONNECT_DELAY = 8000;
  private pendingIntents: number[] = [];
  private connected = false;
  private disposed = false;

  constructor(url: string) {
    this.url = url;
    this.connect();
  }

  /** 发送 hello 加入房间 (Day16: 可选 roomId) */
  hello(slotId: number, roomId?: string): void {
    this.send({ type: 'hello', slotId, ...(roomId ? { roomId } : {}) });
  }

  /** 发送 Discrete intent (0..5) */
  sendIntent(action: number): void {
    if (!this.connected) {
      // 断线时缓存
      this.pendingIntents.push(action);
      return;
    }
    this.send({ type: 'intent', action });
  }

  /** 关闭连接 (清理用) */
  close(): void {
    this.disposed = true;
    if (this.ws) {
      try {
        this.ws.close();
      } catch {
        /* ignore */
      }
      this.ws = null;
    }
  }

  /** 是否已连接 */
  isConnected(): boolean {
    return this.connected;
  }

  // ============ 内部 ============

  private connect(): void {
    if (this.disposed) return;

    try {
      this.ws = new WebSocket(this.url);
    } catch (err) {
      log.error('[client] WebSocket construct failed:', err);
      this.scheduleReconnect();
      return;
    }

    this.ws.onopen = () => {
      this.connected = true;
      this.reconnectDelay = 1000; // 重置退避
      log.info('[client] connected to', this.url);
      // flush pending intents
      const queued = this.pendingIntents.splice(0);
      for (const a of queued) {
        this.send({ type: 'intent', action: a });
      }
      this.onOpen?.();
    };

    this.ws.onmessage = (ev) => {
      try {
        const msg = JSON.parse(String(ev.data)) as ServerMessage;
        switch (msg.type) {
          case 'welcome':
            this.onWelcome?.(msg);
            break;
          case 'state':
            this.onState?.(msg);
            break;
          case 'content':
            this.onContent?.(msg.content);
            break;
          case 'error':
            log.warn('[client] server error:', msg.message);
            this.onError?.(msg);
            break;
        }
      } catch (err) {
        log.error('[client] bad message:', err);
      }
    };

    this.ws.onclose = (ev) => {
      this.connected = false;
      this.onClose?.(ev);
      if (!this.disposed) {
        this.scheduleReconnect();
      }
    };

    this.ws.onerror = (ev) => {
      log.warn('[client] ws error:', ev);
      // onclose 会跟着触发
    };
  }

  private scheduleReconnect(): void {
    if (this.disposed) return;
    const delay = this.reconnectDelay;
    this.reconnectDelay = Math.min(this.reconnectDelay * 2, this.MAX_RECONNECT_DELAY);
    log.info(`[client] reconnect in ${delay}ms`);
    setTimeout(() => this.connect(), delay);
  }

  private send(msg: object): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;
    try {
      this.ws.send(JSON.stringify(msg));
    } catch (err) {
      log.error('[client] send failed:', err);
    }
  }
}

/** 默认 WebSocket URL (dev: vite proxy /ws → 8787; prod: 同源 /ws) */
export function defaultWsUrl(): string {
  const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  return `${proto}//${window.location.host}/ws`;
}