/**
 * vitest: items
 *  - 词缀表 >= 8 件,含 1 传说级
 *  - 同 slot 替换逻辑
 *  - 拾取后物品 entity 从 state 移除
 *  - 装备词缀正确叠加到 atk/def/hp
 */

import { describe, it, expect } from 'vitest';
import { pickup, ITEM_TABLE, getItemTemplate, sumAffixes } from '../items';
import { emptyState, addEntity } from '../tick';
import type { SimEntity, EntityId } from '../types';

function mkPlayer(id: EntityId, opts: Partial<SimEntity> = {}): SimEntity {
  return {
    id,
    kind: 'player',
    pos: { x: 0, y: 0 },
    hp: 100,
    maxHp: 100,
    atk: 10,
    def: 5,
    level: 1,
    faction: 'player',
    inventory: [],
    equipment: {},
    buffs: [],
    ...opts,
  };
}

function mkItem(id: EntityId, templateId: string, x = 0, y = 0): SimEntity {
  return {
    id,
    kind: 'item',
    pos: { x, y },
    hp: 0,
    maxHp: 0,
    atk: 0,
    def: 0,
    level: 0,
    faction: 'neutral',
    inventory: [templateId], // 借用 inventory[0] 存模板 id
    equipment: {},
    buffs: [],
  };
}

describe('ITEM_TABLE', () => {
  it('has at least 8 items', () => {
    expect(ITEM_TABLE.length).toBeGreaterThanOrEqual(8);
  });

  it('has at least one legendary item with atk >= 15', () => {
    const legendaries = ITEM_TABLE.filter((i) => i.rarity === 'legendary');
    expect(legendaries.length).toBeGreaterThanOrEqual(1);
    for (const lg of legendaries) {
      const atkSum = lg.affixes.filter((a) => a.key === 'atk').reduce((s, a) => s + a.value, 0);
      expect(atkSum).toBeGreaterThanOrEqual(15);
    }
  });

  it('every item has affixes and valid slot', () => {
    const validSlots = new Set(['weapon', 'armor', 'helm', 'accessory']);
    for (const it of ITEM_TABLE) {
      expect(it.affixes.length).toBeGreaterThanOrEqual(1);
      expect(validSlots.has(it.slot)).toBe(true);
    }
  });
});

describe('getItemTemplate', () => {
  it('finds known item', () => {
    const t = getItemTemplate('sword_legendary');
    expect(t?.name).toBe('百鬼斩');
  });
  it('returns undefined for unknown', () => {
    expect(getItemTemplate('nope')).toBeUndefined();
  });
});

describe('sumAffixes', () => {
  it('sums atk, def, hp across slots', () => {
    const result = sumAffixes({
      weapon: 'sword_iron', // atk +6
      armor: 'armor_leather', // def +5
      helm: 'helm_bronze', // def +3, hp +10
    });
    expect(result.atk).toBe(6);
    expect(result.def).toBe(8);
    expect(result.hp).toBe(10);
  });
});

describe('pickup', () => {
  it('equips item to correct slot when slot is empty', () => {
    const s0 = addEntity(emptyState(1), mkPlayer('e_p'));
    const s1 = addEntity(s0, mkItem('e_i', 'sword_iron'));
    const r = pickup(s1, 'e_p', 'e_i');
    expect(r.newState.entities['e_p']!.equipment.weapon).toBe('sword_iron');
    expect(r.newState.entities['e_i']).toBeUndefined();
    expect(r.events.some((e) => e.type === 'pickup')).toBe(true);
  });

  it('replaces same-slot equipment, old goes to inventory', () => {
    const s0 = addEntity(emptyState(1), mkPlayer('e_p', { equipment: { weapon: 'sword_rusty' } }));
    const s1 = addEntity(s0, mkItem('e_i', 'sword_iron'));
    const r = pickup(s1, 'e_p', 'e_i');
    const p = r.newState.entities['e_p']!;
    expect(p.equipment.weapon).toBe('sword_iron');
    expect(p.inventory).toContain('sword_rusty');
    expect(r.events.some((e) => e.type === 'equip_swap')).toBe(true);
  });

  it('applies legendary sword atk+15 to player', () => {
    const s0 = addEntity(emptyState(1), mkPlayer('e_p', { atk: 10 }));
    const s1 = addEntity(s0, mkItem('e_i', 'sword_legendary'));
    const r = pickup(s1, 'e_p', 'e_i');
    expect(r.newState.entities['e_p']!.atk).toBe(10 + 15);
  });

  it('does not modify input state', () => {
    const s0 = addEntity(emptyState(1), mkPlayer('e_p'));
    const s1 = addEntity(s0, mkItem('e_i', 'sword_iron'));
    const before = JSON.stringify(s1);
    pickup(s1, 'e_p', 'e_i');
    expect(JSON.stringify(s1)).toBe(before);
  });

  it('handles missing entity gracefully (no throw)', () => {
    const s0 = emptyState(1);
    const s1 = addEntity(s0, mkItem('e_i', 'sword_iron'));
    const r = pickup(s1, 'e_unknown', 'e_i');
    expect(r.newState).toBe(s1);
    expect(r.events.length).toBe(0);
  });

  it('handles missing item gracefully', () => {
    const s0 = addEntity(emptyState(1), mkPlayer('e_p'));
    const r = pickup(s0, 'e_p', 'e_nonexistent' as EntityId);
    expect(r.newState).toBe(s0);
    expect(r.events.length).toBe(0);
  });
});