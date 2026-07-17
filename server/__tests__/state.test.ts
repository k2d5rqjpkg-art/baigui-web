/**
 * server/__tests__/state.test.ts
 *
 * Day6: GameRoom 单元测试
 * 把 server/state.ts 覆盖从 0% 提到 75%+
 *
 * 测试策略:
 *   - 真实 GameRoom 实例 (不 mock), 验证 sim API 集成
 *   - 测 reset / addPlayer / removePlayer / advance / getSnapshot 等公共 API
 *   - 边界: 满 4 玩家 / 重复 slotId / 不存在的 player
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { GameRoom, ROOM_PLAYER_ID } from '../state.js';
import type { Action, EntityId, GameEvent } from '../../src/core/sim/types.js';

describe('GameRoom', () => {
  let room: GameRoom;

  beforeEach(() => {
    room = new GameRoom('test-room');
  });

  describe('constructor & reset', () => {
    it('initial state has player, monsters, items', () => {
      const entities = Object.values(room.state.entities);
      const players = entities.filter((e) => e.kind === 'player');
      const monsters = entities.filter((e) => e.kind === 'monster');
      const items = entities.filter((e) => e.kind === 'item');
      expect(players.length).toBeGreaterThanOrEqual(1);
      expect(players.some((p) => p.id === ROOM_PLAYER_ID)).toBe(true);
      expect(monsters.length).toBeGreaterThanOrEqual(1);
      expect(items.length).toBeGreaterThanOrEqual(1);
    });

    it('initial tick is 0', () => {
      expect(room.tick).toBe(0);
    });

    it('initial entityCount > 0', () => {
      expect(room.entityCount).toBeGreaterThan(0);
    });

    it('has layout with rooms and walls', () => {
      expect(room.layout.rooms.length).toBeGreaterThan(0);
      expect(room.layout.walls.length).toBeGreaterThan(0);
      expect(room.layout.spawnPoints.length).toBeGreaterThan(0);
    });

    it('reset with different seed produces different layout', () => {
      const layout1 = JSON.stringify(room.layout);
      room.reset(999);
      const layout2 = JSON.stringify(room.layout);
      expect(layout1).not.toBe(layout2);
    });

    it('reset clears state and reinitializes', () => {
      // Advance a few ticks
      room.advance([], 50);
      room.advance([], 50);
      expect(room.tick).toBe(2);
      // Reset
      room.reset(42);
      expect(room.tick).toBe(0);
      expect(room.unconsumedEvents.length).toBe(0);
    });
  });

  describe('addPlayer / removePlayer', () => {
    it('returns EntityId for valid free slot', () => {
      const eid = room.addPlayer(2);
      expect(eid).toBeTruthy();
      expect(eid).toMatch(/^e_player_/);
    });

    it('rejects slotId < 1', () => {
      expect(room.addPlayer(0)).toBeNull();
      expect(room.addPlayer(-1)).toBeNull();
    });

    it('rejects slotId > 4', () => {
      expect(room.addPlayer(5)).toBeNull();
      expect(room.addPlayer(99)).toBeNull();
    });

    it('rejects already-occupied slot', () => {
      room.addPlayer(2);
      expect(room.addPlayer(2)).toBeNull();
    });

    it('rejects when room is full (4 players)', () => {
      // 初始 reset 已占 slot 1
      room.addPlayer(2);
      room.addPlayer(3);
      room.addPlayer(4);
      // 现在 4/4 满
      expect(room.occupiedSlots.size).toBe(4);
      expect(room.addPlayer(2)).toBeNull();
    });

    it('does not duplicate RL player (slot 1) state entity', () => {
      // 初始 slot 1 已经在 state
      const before = room.state.entities[ROOM_PLAYER_ID];
      expect(before).toBeDefined();
      room.addPlayer(1);
      // 仍是同一个 entity (没被覆盖)
      const after = room.state.entities[ROOM_PLAYER_ID];
      expect(after).toBe(before);
    });

    it('addPlayer(2..4) creates a new player SimEntity in state', () => {
      const eid = room.addPlayer(2);
      expect(eid).toBeTruthy();
      const entity = room.state.entities[eid!];
      expect(entity).toBeDefined();
      expect(entity!.kind).toBe('player');
      expect(entity!.hp).toBe(100);
    });

    it('removePlayer frees the slot', () => {
      const eid = room.addPlayer(2);
      expect(eid).toBeTruthy();
      expect(room.occupiedSlots.has(2)).toBe(true);
      room.removePlayer(eid!);
      expect(room.occupiedSlots.has(2)).toBe(false);
      // 重新占能成功
      const eid2 = room.addPlayer(2);
      expect(eid2).toBeTruthy();
    });

    it('removePlayer with unknown eid is a no-op', () => {
      expect(() => room.removePlayer('e_unknown' as EntityId)).not.toThrow();
      expect(room.occupiedSlots.size).toBe(1); // 仍只 slot 1
    });
  });

  describe('advance', () => {
    it('advances tick by 1', () => {
      room.advance([], 50);
      expect(room.tick).toBe(1);
      room.advance([], 50);
      expect(room.tick).toBe(2);
    });

    it('returns new state and events', () => {
      const result = room.advance([], 50);
      expect(result.state).toBeDefined();
      expect(result.tick).toBe(1);
      expect(Array.isArray(result.events)).toBe(true);
    });

    it('processes a move action (player position may or may not change depending on walls)', () => {
      // 玩家初始位置在 spawn point
      const startPos = { ...room.state.entities[ROOM_PLAYER_ID]!.pos };
      const action: Action = {
        type: 'move',
        entityId: ROOM_PLAYER_ID,
        payload: { dx: 0, dy: 1 },
      };
      // 不应崩
      expect(() => room.advance([action], 50)).not.toThrow();
      // tick 必须推进
      expect(room.tick).toBe(1);
      // 位置在墙内不变, 撞墙不变, 无墙则可能变 — 三种情况都允许
      const newPos = room.state.entities[ROOM_PLAYER_ID]!.pos;
      expect(newPos.x).toBeGreaterThanOrEqual(0);
      expect(newPos.y).toBeGreaterThanOrEqual(0);
      // sanity: 起点记录无误
      expect(startPos.x).toBeGreaterThanOrEqual(0);
    });

    it('processes an attack action against an adjacent monster', () => {
      // 把 monster 放到玩家正右 1 格
      const player = room.state.entities[ROOM_PLAYER_ID]!;
      const monsterEntry = Object.entries(room.state.entities).find(
        ([_, e]) => e.kind === 'monster' && e.hp > 0,
      );
      if (!monsterEntry) throw new Error('no monster in initial state');
      const [mId, m] = monsterEntry;
      room.state.entities[mId as EntityId] = {
        ...m,
        pos: { x: player.pos.x + 1, y: player.pos.y },
      };
      const monsterHpBefore = m.hp;
      const action: Action = {
        type: 'attack',
        entityId: ROOM_PLAYER_ID,
        payload: { targetId: mId as EntityId },
      };
      const result = room.advance([action], 50);
      const dmgEvent = result.events.find((e) => e.type === 'damage');
      expect(dmgEvent).toBeDefined();
      // monster HP 应减少
      const monsterAfter = room.state.entities[mId as EntityId];
      if (monsterAfter && monsterAfter.hp > 0) {
        expect(monsterAfter.hp).toBeLessThan(monsterHpBefore);
      }
    });

    it('accumulates unconsumedEvents for RL reward shaping', () => {
      room.advance([], 50);
      room.advance([], 50);
      expect(room.unconsumedEvents.length).toBeGreaterThan(0);
    });

    it('handles unknown action gracefully (no crash)', () => {
      const bogus = {
        type: 'use_item',
        entityId: ROOM_PLAYER_ID,
        payload: { itemId: 'e_nope' as EntityId },
      } as unknown as Action;
      expect(() => room.advance([bogus], 50)).not.toThrow();
    });
  });

  describe('getSnapshot', () => {
    it('returns tick, entities array, and layout', () => {
      const snap = room.getSnapshot();
      expect(snap.tick).toBe(0);
      expect(Array.isArray(snap.entities)).toBe(true);
      expect(snap.entities.length).toBe(room.entityCount);
      expect(snap.layout).toBe(room.layout);
    });

    it('entities is a fresh array (not the internal Map values reference)', () => {
      const snap = room.getSnapshot();
      // Mutating snapshot array should not break room
      snap.entities.length = 0;
      expect(room.entityCount).toBeGreaterThan(0);
    });
  });

  describe('getEntity', () => {
    it('returns entity for valid id', () => {
      const e = room.getEntity(ROOM_PLAYER_ID);
      expect(e).toBeDefined();
      expect(e!.id).toBe(ROOM_PLAYER_ID);
    });

    it('returns undefined for unknown id', () => {
      expect(room.getEntity('e_unknown' as EntityId)).toBeUndefined();
    });
  });
});

describe('ROOM_PLAYER_ID constant', () => {
  it('is the string "e_player_1"', () => {
    expect(ROOM_PLAYER_ID).toBe('e_player_1');
  });
});
