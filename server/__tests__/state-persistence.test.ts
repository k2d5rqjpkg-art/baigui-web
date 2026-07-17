/**
 * server/__tests__/state-persistence.test.ts
 *
 * v3.4: 验证 GameRoom 接 persistence 后 save/load 工作
 */
import { describe, it, expect } from 'vitest';
import { GameRoom } from '../state.js';
import { MemoryPersistence } from '../persistence.js';
import { emptyState, addEntity } from '../../src/core/sim/tick.js';
import type { SimEntity, EntityId } from '../../src/core/sim/types.js';

function makePlayer(): SimEntity {
  return {
    id: 'e_player_1' as EntityId,
    kind: 'player',
    pos: { x: 5, y: 5 },
    hp: 50, maxHp: 100, atk: 30, def: 5, level: 5,
    faction: 'player',
    inventory: [], equipment: {}, buffs: [],
  };
}

describe('GameRoom + persistence 集成', () => {
  it('默认无 persistence → loadSavedPlayer 返 null', async () => {
    const room = new GameRoom('test-room');
    expect(room.persistence).toBeNull();
    const loaded = await room.loadSavedPlayer('e_player_1' as EntityId);
    expect(loaded).toBeNull();
  });

  it('默认无 persistence → savePlayer 不抛错 (只是 no-op)', async () => {
    const room = new GameRoom('test-room');
    await expect(room.savePlayer('e_player_1' as EntityId)).resolves.not.toThrow();
  });

  it('配置 MemoryPersistence → savePlayer 后 loadSavedPlayer 能恢复', async () => {
    const room = new GameRoom('test-room');
    room.persistence = new MemoryPersistence();

    // 改 player HP
    const state = room.state;
    if (state.entities['e_player_1' as EntityId]) {
      state.entities['e_player_1' as EntityId]!.hp = 42;
    }

    await room.savePlayer('e_player_1' as EntityId);
    const loaded = await room.loadSavedPlayer('e_player_1' as EntityId);
    expect(loaded).not.toBeNull();
    expect(loaded!.entities['e_player_1' as EntityId]!.hp).toBe(42);
  });

  it('removePlayer 时自动 save (无需显式调 savePlayer)', async () => {
    const room = new GameRoom('test-room');
    room.persistence = new MemoryPersistence();
    const player = makePlayer();
    room.state = addEntity(room.state, player);

    // 玩家加入
    room.removePlayer('e_player_1' as EntityId);
    // 等异步 save 完成 (fire-and-forget)
    await new Promise((r) => setTimeout(r, 50));

    const loaded = await room.persistence.loadPlayer('e_player_1' as EntityId);
    expect(loaded).not.toBeNull();
  });
});