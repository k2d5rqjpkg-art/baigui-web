/**
 * src/test-helpers/mock-ws.ts
 *
 * Day7+ 补充: 简化版 WebSocket mock
 *
 * 替代 scripts/test-multiplayer.ts 的子进程方案
 *
 * 用法:
 *   import { SimpleWebSocketMock, installMockWebSocket, lastSocket } from '../test-helpers/mock-ws';
 *   beforeEach(() => installMockWebSocket());
 *   afterEach(() => restoreMockWebSocket());
 *
 *   // 测试中:
 *   new GameClient('ws://...');
 *   lastSocket()._fireServerMessage({ type: 'welcome', ... });
 *   expect(lastSocket().sentMessages).toContainEqual(expect.stringContaining('"hello"'));
 */

export class SimpleWebSocketMock {
  static instances: SimpleWebSocketMock[] = [];

  static install(): void {
    const orig = (globalThis as any).WebSocket;
    (globalThis as any).__originalWebSocket = orig;
    (globalThis as any).WebSocket = function (this: any, url: string) {
      const m = new SimpleWebSocketMock(url);
      SimpleWebSocketMock.instances.push(m);
      return m as any;
    };
  }

  static restore(): void {
    (globalThis as any).WebSocket = (globalThis as any).__originalWebSocket;
    SimpleWebSocketMock.instances = [];
  }

  static last(): SimpleWebSocketMock | undefined {
    return SimpleWebSocketMock.instances[SimpleWebSocketMock.instances.length - 1];
  }

  url: string;
  readyState = 0; // CONNECTING
  sentMessages: string[] = [];
  binaryType = 'blob';

  private _onopen: ((e: Event) => void) | null = null;
  private _onmessage: ((e: MessageEvent) => void) | null = null;
  private _onclose: ((e: CloseEvent) => void) | null = null;
  private _onerror: ((e: Event) => void) | null = null;

  constructor(url: string) {
    this.url = url;
    // CONNECTING 异步 → OPEN
    setTimeout(() => this._fireOpen(), 0);
  }

  set onopen(h: any) {
    this._onopen = h;
  }
  get onopen() {
    return this._onopen;
  }
  set onmessage(h: any) {
    this._onmessage = h;
  }
  get onmessage() {
    return this._onmessage;
  }
  set onclose(h: any) {
    this._onclose = h;
  }
  get onclose() {
    return this._onclose;
  }
  set onerror(h: any) {
    this._onerror = h;
  }
  get onerror() {
    return this._onerror;
  }

  send(data: string): void {
    this.sentMessages.push(data);
  }

  close(): void {
    this.readyState = 3;
    this._onclose?.(new CloseEvent('close'));
  }

  // ============ 测试助手 ============

  _fireOpen(): void {
    this.readyState = 1;
    this._onopen?.(new Event('open'));
  }
  _fireServerMessage(data: object): void {
    this._onmessage?.(new MessageEvent('message', { data: JSON.stringify(data) }));
  }
  _fireClose(): void {
    this.readyState = 3;
    this._onclose?.(new CloseEvent('close'));
  }
  _fireError(): void {
    this._onerror?.(new Event('error'));
  }
  /** 等下一个 send */
  waitForSend(timeoutMs = 1000): Promise<string> {
    if (this.sentMessages.length > 0) {
      return Promise.resolve(this.sentMessages[this.sentMessages.length - 1]);
    }
    return new Promise((resolve, reject) => {
      const start = Date.now();
      const interval = setInterval(() => {
        if (this.sentMessages.length > 0) {
          clearInterval(interval);
          resolve(this.sentMessages[this.sentMessages.length - 1]);
        } else if (Date.now() - start > timeoutMs) {
          clearInterval(interval);
          reject(new Error('waitForSend timeout'));
        }
      }, 10);
    });
  }
  /** 解出最近一条 send 的 JSON */
  lastSentJson<T = any>(): T | null {
    const last = this.sentMessages[this.sentMessages.length - 1];
    if (!last) return null;
    try {
      return JSON.parse(last);
    } catch {
      return null;
    }
  }
}

// 默认安装 (vitest setup 阶段)
let installed = false;
export function installMockWebSocket(): void {
  if (!installed) {
    SimpleWebSocketMock.install();
    installed = true;
    // 暴露静态常量 (GameClient 检查 WebSocket.OPEN)
    (globalThis.WebSocket as any).OPEN = 1;
    (globalThis.WebSocket as any).CLOSED = 3;
    (globalThis.WebSocket as any).CONNECTING = 0;
    (globalThis.WebSocket as any).CLOSING = 2;
  }
}
export function restoreMockWebSocket(): void {
  if (installed) {
    SimpleWebSocketMock.restore();
    installed = false;
  }
}
export function lastSocket(): SimpleWebSocketMock | undefined {
  return SimpleWebSocketMock.last();
}

// Mock Event classes for MessageEvent/CloseEvent (Node doesn't have them)
if (typeof MessageEvent === 'undefined') {
  (globalThis as any).MessageEvent = class MessageEvent {
    type = 'message';
    data: any;
    constructor(_type: string, init: any = {}) {
      this.data = init.data;
    }
  };
}
if (typeof CloseEvent === 'undefined') {
  (globalThis as any).CloseEvent = class CloseEvent {
    type = 'close';
    code = 1000;
    reason = '';
    constructor(_type: string, init: any = {}) {
      this.code = init.code ?? 1000;
      this.reason = init.reason ?? '';
    }
  };
}
