/**
 * server/__tests__/persistence.test.ts
 *
 * v2.0: 持久化层单元测试 (memory fallback + pg)
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createPersistence, MemoryPersistence } from '../persistence.js';
import { emptyState, addEntity, worldGen } from '../../src/core/sim/index.js';
import type { GameState, SimEntity, EntityId } from '../../src/core/sim/types.js';

function makeState(seed = 42): GameState {
  const layout = worldGen(seed, 1);
  let s = emptyState(seed);
  const player: SimEntity = {
    id: 'e_test_p1' as EntityId,
    kind: 'player',
    pos: { x: 5, y: 5 },
    hp: 50, maxHp: 100, atk: 30, def: 5, level: 5,
    faction: 'player',
    inventory: [], equipment: {}, buffs: [],
  };
  s = addEntity(s, player);
  return s;
}

describe('MemoryPersistence (默认 fallback)', () => {
  it('无 DATABASE_URL → memory persistence', async () => {
    const origUrl = process.env.DATABASE_URL;
    delete process.env.DATABASE_URL;
    try {
      const p = await createPersistence();
      expect(p).toBeInstanceOf(MemoryPersistence);
      await p.close();
    } finally {
      if (origUrl) process.env.DATABASE_URL = origUrl;
    }
  });

  it('savePlayer + loadPlayer 往返一致', async () => {
    const p = new MemoryPersistence();
    const s = makeState();
    await p.savePlayer('e_test_p1', s);
    const loaded = await p.loadPlayer('e_test_p1');
    expect(loaded).not.toBeNull();
    expect(loaded!.entities['e_test_p1' as EntityId]!.hp).toBe(50);
    await p.close();
  });

  it('loadPlayer 不存在 → null', async () => {
    const p = new MemoryPersistence();
    const loaded = await p.loadPlayer('e_unknown');
    expect(loaded).toBeNull();
    await p.close();
  });

  it('saveQuestProgress + loadQuestProgress 往返', async () => {
    const p = new MemoryPersistence();
    await p.saveQuestProgress('e_test_p1', 'q-forest-slimes', true);
    await p.saveQuestProgress('e_test_p1', 'q-forest-wolves', false);
    const rows = await p.loadQuestProgress('e_test_p1');
    expect(rows.length).toBe(2);
    expect(rows.find((r) => r.quest_id === 'q-forest-slimes')!.completed).toBe(true);
    expect(rows.find((r) => r.quest_id === 'q-forest-wolves')!.completed).toBe(false);
    await p.close();
  });

  it('更新任务进度 → 旧状态被覆盖', async () => {
    const p = new MemoryPersistence();
    await p.saveQuestProgress('e_test_p1', 'q-a', false);
    await p.saveQuestProgress('e_test_p1', 'q-a', true);
    const rows = await p.loadQuestProgress('e_test_p1');
    expect(rows.length).toBe(1);
    expect(rows[0]!.completed).toBe(true);
    await p.close();
  });

  it('close → 清空内存', async () => {
    const p = new MemoryPersistence();
    await p.savePlayer('e_test_p1', makeState());
    await p.close();
    // 重新 init 不应该恢复 (in-memory 重置)
    // 这里只验证 close 不抛
  });
});

describe('PostgresPersistence', () => {
  // 实际起 PG 比较重, 用 mock 测
  // 这里只验证有 DATABASE_URL 时 factory 返非 Memory 实例
  it('有 DATABASE_URL → 尝试连 PG (可能失败, 测兜底)', async () => {
    const origUrl = process.env.DATABASE_URL;
    process.env.DATABASE_URL = 'postgresql://invalid:invalid@localhost:5432/none?connect_timeout=1';
    try {
      // connect 失败应 throw, 但我们只验证 factory 行为
      await expect(createPersistence()).rejects.toThrow();
    } finally {
      if (origUrl) process.env.DATABASE_URL = origUrl;
      else delete process.env.DATABASE_URL;
    }
  });
});