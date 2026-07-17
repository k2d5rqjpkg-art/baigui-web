/**
 * src/core/sim/__tests__/equip-inventory.test.ts
 * Day22: equipFromInventory
 */
import { describe, it, expect } from 'vitest';
import { emptyState, addEntity, ITEM_TABLE, equipFromInventory } from '../index';
import type { EntityId } from '../types';

describe('equipFromInventory', () => {
  const weaponId = ITEM_TABLE.find((i) => i.slot === 'weapon')?.id ?? ITEM_TABLE[0]!.id;

  it('从背包装到对应 slot', () => {
    let s = emptyState(1);
    s = addEntity(s, {
      id: 'e_p1' as EntityId,
      kind: 'player',
      pos: { x: 1, y: 1 },
      hp: 100, maxHp: 100, atk: 10, def: 5, level: 1,
      faction: 'player',
      inventory: [weaponId],
      equipment: {},
      buffs: [],
    });
    const r = equipFromInventory(s, 'e_p1' as EntityId, weaponId);
    expect(r.events.some((e) => e.type === 'equip_swap')).toBe(true);
    const p = r.newState.entities['e_p1' as EntityId]!;
    expect(p.inventory).not.toContain(weaponId);
    const tpl = ITEM_TABLE.find((i) => i.id === weaponId)!;
    expect(p.equipment[tpl.slot]).toBe(weaponId);
  });

  it('替换同 slot 旧装备退回背包', () => {
    const weapons = ITEM_TABLE.filter((i) => i.slot === 'weapon');
    if (weapons.length < 2) return;
    const a = weapons[0]!.id;
    const b = weapons[1]!.id;
    let s = emptyState(1);
    s = addEntity(s, {
      id: 'e_p1' as EntityId,
      kind: 'player',
      pos: { x: 1, y: 1 },
      hp: 100, maxHp: 100, atk: 10, def: 5, level: 1,
      faction: 'player',
      inventory: [b],
      equipment: { weapon: a },
      buffs: [],
    });
    const r = equipFromInventory(s, 'e_p1' as EntityId, b);
    const p = r.newState.entities['e_p1' as EntityId]!;
    expect(p.equipment.weapon).toBe(b);
    expect(p.inventory).toContain(a);
  });

  it('背包没有该物品 → 无事件', () => {
    let s = emptyState(1);
    s = addEntity(s, {
      id: 'e_p1' as EntityId,
      kind: 'player',
      pos: { x: 1, y: 1 },
      hp: 100, maxHp: 100, atk: 10, def: 5, level: 1,
      faction: 'player',
      inventory: [],
      equipment: {},
      buffs: [],
    });
    const r = equipFromInventory(s, 'e_p1' as EntityId, weaponId);
    expect(r.events.length).toBe(0);
  });
});
