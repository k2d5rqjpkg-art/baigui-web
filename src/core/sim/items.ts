/**
 * 装备 / 拾取 —— 纯函数实现
 *
 * 设计:
 *   - ItemTemplate 是静态表 (常量),不动
 *   - pickup() 返回新 state,把 itemId 对应的物品模板 id 装到 entity.equipment[slot]
 *   - 同 slot 已装备 → 替换,旧装备丢回 inventory(简化实现)
 *   - 注意:这里只移动"模板 id 字符串",真正的 item entity 在 tick 层处理
 */

import type {
  EntityId,
  EquipSlot,
  GameState,
  ItemTemplate,
  SimEntity,
} from './types';

/**
 * 静态词缀表 —— 至少 8 件,含 1 传说级。
 * 命名取自《百鬼夜行》风格 (与 baigui 主题一致)。
 */
export const ITEM_TABLE: ItemTemplate[] = [
  {
    id: 'sword_rusty',
    name: '锈铁剑',
    slot: 'weapon',
    affixes: [{ key: 'atk', value: 3 }],
    rarity: 'common',
  },
  {
    id: 'sword_iron',
    name: '玄铁短剑',
    slot: 'weapon',
    affixes: [{ key: 'atk', value: 6 }],
    rarity: 'common',
  },
  {
    id: 'sword_jade',
    name: '青玉剑',
    slot: 'weapon',
    affixes: [{ key: 'atk', value: 10 }],
    rarity: 'rare',
  },
  {
    id: 'sword_legendary',
    name: '百鬼斩',
    slot: 'weapon',
    affixes: [{ key: 'atk', value: 15 }],
    rarity: 'legendary',
  },
  {
    id: 'armor_cloth',
    name: '布衣',
    slot: 'armor',
    affixes: [{ key: 'def', value: 2 }],
    rarity: 'common',
  },
  {
    id: 'armor_leather',
    name: '皮甲',
    slot: 'armor',
    affixes: [{ key: 'def', value: 5 }],
    rarity: 'common',
  },
  {
    id: 'armor_metal',
    name: '玄铁重甲',
    slot: 'armor',
    affixes: [{ key: 'def', value: 9 }],
    rarity: 'rare',
  },
  {
    id: 'helm_bronze',
    name: '青铜盔',
    slot: 'helm',
    affixes: [{ key: 'def', value: 3 }, { key: 'hp', value: 10 }],
    rarity: 'common',
  },
  {
    id: 'ring_focus',
    name: '凝神戒',
    slot: 'accessory',
    affixes: [{ key: 'atk', value: 2 }, { key: 'def', value: 2 }],
    rarity: 'rare',
  },
];

/** 查表 —— 找不到返回 undefined (调用方需处理) */
export function getItemTemplate(id: string): ItemTemplate | undefined {
  return ITEM_TABLE.find((it) => it.id === id);
}

/**
 * 计算装备的词缀总和 —— 用于战斗时叠 atk / def / hp。
 * 返回对象是新的 (不可变),便于比较。
 */
export function sumAffixes(
  equipment: Partial<Record<EquipSlot, string>>,
): { atk: number; def: number; hp: number } {
  let atk = 0;
  let def = 0;
  let hp = 0;
  for (const slot of Object.keys(equipment) as EquipSlot[]) {
    const itemId = equipment[slot];
    if (!itemId) continue;
    const tpl = getItemTemplate(itemId);
    if (!tpl) continue;
    for (const a of tpl.affixes) {
      if (a.key === 'atk') atk += a.value;
      else if (a.key === 'def') def += a.value;
      else if (a.key === 'hp') hp += a.value;
    }
  }
  return { atk, def, hp };
}

// ============ pickup 核心 ============

export interface PickupResult {
  events: Array<{
    type: 'pickup' | 'equip_swap';
    source: EntityId;
    target: EntityId | null;
    data: Record<string, string | number | boolean>;
  }>;
  newState: GameState;
}

/**
 * 拾取物品 —— 把物品 entity 的模板 id 装备到 entity 的对应 slot。
 *
 * 规则:
 *   - 物品 entity 必须存在且 kind === 'item'
 *   - 该 item entity 的 hp/maxHp 字段被复用存"模板 id"(避免再加字段)
 *     简化:第 0 个字符是 kind 标识 + 模板 id —— 这里采用更干净的方式:
 *     我们约定 item entity 的某个约定字段存模板 id。
 *
 * 简化实现:item entity 的 *第一个 inventory 元素* 是模板 id。
 * (因为 item entity 没有 inventory 概念,这里是借用此字段作为"模板引用槽")
 *
 * 行为:
 *   - 同 slot 已有装备 → 旧装备回到 inventory,新装备占 slot
 *   - 拾取后物品 entity 从 state.entities 移除
 *   - 返回新 state (immutable)
 */
export function pickup(
  state: GameState,
  entityId: EntityId,
  itemId: EntityId,
): PickupResult {
  const entity = state.entities[entityId];
  const item = state.entities[itemId];

  if (!entity) {
    return {
      events: [],
      newState: state,
    };
  }
  if (!item || item.kind !== 'item') {
    return {
      events: [],
      newState: state,
    };
  }
  if (item.inventory.length === 0) {
    return {
      events: [],
      newState: state,
    };
  }
  const templateId = item.inventory[0]!;
  const tpl = getItemTemplate(templateId);
  if (!tpl) {
    return {
      events: [],
      newState: state,
    };
  }

  // 准备新 entity:装备同 slot 替换
  const oldEquip = entity.equipment[tpl.slot];
  const newInventory = [...entity.inventory];
  if (oldEquip) {
    // 旧装备退回背包
    newInventory.push(oldEquip);
  }
  // 物品模板 id 进入对应 slot
  const newEquipment: Partial<Record<EquipSlot, string>> = {
    ...entity.equipment,
    [tpl.slot]: templateId,
  };

  // 词缀总和变了 → 重新算 atk / def / maxHp
  // 注意:这里只对 equipment 的 bonus 重新求和;基础属性用 entity 已有值
  // 实现:把基础值从当前实体取出,然后加新装备词缀
  const affixDelta = sumAffixes(entity.equipment);
  const baseAtk = entity.atk - affixDelta.atk;
  const baseDef = entity.def - affixDelta.def;
  const baseMaxHp = entity.maxHp - affixDelta.hp;
  const newAffix = sumAffixes(newEquipment);

  const newEntity: SimEntity = {
    ...entity,
    inventory: newInventory,
    equipment: newEquipment,
    atk: baseAtk + newAffix.atk,
    def: baseDef + newAffix.def,
    maxHp: baseMaxHp + newAffix.hp,
    hp: Math.min(entity.hp, baseMaxHp + newAffix.hp),
  };

  const newEntities: Record<EntityId, SimEntity> = { ...state.entities };
  newEntities[entityId] = newEntity;
  delete newEntities[itemId];

  const events: PickupResult['events'] = [];
  if (oldEquip) {
    events.push({
      type: 'equip_swap',
      source: entityId,
      target: null,
      data: { slot: tpl.slot, oldItem: oldEquip, newItem: templateId },
    });
  }
  events.push({
    type: 'pickup',
    source: entityId,
    target: null,
    data: { slot: tpl.slot, item: templateId, itemName: tpl.name },
  });

  return {
    events,
    newState: { ...state, entities: newEntities },
  };
}