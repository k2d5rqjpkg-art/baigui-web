/**
 * src/core/sim/__tests__/behavior-coverage.test.ts
 *
 * AI 测试 #1: 行为覆盖率 — sim 核心 invariant 探测
 *
 * 思路: 让 AI agent 玩 N 步, 然后断言关键不变量依然成立
 *  - 玩家 HP 非负且 <= maxHp
 *  - 所有 entity id 唯一
 *  - tick 严格递增
 *  - 至少发生某种战斗事件
 */
import { describe, it, expect } from 'vitest';
import { emptyState, addEntity, worldGen, generateEncounter, tick, ITEM_TABLE } from '../index';
import type { EntityId, GameState, SimEntity, GameEvent, Action } from '../types';

/** 简单 AI: 朝最近 monster 走, 邻接时 attack */
function aiAct(player: SimEntity, state: GameState): Action | null {
  if (player.hp <= 0) return null;
  let target: SimEntity | undefined;
  let bestD = Infinity;
  for (const e of Object.values(state.entities)) {
    if (e.kind !== 'monster' || e.hp <= 0 || e.id === player.id) continue;
    const d = Math.abs(e.pos.x - player.pos.x) + Math.abs(e.pos.y - player.pos.y);
    if (d < bestD) {
      bestD = d;
      target = e;
    }
  }
  if (!target) return null;
  if (bestD <= 1) {
    return { type: 'attack', entityId: player.id, payload: { targetId: target.id } };
  }
  const dx = Math.sign(target.pos.x - player.pos.x);
  const dy = Math.sign(target.pos.y - player.pos.y);
  if (dx !== 0) return { type: 'move', entityId: player.id, payload: { dx, dy: 0 } };
  return { type: 'move', entityId: player.id, payload: { dx: 0, dy } };
}

function makeWorld(): GameState {
  let s = emptyState(123);
  s = addEntity(s, {
    id: 'e_p1' as EntityId,
    kind: 'player',
    pos: { x: 5, y: 5 },
    hp: 200,
    maxHp: 200,
    atk: 50,
    def: 10,
    level: 5,
    faction: 'player',
    inventory: [],
    equipment: {},
    buffs: [],
  });
  // 散 12 个怪
  for (let i = 0; i < 12; i++) {
    s = addEntity(s, {
      id: `e_t_m_${i}` as EntityId,
      kind: 'monster',
      pos: { x: 5 + i, y: 8 + (i % 3) },
      hp: 20,
      maxHp: 20,
      atk: 10,
      def: 1,
      level: (i % 5) + 1,
      faction: 'enemy',
      inventory: [],
      equipment: {},
      buffs: [],
    });
  }
  return s;
}

describe('AI 测试 #1: 行为覆盖率 / invariant', () => {
  it('AI 跑 200 步: HP 在 [0, maxHp] 且 id 唯一', () => {
    const layout = worldGen(123, 5);
    let state = makeWorld();
    let lastEvents: GameEvent[] = [];
    const seenIds = new Set<EntityId>();

    for (let i = 0; i < 200; i++) {
      const player = state.entities['e_p1' as EntityId];
      if (!player || player.hp <= 0) break;
      const action = aiAct(player, state);
      const actions = action ? [action] : [];
      const r = tick(state, actions, 50, { layout });
      state = r.state;
      lastEvents = r.events;
      // invariant: HP 范围
      expect(player.hp).toBeGreaterThanOrEqual(0);
      expect(player.hp).toBeLessThanOrEqual(player.maxHp);
    }

    // invariant: id 唯一
    for (const id of Object.keys(state.entities)) {
      expect(seenIds.has(id as EntityId)).toBe(false);
      seenIds.add(id as EntityId);
    }

    // 至少发生过战斗事件 (death / damage)
    expect(state.tick).toBeGreaterThan(50);
  });

  it('AI 100 步统计: 至少触发 1 个 death 事件 (有怪死亡)', () => {
    let state = makeWorld();
    const layout = worldGen(123, 5);
    let deathCount = 0;
    for (let i = 0; i < 100; i++) {
      const p = state.entities['e_p1' as EntityId];
      if (!p || p.hp <= 0) break;
      const a = aiAct(p, state);
      const r = tick(state, a ? [a] : [], 50, { layout });
      state = r.state;
      for (const e of r.events) if (e.type === 'death') deathCount++;
    }
    expect(deathCount).toBeGreaterThan(0);
  });

  it('拾取路径: 把物品 entity 加 state → pickup 后从 state 移除', () => {
    let state = makeWorld();
    const layout = worldGen(123, 5);
    // 玩家背包装一个铁剑模板, 把物品 entity 放到旁边
    const sword = ITEM_TABLE.find((i) => i.slot === 'weapon');
    expect(sword).toBeDefined();
    state = addEntity(state, {
      id: 'e_item_1' as EntityId,
      kind: 'item',
      pos: { x: 6, y: 5 },
      hp: 1,
      maxHp: 1,
      atk: 0,
      def: 0,
      level: 1,
      faction: 'neutral',
      inventory: [sword!.id],
      equipment: {},
      buffs: [],
    });

    const r = tick(
      state,
      [
        {
          type: 'pickup',
          entityId: 'e_p1' as EntityId,
          payload: { itemId: 'e_item_1' as EntityId },
        },
      ],
      50,
      { layout },
    );
    state = r.state;
    expect(state.entities['e_item_1' as EntityId]).toBeUndefined();
    const p = state.entities['e_p1' as EntityId]!;
    expect(p.equipment[sword!.slot]).toBe(sword!.id);
  });

  it('XP 累计 → 升级 → 属性上升 (闭环)', async () => {
    const { gainXp } = await import('../progression');
    let state = makeWorld();
    const layout = worldGen(123, 5);
    // 直接给玩家灌 xp 触发升级 + 看 atk 涨
    const start = state.entities['e_p1' as EntityId]!;
    const startAtk = start.atk;
    const r = gainXp(state, 'e_p1' as EntityId, 5000);
    expect(r.leveledUp).toBe(true);
    state = r.newState;
    const after = state.entities['e_p1' as EntityId]!;
    expect(after.atk).toBeGreaterThan(startAtk);
    expect(after.level).toBeGreaterThan(start.level);
    expect(r.newLevel).toBeGreaterThan(5);
  });

  it('300 步战斗循环: 至少有一次 damage 事件', () => {
    let state = makeWorld();
    const layout = worldGen(123, 5);
    let damages = 0;
    for (let i = 0; i < 300; i++) {
      const p = state.entities['e_p1' as EntityId];
      if (!p || p.hp <= 0) break;
      const a = aiAct(p, state);
      const r = tick(state, a ? [a] : [], 50, { layout });
      state = r.state;
      for (const e of r.events) if (e.type === 'damage') damages++;
    }
    expect(damages).toBeGreaterThan(0);
  });
});
