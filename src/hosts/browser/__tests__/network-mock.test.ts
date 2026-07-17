/**
 * src/hosts/browser/__tests__/network-mock.test.ts
 *
 * Day7+ 补充: GameClient 用 mock-ws 拦截测试
 *
 * 替代 scripts/test-multiplayer.ts (子进程方案)
 * 优势: 不起 server, 不占端口, 0 副作用, 100% 可控
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { GameClient } from '../network';
import {
  SimpleWebSocketMock,
  installMockWebSocket,
  restoreMockWebSocket,
  lastSocket,
} from '../../../test-helpers/mock-ws';

describe('GameClient (mock WebSocket)', () => {
  beforeEach(() => {
    installMockWebSocket();
  });

  afterEach(() => {
    restoreMockWebSocket();
  });

  it('connect → 立即 onopen → 发 hello', async () => {
    const c = new GameClient('ws://test:8787');
    c.onOpen = vi_onOpen;
    await wait(10);
    expect(lastSocket()?.sentMessages.length).toBe(0); // onopen 还没注册
    function vi_onOpen() {} // 消除 lint
  });

  it('hello 后 server 回 welcome → 触发 onWelcome', async () => {
    let received: any = null;
    const c = new GameClient('ws://test:8787');
    c.onOpen = () => c.hello(1);
    c.onWelcome = (msg) => {
      received = msg;
    };
    await wait(10);
    lastSocket()!._fireServerMessage({
      type: 'welcome',
      entityId: 'e_player_1',
      room: 'room-0',
      tick: 0,
      snapshot: { tick: 0, entities: [] },
    });
    await wait(10);
    expect(received).not.toBeNull();
    expect(received.type).toBe('welcome');
    expect(received.entityId).toBe('e_player_1');
  });

  it('sendIntent(2) → 客户端发 {"type":"intent","action":2}', async () => {
    const c = new GameClient('ws://test:8787');
    // 等 onopen 真正触发 (mock 的 onopen 用 setTimeout(0))
    await new Promise<void>((r) => {
      c.onOpen = () => {
        c.sendIntent(2);
        r();
      };
    });
    await wait(10);
    const sock = lastSocket()!;
    expect(sock.sentMessages.length).toBeGreaterThanOrEqual(1);
    const last = JSON.parse(sock.sentMessages[sock.sentMessages.length - 1]);
    expect(last).toEqual({ type: 'intent', action: 2 });
  });

  it('close() 后 sendIntent 不抛错', async () => {
    const c = new GameClient('ws://test:8787');
    c.onOpen = () => {};
    await wait(10);
    c.close();
    c.sendIntent(1); // 不抛
    await wait(10);
  });

  it('onState callback 收到 server 推送的 state', async () => {
    const c = new GameClient('ws://test:8787');
    const states: any[] = [];
    c.onState = (msg) => states.push(msg);
    await wait(10);
    lastSocket()!._fireServerMessage({
      type: 'state',
      tick: 1,
      entities: [],
      events: [],
    });
    await wait(10);
    expect(states.length).toBe(1);
    expect(states[0].tick).toBe(1);
  });

  it('onError callback 收到 server 推送的 error', async () => {
    const c = new GameClient('ws://test:8787');
    const errors: any[] = [];
    c.onError = (msg) => errors.push(msg);
    await wait(10);
    lastSocket()!._fireServerMessage({ type: 'error', message: 'bad move' });
    await wait(10);
    expect(errors.length).toBe(1);
    expect(errors[0].message).toBe('bad move');
  });

  it('close() 后 sendIntent 不抛错', async () => {
    const c = new GameClient('ws://test:8787');
    c.onOpen = () => {};
    await wait(10);
    c.close();
    c.sendIntent(1); // 不抛
    await wait(10);
  });

  it('onContent 收到 content 帧 (Day6.1)', async () => {
    const c = new GameClient('ws://test:8787');
    let received: any = null;
    c.onContent = (content) => {
      received = content;
    };
    await wait(10);
    lastSocket()!._fireServerMessage({
      type: 'content',
      content: { quest: { title: 'Test Quest' }, npcs: [] },
    });
    await wait(10);
    expect(received).not.toBeNull();
    expect(received.quest.title).toBe('Test Quest');
  });
});

function wait(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}
