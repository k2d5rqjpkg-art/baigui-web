/**
 * server/pvp-leaderboard.ts
 *
 * Day10: PvP 排行榜接 persistence (v2.0 持久化层)
 *
 * 设计:
 *   - LeaderboardEntry: { playerId, rating, wins, losses, lastMatchAt }
 *   - saveLeaderboard / loadLeaderboard
 *   - saveMatchResult: 记录每场战斗
 *   - MemoryLeaderboard: 无 DB 时的 fallback
 *   - PostgresLeaderboard: 用 v2.0 persistence 层
 */
import type { PersistenceLayer } from './persistence.js';
import { log } from '../src/core/log.js';

export interface LeaderboardEntry {
  playerId: string;
  rating: number;
  wins: number;
  losses: number;
  lastMatchAt: number; // timestamp ms
}

export interface MatchResult {
  matchId: string;
  playerA: string;
  playerB: string;
  winnerA: boolean | null; // null = 平局
  newRatingA: number;
  newRatingB: number;
  deltaA: number;
  playedAt: number;
}

export interface LeaderboardStorage {
  /** 加载所有 player Elo (供排行榜) */
  loadAllEntries(): Promise<LeaderboardEntry[]>;
  /** 加载特定 player */
  loadEntry(playerId: string): Promise<LeaderboardEntry | null>;
  /** 保存 entry (upsert) */
  saveEntry(entry: LeaderboardEntry): Promise<void>;
  /** 记录比赛结果 */
  saveMatchResult(result: MatchResult): Promise<void>;
  /** 加载 N 条最近比赛 */
  loadRecentMatches(limit: number): Promise<MatchResult[]>;
  /** 关闭 */
  close(): Promise<void>;
}

/** 内存实现 (无 DB fallback) */
class MemoryLeaderboard implements LeaderboardStorage {
  private entries = new Map<string, LeaderboardEntry>();
  private matches: MatchResult[] = [];

  async loadAllEntries(): Promise<LeaderboardEntry[]> {
    return Array.from(this.entries.values()).sort((a, b) => b.rating - a.rating);
  }

  async loadEntry(playerId: string): Promise<LeaderboardEntry | null> {
    return this.entries.get(playerId) ?? null;
  }

  async saveEntry(entry: LeaderboardEntry): Promise<void> {
    this.entries.set(entry.playerId, entry);
  }

  async saveMatchResult(result: MatchResult): Promise<void> {
    this.matches.push(result);
    // 保留最近 1000 场
    if (this.matches.length > 1000) this.matches.shift();
  }

  async loadRecentMatches(limit: number): Promise<MatchResult[]> {
    return this.matches.slice(-limit).reverse();
  }

  async close(): Promise<void> {
    this.entries.clear();
    this.matches = [];
  }
}

/** Postgres 实现 (用 v2.0 persistence 层 + 2 张表) */
class PostgresLeaderboard implements LeaderboardStorage {
  constructor(private persistence: PersistenceLayer) {
    log.info('[leaderboard/pg] initialized');
  }

  async init(): Promise<void> {
    const client = await (this.persistence as any).pool.connect();
    try {
      await client.query(`
        CREATE TABLE IF NOT EXISTS leaderboard (
          player_id TEXT PRIMARY KEY,
          rating INTEGER NOT NULL,
          wins INTEGER NOT NULL DEFAULT 0,
          losses INTEGER NOT NULL DEFAULT 0,
          last_match_at BIGINT NOT NULL
        )
      `);
      await client.query(`
        CREATE TABLE IF NOT EXISTS pvp_matches (
          match_id TEXT PRIMARY KEY,
          player_a TEXT NOT NULL,
          player_b TEXT NOT NULL,
          winner_a BOOLEAN,
          new_rating_a INTEGER NOT NULL,
          new_rating_b INTEGER NOT NULL,
          delta_a INTEGER NOT NULL,
          played_at BIGINT NOT NULL
        )
      `);
      log.info('[leaderboard/pg] schema ready');
    } finally {
      client.release();
    }
  }

  async loadAllEntries(): Promise<LeaderboardEntry[]> {
    if (!('pool' in this.persistence)) return [];
    const client = await (
      this.persistence as {
        pool: {
          connect: () => Promise<{
            query: (sql: string, params?: unknown[]) => Promise<{ rows: unknown[] }>;
            release: () => void;
          }>;
        };
      }
    ).pool.connect();
    try {
      const result = await client.query(
        'SELECT player_id, rating, wins, losses, last_match_at FROM leaderboard ORDER BY rating DESC',
        [],
      );
      return (result.rows as Array<Record<string, unknown>>).map((row) => ({
        playerId: String(row.player_id),
        rating: Number(row.rating),
        wins: Number(row.wins),
        losses: Number(row.losses),
        lastMatchAt: Number(row.last_match_at),
      }));
    } finally {
      client.release();
    }
  }

  async loadEntry(playerId: string): Promise<LeaderboardEntry | null> {
    if (!('pool' in this.persistence)) return null;
    const client = await (
      this.persistence as {
        pool: {
          connect: () => Promise<{
            query: (sql: string, params?: unknown[]) => Promise<{ rows: unknown[] }>;
            release: () => void;
          }>;
        };
      }
    ).pool.connect();
    try {
      const result = await client.query(
        'SELECT player_id, rating, wins, losses, last_match_at FROM leaderboard WHERE player_id = $1',
        [playerId],
      );
      const row = result.rows[0] as Record<string, unknown> | undefined;
      if (!row) return null;
      return {
        playerId: String(row.player_id),
        rating: Number(row.rating),
        wins: Number(row.wins),
        losses: Number(row.losses),
        lastMatchAt: Number(row.last_match_at),
      };
    } finally {
      client.release();
    }
  }

  async saveEntry(entry: LeaderboardEntry): Promise<void> {
    if (!('pool' in this.persistence)) return;
    const client = await (
      this.persistence as {
        pool: {
          connect: () => Promise<{
            query: (sql: string, params?: unknown[]) => Promise<{ rows: unknown[] }>;
            release: () => void;
          }>;
        };
      }
    ).pool.connect();
    try {
      await client.query(
        `INSERT INTO leaderboard (player_id, rating, wins, losses, last_match_at)
         VALUES ($1, $2, $3, $4, $5)
         ON CONFLICT (player_id) DO UPDATE SET
           rating = $2, wins = $3, losses = $4, last_match_at = $5`,
        [entry.playerId, entry.rating, entry.wins, entry.losses, entry.lastMatchAt],
      );
    } finally {
      client.release();
    }
  }

  async saveMatchResult(result: MatchResult): Promise<void> {
    if (!('pool' in this.persistence)) return;
    const client = await (
      this.persistence as {
        pool: {
          connect: () => Promise<{
            query: (sql: string, params?: unknown[]) => Promise<{ rows: unknown[] }>;
            release: () => void;
          }>;
        };
      }
    ).pool.connect();
    try {
      await client.query(
        `INSERT INTO pvp_matches (match_id, player_a, player_b, winner_a, new_rating_a, new_rating_b, delta_a, played_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
         ON CONFLICT (match_id) DO NOTHING`,
        [
          result.matchId,
          result.playerA,
          result.playerB,
          result.winnerA,
          result.newRatingA,
          result.newRatingB,
          result.deltaA,
          result.playedAt,
        ],
      );
    } finally {
      client.release();
    }
  }

  async loadRecentMatches(limit: number): Promise<MatchResult[]> {
    if (!('pool' in this.persistence)) return [];
    const client = await (
      this.persistence as {
        pool: {
          connect: () => Promise<{
            query: (sql: string, params?: unknown[]) => Promise<{ rows: unknown[] }>;
            release: () => void;
          }>;
        };
      }
    ).pool.connect();
    try {
      const result = await client.query(
        'SELECT * FROM pvp_matches ORDER BY played_at DESC LIMIT $1',
        [limit],
      );
      return (result.rows as Array<Record<string, unknown>>).map((row) => ({
        matchId: String(row.match_id),
        playerA: String(row.player_a),
        playerB: String(row.player_b),
        winnerA: row.winner_a === null ? null : Boolean(row.winner_a),
        newRatingA: Number(row.new_rating_a),
        newRatingB: Number(row.new_rating_b),
        deltaA: Number(row.delta_a),
        playedAt: Number(row.played_at),
      }));
    } finally {
      client.release();
    }
  }

  async close(): Promise<void> {
    // 由 PersistenceLayer.close 统一管理
  }
}

/** 工厂 */
export async function createLeaderboard(
  persistence: PersistenceLayer | null,
): Promise<LeaderboardStorage> {
  if (persistence && 'pool' in persistence) {
    const storage = new PostgresLeaderboard(persistence);
    await storage.init();
    return storage;
  }
  return new MemoryLeaderboard();
}

/** 辅助: 给 PvPRoom 结算后写 entry + match */
export async function recordMatch(
  storage: LeaderboardStorage,
  matchId: string,
  playerA: string,
  playerB: string,
  ratingA: number,
  ratingB: number,
  winnerA: boolean | null,
  newRatingA: number,
  newRatingB: number,
  deltaA: number,
): Promise<void> {
  await storage.saveMatchResult({
    matchId,
    playerA,
    playerB,
    winnerA,
    newRatingA,
    newRatingB,
    deltaA,
    playedAt: Date.now(),
  });

  // 累加 wins/losses (读旧 entry, 累加 wins/losses, update rating)
  const prevA = await storage.loadEntry(playerA);
  const prevB = await storage.loadEntry(playerB);
  const entryA: LeaderboardEntry = {
    playerId: playerA,
    rating: newRatingA,
    wins: (prevA?.wins ?? 0) + (winnerA === true ? 1 : 0),
    losses: (prevA?.losses ?? 0) + (winnerA === false ? 1 : 0),
    lastMatchAt: Date.now(),
  };
  await storage.saveEntry(entryA);

  const entryB: LeaderboardEntry = {
    playerId: playerB,
    rating: newRatingB,
    wins: (prevB?.wins ?? 0) + (winnerA === false ? 1 : 0),
    losses: (prevB?.losses ?? 0) + (winnerA === true ? 1 : 0),
    lastMatchAt: Date.now(),
  };
  await storage.saveEntry(entryB);
}

export { MemoryLeaderboard, PostgresLeaderboard };
