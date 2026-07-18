/**
 * src/core/sim/dungeon.ts
 *
 * v1.2: 副本机制
 *
 * 借鉴 WoC 的 PARTY_MAX=5 硬编码坑: 用 DungeonConfig 集中化, 避免 magic number
 */
import { emptyState, addEntity, worldGen, generateEncounter } from './index';
import type { GameState, SimEntity, EntityId, MapLayout, ItemTemplate } from './types';

export interface DungeonConfig {
  id: string;
  name: string;
  /** 建议队伍规模 (informational, 不参与硬编码) */
  recommendedPartySize: number;
  bossId: EntityId;
  lootTable: ItemTemplate[];
  bossLevel: number;
  mapSize?: { width: number; height: number };
}

/**
 * 预定义副本池 (5 个)
 *
 * 每个 dungeon 有独立的 boss、战利品表、推荐等级，
 * 作为对 REPORT 第 78 行 "5+10 raid" 的基础实现。
 */
export const DUNGEON_POOL: Record<string, DungeonConfig> = {
  cave_1: {
    id: 'cave_1',
    name: '百鬼洞窟',
    recommendedPartySize: 3,
    bossId: 'e_boss_cave_1',
    bossLevel: 5,
    lootTable: [
      {
        id: 'sword_iron',
        name: '玄铁短剑',
        slot: 'weapon',
        affixes: [{ key: 'atk', value: 6 }],
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
        id: 'ring_focus',
        name: '凝神戒',
        slot: 'accessory',
        affixes: [{ key: 'atk', value: 2 }],
        rarity: 'common',
      },
    ],
  },
  temple: {
    id: 'temple',
    name: '妖狐神社',
    recommendedPartySize: 4,
    bossId: 'e_boss_temple',
    bossLevel: 8,
    lootTable: [
      {
        id: 'sword_jade',
        name: '青玉剑',
        slot: 'weapon',
        affixes: [{ key: 'atk', value: 10 }],
        rarity: 'rare',
      },
      {
        id: 'armor_metal',
        name: '玄铁重甲',
        slot: 'armor',
        affixes: [{ key: 'def', value: 9 }],
        rarity: 'rare',
      },
      {
        id: 'ring_focus',
        name: '凝神戒',
        slot: 'accessory',
        affixes: [{ key: 'atk', value: 2 }],
        rarity: 'common',
      },
    ],
  },
  forest: {
    id: 'forest',
    name: '迷いの森',
    recommendedPartySize: 3,
    bossId: 'e_boss_forest',
    bossLevel: 6,
    lootTable: [
      {
        id: 'sword_iron',
        name: '玄铁短剑',
        slot: 'weapon',
        affixes: [{ key: 'atk', value: 6 }],
        rarity: 'common',
      },
      {
        id: 'helm_bronze',
        name: '青铜盔',
        slot: 'helm',
        affixes: [
          { key: 'def', value: 3 },
          { key: 'hp', value: 10 },
        ],
        rarity: 'common',
      },
      {
        id: 'ring_focus',
        name: '凝神戒',
        slot: 'accessory',
        affixes: [{ key: 'atk', value: 2 }],
        rarity: 'common',
      },
    ],
  },
  necropolis: {
    id: 'necropolis',
    name: '怨灵墓地',
    recommendedPartySize: 4,
    bossId: 'e_boss_necropolis',
    bossLevel: 10,
    lootTable: [
      {
        id: 'sword_jade',
        name: '青玉剑',
        slot: 'weapon',
        affixes: [{ key: 'atk', value: 10 }],
        rarity: 'rare',
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
        affixes: [
          { key: 'def', value: 3 },
          { key: 'hp', value: 10 },
        ],
        rarity: 'common',
      },
    ],
  },
  catacomb: {
    id: 'catacomb',
    name: '地底回廊',
    recommendedPartySize: 5,
    bossId: 'e_boss_catacomb',
    bossLevel: 12,
    lootTable: [
      {
        id: 'sword_legendary',
        name: '百鬼斩',
        slot: 'weapon',
        affixes: [{ key: 'atk', value: 15 }],
        rarity: 'legendary',
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
        affixes: [
          { key: 'def', value: 3 },
          { key: 'hp', value: 10 },
        ],
        rarity: 'common',
      },
    ],
  },
};

/** 按 ID 查找预定义副本 */
export function getDungeonConfig(id: string): DungeonConfig | null {
  return DUNGEON_POOL[id] ?? null;
}

export interface LootEntry {
  itemId: string;
  recipientId: EntityId | null;
  template: ItemTemplate;
}

export interface LootDistribution {
  entries: LootEntry[];
  unassigned: LootEntry[];
  version: 1;
}

export function enterDungeon(
  baseState: GameState,
  dungeon: DungeonConfig,
): { state: GameState; layout: MapLayout; monsters: SimEntity[]; boss: SimEntity } {
  const seed = (baseState.rng ^ hashString(dungeon.id)) >>> 0;
  const layout = worldGen(seed, dungeon.bossLevel);

  let s = emptyState(seed);
  s = { ...s, rng: seed };

  const enc = generateEncounter(s, dungeon.bossLevel, s.rng);
  s = { ...s, rng: enc.nextRng };

  const monsterSpawns = layout.spawnPoints.slice(1);
  const monsters: SimEntity[] = [];
  for (let i = 0; i < Math.min(enc.monsters.length, 5); i++) {
    const m = enc.monsters[i]!;
    const sp = monsterSpawns[i % Math.max(1, monsterSpawns.length)] ?? { x: 5, y: 5 };
    const e: SimEntity = {
      id: `e_dungeon_${dungeon.id}_m${i + 1}` as EntityId,
      kind: 'monster',
      pos: sp,
      hp: m.hp,
      maxHp: m.hp,
      atk: m.atk,
      def: m.def,
      level: m.level,
      faction: 'enemy',
      inventory: [],
      equipment: {},
      buffs: [],
    };
    s = addEntity(s, e);
    monsters.push(e);
  }

  const bossSpawn = monsterSpawns[5] ?? { x: 10, y: 10 };
  const firstMonster = monsters[0];
  const boss: SimEntity = {
    id: dungeon.bossId,
    kind: 'monster',
    pos: bossSpawn,
    hp: (firstMonster?.hp ?? 30) * 5,
    maxHp: (firstMonster?.maxHp ?? 30) * 5,
    atk: (firstMonster?.atk ?? 5) * 2,
    def: (firstMonster?.def ?? 1) + 2,
    level: dungeon.bossLevel,
    faction: 'enemy',
    inventory: [],
    equipment: {},
    buffs: [],
  };
  s = addEntity(s, boss);

  return { state: s, layout, monsters, boss };
}

/**
 * 战利品分配 (借鉴 WoC 教训, 用 participants 列表而非硬编码 PARTY_MAX)
 *
 * - legendary: 给伤害最高者
 * - epic: 给第一个 participants
 * - rare: 随机分给一个参与者 (RNG)
 * - common: 分配给参与击杀者
 */
export function distributeLoot(
  lootTable: ItemTemplate[],
  participants: { id: EntityId; damageDealt: number }[],
  rngState: number,
): LootDistribution {
  const sorted = [...lootTable].sort((a, b) => {
    const rarityOrder: Record<string, number> = {
      legendary: 0,
      epic: 1,
      rare: 2,
      common: 3,
    };
    const ra = rarityOrder[a.rarity] ?? 99;
    const rb = rarityOrder[b.rarity] ?? 99;
    return ra - rb;
  });

  const topDps =
    participants.length > 0
      ? participants.reduce((a, b) => (a.damageDealt >= b.damageDealt ? a : b))
      : null;

  const entries: LootEntry[] = [];
  const unassigned: LootEntry[] = [];
  let rng = rngState;

  for (const item of sorted) {
    const rarity = item.rarity;

    if (rarity === 'legendary' && topDps) {
      entries.push({ itemId: item.id, recipientId: topDps.id, template: item });
    } else if (rarity === 'epic') {
      if (participants.length > 0) {
        entries.push({ itemId: item.id, recipientId: participants[0]!.id, template: item });
      } else {
        unassigned.push({ itemId: item.id, recipientId: null, template: item });
      }
    } else if (rarity === 'rare') {
      if (participants.length > 0) {
        rng = (rng * 1103515245 + 12345) >>> 0;
        const idx = rng % participants.length;
        const recipient = participants[idx]!;
        entries.push({ itemId: item.id, recipientId: recipient.id, template: item });
      } else {
        unassigned.push({ itemId: item.id, recipientId: null, template: item });
      }
    } else {
      // common
      if (participants.length > 0) {
        entries.push({ itemId: item.id, recipientId: participants[0]!.id, template: item });
      } else {
        unassigned.push({ itemId: item.id, recipientId: null, template: item });
      }
    }
  }

  return { entries, unassigned, version: 1 };
}

function hashString(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}
