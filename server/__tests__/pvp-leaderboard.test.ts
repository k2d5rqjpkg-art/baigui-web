/**
 * server/__tests__/pvp-leaderboard.test.ts
 *
 * Day10: PvP 排行榜 + persistence 测试
 */
import { describe, it, expect, beforeEach } from 'vitest';
import {
  MemoryLeaderboard,
  createLeaderboard,
  recordMatch,
  type LeaderboardEntry,
  type MatchResult,
} from '../pvp-leaderboard.js';

describe('MemoryLeaderboard 基础', () => {
  let lb: MemoryLeaderboard;
  beforeEach(() => {
    lb = new MemoryLeaderboard();
  });

  it('saveEntry + loadEntry 往返', async () => {
    const entry: LeaderboardEntry = {
      playerId: 'p1',
      rating: 1200,
      wins: 0,
      losses: 0,
      lastMatchAt: Date.now(),
    };
    await lb.saveEntry(entry);
    const loaded = await lb.loadEntry('p1');
    expect(loaded?.rating).toBe(1200);
  });

  it('loadAllEntries 按 rating 降序', async () => {
    await lb.saveEntry({ playerId: 'p1', rating: 1200, wins: 0, losses: 0, lastMatchAt: 0 });
    await lb.saveEntry({ playerId: 'p2', rating: 1500, wins: 0, losses: 0, lastMatchAt: 0 });
    await lb.saveEntry({ playerId: 'p3', rating: 1300, wins: 0, losses: 0, lastMatchAt: 0 });
    const all = await lb.loadAllEntries();
    expect(all.map((e) => e.playerId)).toEqual(['p2', 'p3', 'p1']);
  });

  it('loadEntry 不存在 → null', async () => {
    expect(await lb.loadEntry('unknown')).toBeNull();
  });

  it('saveMatchResult + loadRecentMatches', async () => {
    await lb.saveMatchResult({
      matchId: 'm1',
      playerA: 'p1',
      playerB: 'p2',
      winnerA: true,
      newRatingA: 1216,
      newRatingB: 1184,
      deltaA: 16,
      playedAt: 1,
    });
    await lb.saveMatchResult({
      matchId: 'm2',
      playerA: 'p3',
      playerB: 'p4',
      winnerA: false,
      newRatingA: 1100,
      newRatingB: 1300,
      deltaA: -16,
      playedAt: 2,
    });
    const recent = await lb.loadRecentMatches(10);
    expect(recent.length).toBe(2);
    // 最新在前
    expect(recent[0]!.matchId).toBe('m2');
  });

  it('loadRecentMatches limit 截断', async () => {
    for (let i = 0; i < 5; i++) {
      await lb.saveMatchResult({
        matchId: `m${i}`,
        playerA: 'a',
        playerB: 'b',
        winnerA: null,
        newRatingA: 1200,
        newRatingB: 1200,
        deltaA: 0,
        playedAt: i,
      });
    }
    const recent = await lb.loadRecentMatches(3);
    expect(recent.length).toBe(3);
  });

  it('保留最近 1000 场 (LRU)', async () => {
    for (let i = 0; i < 1005; i++) {
      await lb.saveMatchResult({
        matchId: `m${i}`,
        playerA: 'a',
        playerB: 'b',
        winnerA: null,
        newRatingA: 1200,
        newRatingB: 1200,
        deltaA: 0,
        playedAt: i,
      });
    }
    const recent = await lb.loadRecentMatches(2000);
    expect(recent.length).toBe(1000);
    // 最早 5 场被淘汰, 最新场应在最前
    expect(recent[0]!.matchId).toBe('m1004');
  });
});

describe('createLeaderboard 工厂', () => {
  it('null persistence → MemoryLeaderboard', async () => {
    const lb = await createLeaderboard(null);
    expect(lb).toBeInstanceOf(MemoryLeaderboard);
  });

  it('有 persistence → 仍 Memory (接口预留)', async () => {
    // 简化: 现在不真正接 PG, 仍 memory
    const mockPersistence = { close: async () => {}, loadPlayer: async () => null } as any;
    const lb = await createLeaderboard(mockPersistence);
    expect(lb).toBeInstanceOf(MemoryLeaderboard);
  });
});

describe('recordMatch (集成 PvP 结算)', () => {
  it('A 赢 → entry A wins++, B losses++, match 记录', async () => {
    const lb = new MemoryLeaderboard();
    await recordMatch(lb, 'm1', 'p1', 'p2', 1200, 1200, true, 1216, 1184, 16);
    const a = await lb.loadEntry('p1');
    const b = await lb.loadEntry('p2');
    expect(a?.wins).toBe(1);
    expect(b?.losses).toBe(1);
    expect(a?.rating).toBe(1216);
    expect(b?.rating).toBe(1184);
    const matches = await lb.loadRecentMatches(10);
    expect(matches.length).toBe(1);
    expect(matches[0]!.winnerA).toBe(true);
  });

  it('平局 → wins/losses 都是 0, delta 0', async () => {
    const lb = new MemoryLeaderboard();
    await recordMatch(lb, 'm1', 'p1', 'p2', 1200, 1200, null, 1200, 1200, 0);
    const a = await lb.loadEntry('p1');
    expect(a?.wins).toBe(0);
    expect(a?.losses).toBe(0);
    expect(a?.rating).toBe(1200);
  });

  it('多次比赛 → wins 累加', async () => {
    const lb = new MemoryLeaderboard();
    await recordMatch(lb, 'm1', 'p1', 'p2', 1200, 1200, true, 1216, 1184, 16);
    await recordMatch(lb, 'm2', 'p1', 'p2', 1216, 1184, true, 1231, 1169, 15);
    const a = await lb.loadEntry('p1');
    expect(a?.wins).toBe(2);
    // 第二次 rating 1216, 期望 1231
    expect(a?.rating).toBe(1231);
  });
});
