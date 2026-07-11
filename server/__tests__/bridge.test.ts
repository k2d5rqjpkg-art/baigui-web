/**
 * server/__tests__/bridge.test.ts
 *
 * Day6: bridge.ts 单元测试
 *
 * 测试策略:
 *   - computeRewardFromEvents 是 named export, 直接测
 *   - discreteToAction 是内部函数,通过 HTTP /action 端点间接测
 *   - findNearestEnemy/Item 通过 /action 4/5 间接测
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { computeRewardFromEvents } from '../bridge.js';
import type { GameEvent, EntityId, SimEntity } from '../../src/core/sim/types.js';

const PLAYER = 'e_player_1' as EntityId;
const ENEMY = 'e_monster_1' as EntityId;

function ev(
  type: GameEvent['type'],
  source: EntityId | null = null,
  target: EntityId | null = null,
  data: Record<string, string | number | boolean> = {},
): GameEvent {
  return { type, source, target, data, tick: 1 };
}

describe('computeRewardFromEvents', () => {
  it('returns -0.1 (survival penalty) for empty event list', () => {
    expect(computeRewardFromEvents([], PLAYER)).toBe(-0.1);
  });

  it('returns -0.1 for events unrelated to self', () => {
    const events: GameEvent[] = [
      ev('move', 'e_other' as EntityId, null),
      ev('tick_end'),
    ];
    expect(computeRewardFromEvents(events, PLAYER)).toBe(-0.1);
  });

  describe('damage events', () => {
    it('+10 for damage dealt (source === self)', () => {
      const events: GameEvent[] = [ev('damage', PLAYER, ENEMY, { amount: 30 })];
      expect(computeRewardFromEvents(events, PLAYER)).toBeCloseTo(9.9); // 10 - 0.1
    });

    it('-5 for damage taken (target === self)', () => {
      const events: GameEvent[] = [ev('damage', ENEMY, PLAYER, { amount: 15 })];
      expect(computeRewardFromEvents(events, PLAYER)).toBeCloseTo(-5.1);
    });

    it('combines dealt and taken in same frame', () => {
      // 玩家打到 monster + monster 反击玩家
      const events: GameEvent[] = [
        ev('damage', PLAYER, ENEMY, { amount: 30 }),
        ev('damage', ENEMY, PLAYER, { amount: 10 }),
      ];
      // 10 - 5 - 0.1 = 4.9
      expect(computeRewardFromEvents(events, PLAYER)).toBeCloseTo(4.9);
    });

    it('damage event with source/target null contributes 0 (besides penalty)', () => {
      const events: GameEvent[] = [ev('damage', null, null)];
      expect(computeRewardFromEvents(events, PLAYER)).toBeCloseTo(-0.1);
    });
  });

  describe('death events', () => {
    it('+50 for kill (source === self)', () => {
      const events: GameEvent[] = [ev('death', PLAYER, ENEMY)];
      expect(computeRewardFromEvents(events, PLAYER)).toBeCloseTo(49.9);
    });

    it('0 for being killed (target === self, source !== self)', () => {
      // death 事件只看 source, 不看 target
      const events: GameEvent[] = [ev('death', ENEMY, PLAYER)];
      // source !== self → +0
      expect(computeRewardFromEvents(events, PLAYER)).toBeCloseTo(-0.1);
    });
  });

  describe('pickup events', () => {
    it('+5 for picking up item (source === self)', () => {
      const events: GameEvent[] = [ev('pickup', PLAYER)];
      expect(computeRewardFromEvents(events, PLAYER)).toBeCloseTo(4.9);
    });

    it('0 for others picking up', () => {
      const events: GameEvent[] = [ev('pickup', ENEMY)];
      expect(computeRewardFromEvents(events, PLAYER)).toBeCloseTo(-0.1);
    });
  });

  describe('complex sequences', () => {
    it('full fight: deal damage + kill + survive penalty', () => {
      const events: GameEvent[] = [
        ev('damage', PLAYER, ENEMY, { amount: 30 }), // +10
        ev('damage', ENEMY, PLAYER, { amount: 8 }),  // -5
        ev('death', PLAYER, ENEMY),                    // +50
        ev('pickup', PLAYER, null, { itemId: 'e_item_1' as EntityId }), // +5
      ];
      // 10 - 5 + 50 + 5 - 0.1 = 59.9
      expect(computeRewardFromEvents(events, PLAYER)).toBeCloseTo(59.9);
    });

    it('multiple damage events accumulate correctly', () => {
      const events: GameEvent[] = [
        ev('damage', PLAYER, ENEMY, { amount: 10 }),
        ev('damage', PLAYER, ENEMY, { amount: 20 }),
        ev('damage', PLAYER, ENEMY, { amount: 30 }),
      ];
      // 3 × 10 - 0.1 = 29.9
      expect(computeRewardFromEvents(events, PLAYER)).toBeCloseTo(29.9);
    });
  });
});

describe('bridge HTTP endpoints', () => {
  // 真实起 server 的端到端测试在 scripts/test-multiplayer.ts 跑 (Windows + spawn 兼容性好)
  // 这里只测纯函数 computeRewardFromEvents
  it('placeholder — full HTTP integration covered by scripts/test-multiplayer.ts', () => {
    // 避免 vitest 空 describe 警告
    expect(true).toBe(true);
  });
});