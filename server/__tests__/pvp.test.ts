/**
 * server/__tests__/pvp.test.ts
 *
 * Day7: PvP 系统测试
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { EloRating, expectedScore, updateElo, PvPRoom, MatchmakingQueue } from '../pvp.js';
import type { Action, EntityId } from '../../src/core/sim/types.js';

describe('Elo 算法 (借鉴 WoC PvP 排行)', () => {
  it('期望胜率: 同 rating = 0.5', () => {
    expect(expectedScore(1200, 1200)).toBeCloseTo(0.5, 3);
  });

  it('高 rating 期望胜率高', () => {
    const exp = expectedScore(1400, 1200); // A 高 200
    expect(exp).toBeGreaterThan(0.5);
    expect(exp).toBeLessThan(1);
    expect(exp).toBeCloseTo(0.76, 2);
  });

  it('updateElo: A 赢 + rating 相等 → A +16 B -16 (K=32)', () => {
    const r = updateElo(1200, 1200, true, 32);
    expect(r.deltaA).toBe(16); // 32 * (1 - 0.5) = 16
    expect(r.newA).toBe(1216);
    expect(r.newB).toBe(1184);
  });

  it('updateElo: 低 rating 赢高 rating → 大涨', () => {
    const r = updateElo(1200, 1400, true, 32);
    expect(r.deltaA).toBeGreaterThan(16); // 爆冷门 reward > 16
  });

  it('updateElo: 高 rating 赢低 rating → 小涨', () => {
    const r = updateElo(1400, 1200, true, 32);
    expect(r.deltaA).toBeLessThan(16); // 预期赢, 涨少
    expect(r.deltaA).toBeGreaterThan(0);
  });

  it('updateElo: 平局 (winnerA=false) → A 扣分 (vs 高 rating)', () => {
    const r = updateElo(1200, 1400, false, 32);
    expect(r.deltaA).toBeLessThan(0); // A 输给 B, 应扣分 (delta < 0)
  });
});

describe('PvPRoom (1v1 房间)', () => {
  it('构造: 2 玩家 + 初始 state', () => {
    const room = new PvPRoom('pvp-1', 'e_p1' as EntityId, 'e_p2' as EntityId, 1200, 1200);
    expect(room.state.entities['e_p1' as EntityId]).toBeDefined();
    expect(room.state.entities['e_p2' as EntityId]).toBeDefined();
    expect(room.winner).toBeNull();
    expect(room.tickNum).toBe(0);
  });

  it('双方 attack 推 tick', () => {
    const room = new PvPRoom('pvp-1', 'e_p1' as EntityId, 'e_p2' as EntityId, 1200, 1200);
    const r = room.step({
      A: {
        type: 'attack',
        entityId: 'e_p1' as EntityId,
        payload: { targetId: 'e_p2' as EntityId },
      },
      B: null,
    });
    expect(r.events.length).toBeGreaterThan(0);
    expect(room.tickNum).toBe(1);
  });

  it('HP 归 0 → winner 判定', () => {
    const room = new PvPRoom('pvp-1', 'e_p1' as EntityId, 'e_p2' as EntityId, 1200, 1200);
    room.state.entities['e_p2' as EntityId]!.hp = 1;
    // 反复 attack 直到死 (有 dodge 公式, 单次可能 miss)
    let winner: 'A' | 'B' | null = null;
    for (let i = 0; i < 50 && winner === null; i++) {
      const r = room.step({
        A: {
          type: 'attack',
          entityId: 'e_p1' as EntityId,
          payload: { targetId: 'e_p2' as EntityId },
        },
        B: null,
      });
      winner = r.winner;
    }
    expect(winner).toBe('A');
  });

  it('finish: winner A → A Elo +16', () => {
    const room = new PvPRoom('pvp-1', 'e_p1' as EntityId, 'e_p2' as EntityId, 1200, 1200);
    room.state.entities['e_p2' as EntityId]!.hp = 1;
    let winner: 'A' | 'B' | null = null;
    for (let i = 0; i < 50 && winner === null; i++) {
      const r = room.step({
        A: {
          type: 'attack',
          entityId: 'e_p1' as EntityId,
          payload: { targetId: 'e_p2' as EntityId },
        },
        B: null,
      });
      winner = r.winner;
    }
    const result = room.finish();
    expect(result.deltaA).toBe(16);
  });

  it('finish: 平局 (双方 HP 0) → delta 0', () => {
    const room = new PvPRoom('pvp-1', 'e_p1' as EntityId, 'e_p2' as EntityId, 1200, 1200);
    room.state.entities['e_p1' as EntityId]!.hp = 0;
    room.state.entities['e_p2' as EntityId]!.hp = 0;
    // 直接 finish (winner 还是 null)
    const result = room.finish();
    expect(result.deltaA).toBe(0);
  });

  it('玩家只发 1 个 action 也工作', () => {
    const room = new PvPRoom('pvp-1', 'e_p1' as EntityId, 'e_p2' as EntityId, 1200, 1200);
    // B 不动, A 攻击 B
    const r = room.step({
      A: {
        type: 'attack',
        entityId: 'e_p1' as EntityId,
        payload: { targetId: 'e_p2' as EntityId },
      },
      B: null,
    });
    expect(r.events.length).toBeGreaterThan(0);
  });
});

describe('MatchmakingQueue (FIFO)', () => {
  let queue: MatchmakingQueue;
  beforeEach(() => {
    queue = new MatchmakingQueue();
  });

  it('空队列 → tryMatch 返 null', () => {
    expect(queue.tryMatch()).toBeNull();
  });

  it('1 个玩家 → 不匹配', () => {
    queue.enqueue('e_p1' as EntityId, 1200);
    expect(queue.tryMatch()).toBeNull();
  });

  it('2 个玩家 → FIFO 匹配', () => {
    queue.enqueue('e_p1' as EntityId, 1200);
    queue.enqueue('e_p2' as EntityId, 1500);
    const m = queue.tryMatch();
    expect(m).not.toBeNull();
    expect(m!.playerA).toBe('e_p1');
    expect(m!.playerB).toBe('e_p2');
    expect(m!.ratingA).toBe(1200);
    expect(m!.ratingB).toBe(1500);
  });

  it('匹配后队列清空', () => {
    queue.enqueue('e_p1' as EntityId, 1200);
    queue.enqueue('e_p2' as EntityId, 1200);
    queue.tryMatch();
    expect(queue.size()).toBe(0);
  });

  it('重复入队 → 警告但不重复添加', () => {
    queue.enqueue('e_p1' as EntityId, 1200);
    queue.enqueue('e_p1' as EntityId, 1300);
    expect(queue.size()).toBe(1);
  });

  it('dequeue: 玩家退出', () => {
    queue.enqueue('e_p1' as EntityId, 1200);
    queue.enqueue('e_p2' as EntityId, 1200);
    queue.dequeue('e_p1' as EntityId);
    expect(queue.size()).toBe(1);
    const m = queue.tryMatch();
    expect(m).toBeNull(); // 只剩 p2
  });

  it('多玩家 FIFO 顺序', () => {
    queue.enqueue('e_a' as EntityId, 1000);
    queue.enqueue('e_b' as EntityId, 1100);
    queue.enqueue('e_c' as EntityId, 1200);
    queue.enqueue('e_d' as EntityId, 1300);
    const m1 = queue.tryMatch();
    expect(m1!.playerA).toBe('e_a');
    expect(m1!.playerB).toBe('e_b');
    const m2 = queue.tryMatch();
    expect(m2!.playerA).toBe('e_c');
    expect(m2!.playerB).toBe('e_d');
    expect(queue.size()).toBe(0);
  });
});
