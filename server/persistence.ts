/**
 * server/persistence.ts
 *
 * v2.0: Postgres 持久化层 (可选启用)
 *
 * 设计:
 *   - 双轨制: 无 DATABASE_URL 时仍用 memory (向后兼容)
 *   - 启动时自动创建 schema (idempotent CREATE IF NOT EXISTS)
 *   - 保存/加载: 玩家进度 (HP/pos/装备/任务完成情况)
 *
 * 借鉴 WoC: 用 Postgres 而不是内存, 让关浏览器不丢进度
 *
 * Schema:
 *   - player_saves: player_id, state_json, updated_at
 *   - quest_progress: player_id, quest_id, completed, completed_at
 */
import { Pool, type PoolClient } from 'pg';
import { log } from '../src/core/log.js';
import type { GameState } from '../src/core/sim/types.js';

export interface PersistedPlayer {
  player_id: string;
  state_json: string;
  updated_at: string;
}

export interface QuestProgressRow {
  player_id: string;
  quest_id: string;
  completed: boolean;
  completed_at: string | null;
}

export interface PersistenceLayer {
  /** 持久化玩家完整 state */
  savePlayer(playerId: string, state: GameState): Promise<void>;
  /** 加载玩家 state */
  loadPlayer(playerId: string): Promise<GameState | null>;
  /** 保存任务完成进度 */
  saveQuestProgress(playerId: string, questId: string, completed: boolean): Promise<void>;
  /** 加载任务完成列表 */
  loadQuestProgress(playerId: string): Promise<QuestProgressRow[]>;
  /** 关闭连接 */
  close(): Promise<void>;
}

/** 内存 fallback (无 DATABASE_URL) */
class MemoryPersistence implements PersistenceLayer {
  private players = new Map<string, GameState>();
  private quests = new Map<string, Map<string, boolean>>();

  async savePlayer(playerId: string, state: GameState): Promise<void> {
    this.players.set(playerId, state);
    log.info(`[persistence/memory] savePlayer ${playerId}`);
  }

  async loadPlayer(playerId: string): Promise<GameState | null> {
    return this.players.get(playerId) ?? null;
  }

  async saveQuestProgress(playerId: string, questId: string, completed: boolean): Promise<void> {
    if (!this.quests.has(playerId)) this.quests.set(playerId, new Map());
    this.quests.get(playerId)!.set(questId, completed);
  }

  async loadQuestProgress(playerId: string): Promise<QuestProgressRow[]> {
    const qmap = this.quests.get(playerId);
    if (!qmap) return [];
    return Array.from(qmap.entries()).map(([quest_id, completed]) => ({
      player_id: playerId,
      quest_id,
      completed,
      completed_at: null,
    }));
  }

  async close(): Promise<void> {
    this.players.clear();
    this.quests.clear();
  }
}

/** Postgres 持久化 */
class PostgresPersistence implements PersistenceLayer {
  private pool: Pool;

  constructor(connectionString: string) {
    this.pool = new Pool({ connectionString, max: 5 });
    log.info('[persistence/pg] connected');
  }

  async init(): Promise<void> {
    const client = await this.pool.connect();
    try {
      await client.query(`
        CREATE TABLE IF NOT EXISTS player_saves (
          player_id TEXT PRIMARY KEY,
          state_json TEXT NOT NULL,
          updated_at TIMESTAMPTZ DEFAULT NOW()
        )
      `);
      await client.query(`
        CREATE TABLE IF NOT EXISTS quest_progress (
          player_id TEXT NOT NULL,
          quest_id TEXT NOT NULL,
          completed BOOLEAN NOT NULL,
          completed_at TIMESTAMPTZ DEFAULT NOW(),
          PRIMARY KEY (player_id, quest_id)
        )
      `);
      log.info('[persistence/pg] schema initialized');
    } finally {
      client.release();
    }
  }

  async savePlayer(playerId: string, state: GameState): Promise<void> {
    const json = JSON.stringify(state);
    await this.pool.query(
      `INSERT INTO player_saves (player_id, state_json, updated_at)
       VALUES ($1, $2, NOW())
       ON CONFLICT (player_id) DO UPDATE SET state_json = $2, updated_at = NOW()`,
      [playerId, json],
    );
    log.info(`[persistence/pg] savePlayer ${playerId}`);
  }

  async loadPlayer(playerId: string): Promise<GameState | null> {
    const r = await this.pool.query<PersistedPlayer>(
      `SELECT * FROM player_saves WHERE player_id = $1 LIMIT 1`,
      [playerId],
    );
    if (r.rows.length === 0) return null;
    return JSON.parse(r.rows[0]!.state_json) as GameState;
  }

  async saveQuestProgress(playerId: string, questId: string, completed: boolean): Promise<void> {
    await this.pool.query(
      `INSERT INTO quest_progress (player_id, quest_id, completed, completed_at)
       VALUES ($1, $2, $3, NOW())
       ON CONFLICT (player_id, quest_id) DO UPDATE SET completed = $3, completed_at = NOW()`,
      [playerId, questId, completed],
    );
  }

  async loadQuestProgress(playerId: string): Promise<QuestProgressRow[]> {
    const r = await this.pool.query<QuestProgressRow>(
      `SELECT * FROM quest_progress WHERE player_id = $1`,
      [playerId],
    );
    return r.rows;
  }

  async close(): Promise<void> {
    await this.pool.end();
    log.info('[persistence/pg] closed');
  }
}

/**
 * 工厂: 根据 DATABASE_URL 自动选择实现
 */
export async function createPersistence(): Promise<PersistenceLayer> {
  const url = process.env.DATABASE_URL;
  if (url) {
    const pg = new PostgresPersistence(url);
    await pg.init();
    return pg;
  }
  log.info('[persistence] DATABASE_URL not set, using memory persistence');
  return new MemoryPersistence();
}

/** 暴露给测试用 */
export { MemoryPersistence, PostgresPersistence };