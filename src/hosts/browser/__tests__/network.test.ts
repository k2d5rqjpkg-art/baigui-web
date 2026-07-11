/**
 * src/hosts/browser/__tests__/network.test.ts
 *
 * Day4: network 模式集成测试
 * - 用 mock GameClient (跳过真实 WebSocket)
 * - 验证 BrowserGame 在 attachNetworkClient + 收到 welcome/state 后切换模式
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';

// Mock window/performance (game.ts 用 setInterval)
global.performance = { now: vi.fn(() => 0) } as any;
global.window = {
  setInterval: vi.fn(() => 1 as any),
  clearInterval: vi.fn(),
} as any;

import { BrowserGame } from '../game';
import type { GameClient, StateMessage, WelcomeMessage } from '../network';
import type { SimEntity, EntityId } from '../../../core/sim';

/**
 * Mock GameClient: 不连真实 ws, 而是手动驱动回调
 * 这样能精确控制 "什么时候收到 welcome/state"
 */
class MockGameClient {
  onWelcome: ((msg: WelcomeMessage) => void) | undefined;
  onState: ((msg: StateMessage) => void) | undefined;
  onError: ((msg: any) => void) | undefined;
  onClose: ((ev: any) => void) | undefined;
  onOpen: (() => void) | undefined;

  sentIntents: number[] = [];
  helloSlotId: number | null = null;
  closed = false;

  hello(slotId: number) {
    this.helloSlotId = slotId;
  }
  sendIntent(action: number) {
    this.sentIntents.push(action);
  }
  close() {
    this.closed = true;
  }
  isConnected() {
    return true;
  }

  // 测试辅助: 模拟 server 推送
  emitWelcome(msg: Partial<WelcomeMessage>) {
    this.onWelcome?.({
      type: 'welcome',
      entityId: msg.entityId ?? 'e_player_2',
      room: msg.room ?? 'room-0',
      tick: msg.tick ?? 0,
      snapshot: msg.snapshot ?? { tick: 0, entities: [] },
    });
  }
  emitState(msg: Partial<StateMessage>) {
    this.onState?.({
      type: 'state',
      tick: msg.tick ?? 1,
      entities: msg.entities ?? [],
      events: msg.events ?? [],
    });
  }
  emitClose(ev: any = {}) {
    this.onClose?.(ev);
  }
}

function makePlayerEntity(id: EntityId, x: number, y: number): SimEntity {
  return {
    id,
    kind: 'player',
    pos: { x, y },
    hp: 100,
    maxHp: 100,
    atk: 30,
    def: 5,
    level: 5,
    faction: 'player',
    inventory: [],
    equipment: {},
    buffs: [],
  };
}

describe('Network mode (Day4)', () => {
  let game: BrowserGame;
  let client: MockGameClient;

  beforeEach(() => {
    client = new MockGameClient();
    game = new BrowserGame({ tickHz: 20, networkClient: client as unknown as GameClient });
  });

  it('默认是 local 模式', () => {
    expect(game.getMode()).toBe('local');
  });

  it('attachNetworkClient 后初始还是 local, 收到 welcome 才切换 network', () => {
    client.emitWelcome({
      entityId: 'e_player_7',
      snapshot: {
        tick: 0,
        entities: [makePlayerEntity('e_player_7', 5, 5)],
      },
    });
    expect(game.getMode()).toBe('network');
    expect(game.getNetworkPlayerId()).toBe('e_player_7');
  });

  it('收到 welcome 后用 server snapshot 替换本地 state', () => {
    client.emitWelcome({
      entityId: 'e_player_7',
      snapshot: {
        tick: 42,
        entities: [makePlayerEntity('e_player_7', 13, 17)],
      },
    });
    const snap = game.getPlayerSnapshot();
    expect(snap).not.toBeNull();
    expect(snap!.id).toBe('e_player_7');
    expect(snap!.pos.x).toBe(13);
    expect(snap!.pos.y).toBe(17);
    expect(game.getState().tick).toBe(42);
  });

  it('network 模式下 pushAction (move) 翻译成 Discrete intent 发给 client', () => {
    client.emitWelcome({
      entityId: 'e_player_7',
      snapshot: { tick: 0, entities: [makePlayerEntity('e_player_7', 5, 5)] },
    });
    client.sentIntents = []; // 清掉 welcome 期间的
    game.pushAction({
      type: 'move',
      entityId: 'e_player_7' as EntityId,
      payload: { dx: 1, dy: 0 },
    });
    expect(client.sentIntents).toEqual([3]); // dx=+1 → discrete 3 (右)
  });

  it('network 模式下 pushAction (attack) 翻译成 Discrete 4', () => {
    client.emitWelcome({
      entityId: 'e_player_7',
      snapshot: { tick: 0, entities: [makePlayerEntity('e_player_7', 5, 5)] },
    });
    client.sentIntents = [];
    game.pushAction({
      type: 'attack',
      entityId: 'e_player_7' as EntityId,
      payload: { targetId: 'e_monster_1' as EntityId },
    });
    expect(client.sentIntents).toEqual([4]);
  });

  it('network 模式下 start() 不启动本地 tick', () => {
    client.emitWelcome({
      entityId: 'e_player_7',
      snapshot: { tick: 0, entities: [makePlayerEntity('e_player_7', 5, 5)] },
    });
    game.start();
    // 验证 pushAction 后没有进 pendingActions, 而是发给了 client
    game.pushAction({
      type: 'move',
      entityId: 'e_player_7' as EntityId,
      payload: { dx: 0, dy: -1 },
    });
    expect(client.sentIntents).toContain(0);
  });

  it('收到 state 后用 server entities 替换本地 state', () => {
    client.emitWelcome({
      entityId: 'e_player_7',
      snapshot: { tick: 0, entities: [makePlayerEntity('e_player_7', 5, 5)] },
    });
    client.emitState({
      tick: 100,
      entities: [
        makePlayerEntity('e_player_7', 8, 9),
        {
          id: 'e_monster_1' as EntityId,
          kind: 'monster',
          pos: { x: 10, y: 10 },
          hp: 50,
          maxHp: 50,
          atk: 10,
          def: 3,
          level: 2,
          faction: 'enemy',
          inventory: [],
          equipment: {},
          buffs: [],
        },
      ],
      events: [],
    });
    expect(game.getState().tick).toBe(100);
    expect(game.getEntities().length).toBe(2);
    const p = game.getPlayerSnapshot();
    expect(p!.pos).toEqual({ x: 8, y: 9 });
  });

  it('network 模式下收到 HP=0 触发 onPlayerDeath', () => {
    let deathCalled = false;
    game.onPlayerDeath = () => { deathCalled = true; };
    client.emitWelcome({
      entityId: 'e_player_7',
      snapshot: { tick: 0, entities: [makePlayerEntity('e_player_7', 5, 5)] },
    });
    const deadPlayer = makePlayerEntity('e_player_7', 5, 5);
    deadPlayer.hp = 0;
    client.emitState({
      tick: 1,
      entities: [deadPlayer],
      events: [],
    });
    expect(deathCalled).toBe(true);
  });

  it('client close 后 fallback 到 local 模式', () => {
    client.emitWelcome({
      entityId: 'e_player_7',
      snapshot: { tick: 0, entities: [makePlayerEntity('e_player_7', 5, 5)] },
    });
    expect(game.getMode()).toBe('network');
    client.emitClose({});
    expect(game.getMode()).toBe('local');
  });
});