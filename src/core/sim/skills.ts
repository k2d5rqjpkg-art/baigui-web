/**
 * src/core/sim/skills.ts
 *
 * Day12: 技能系统 (借鉴 WoC 27 天赋专精)
 *
 * 设计:
 *   - 3 类: warrior / mage / rogue
 *   - 每类 9 技能 (3 tier × 3 路径)
 *   - skill point: 升级时给 (1/级)
 *   - 学习技能: 解锁 + 永久
 *   - 学习后的技能提供 passive 加成
 */
import type { GameState, SimEntity, EntityId, GameEvent } from './types';

export type ClassKind = 'warrior' | 'mage' | 'rogue';

export type SkillTier = 'basic' | 'advanced' | 'master';

export type SkillPath = 'offense' | 'defense' | 'utility';

export interface Skill {
  id: string;
  name: string;
  classKind: ClassKind;
  tier: SkillTier;
  path: SkillPath;
  /** 解锁等级要求 */
  requiredLevel: number;
  /** 前置技能 (需先学) */
  prereq: string[];
  /** 加成 (atk/def/hp/atkSpeed/critPct) */
  bonuses: Array<{ stat: 'atk' | 'def' | 'hp' | 'critPct' | 'dodgePct'; value: number }>;
  description: string;
}

/** 技能库 (3 类 × 9 技能) */
export const SKILL_LIBRARY: Record<string, Skill> = {
  // === Warrior (3x3) ===
  'w-basic-power-strike': {
    id: 'w-basic-power-strike', name: '重击', classKind: 'warrior', tier: 'basic', path: 'offense',
    requiredLevel: 1, prereq: [],
    bonuses: [{ stat: 'atk', value: 5 }],
    description: '永久 +5 ATK',
  },
  'w-basic-shield-up': {
    id: 'w-basic-shield-up', name: '盾墙', classKind: 'warrior', tier: 'basic', path: 'defense',
    requiredLevel: 1, prereq: [],
    bonuses: [{ stat: 'def', value: 5 }],
    description: '永久 +5 DEF',
  },
  'w-basic-battle-cry': {
    id: 'w-basic-battle-cry', name: '战吼', classKind: 'warrior', tier: 'basic', path: 'utility',
    requiredLevel: 1, prereq: [],
    bonuses: [{ stat: 'critPct', value: 5 }],
    description: '永久 +5% crit',
  },
  'w-adv-whirlwind': {
    id: 'w-adv-whirlwind', name: '旋风斩', classKind: 'warrior', tier: 'advanced', path: 'offense',
    requiredLevel: 5, prereq: ['w-basic-power-strike'],
    bonuses: [{ stat: 'atk', value: 15 }],
    description: '永久 +15 ATK',
  },
  'w-adv-iron-skin': {
    id: 'w-adv-iron-skin', name: '铁皮', classKind: 'warrior', tier: 'advanced', path: 'defense',
    requiredLevel: 5, prereq: ['w-basic-shield-up'],
    bonuses: [{ stat: 'def', value: 15 }, { stat: 'hp', value: 30 }],
    description: '+15 DEF +30 HP',
  },
  'w-adv-SecondWind': {
    id: 'w-adv-SecondWind', name: '回春', classKind: 'warrior', tier: 'advanced', path: 'utility',
    requiredLevel: 5, prereq: ['w-basic-battle-cry'],
    bonuses: [{ stat: 'dodgePct', value: 5 }],
    description: '永久 +5% dodge',
  },
  'w-master-berserker': {
    id: 'w-master-berserker', name: '狂战士', classKind: 'warrior', tier: 'master', path: 'offense',
    requiredLevel: 10, prereq: ['w-adv-whirlwind'],
    bonuses: [{ stat: 'atk', value: 30 }, { stat: 'critPct', value: 10 }],
    description: '+30 ATK +10% crit',
  },
  'w-master-fortress': {
    id: 'w-master-fortress', name: '堡垒', classKind: 'warrior', tier: 'master', path: 'defense',
    requiredLevel: 10, prereq: ['w-adv-iron-skin'],
    bonuses: [{ stat: 'def', value: 30 }, { stat: 'hp', value: 100 }],
    description: '+30 DEF +100 HP',
  },
  'w-master-immortal': {
    id: 'w-master-immortal', name: '不死', classKind: 'warrior', tier: 'master', path: 'utility',
    requiredLevel: 10, prereq: ['w-adv-SecondWind'],
    bonuses: [{ stat: 'hp', value: 200 }, { stat: 'dodgePct', value: 10 }],
    description: '+200 HP +10% dodge',
  },

  // === Mage (3x3) ===
  'm-basic-fireball': {
    id: 'm-basic-fireball', name: '火球', classKind: 'mage', tier: 'basic', path: 'offense',
    requiredLevel: 1, prereq: [],
    bonuses: [{ stat: 'atk', value: 5 }],
    description: '永久 +5 ATK',
  },
  'm-basic-shield': {
    id: 'm-basic-shield', name: '魔法盾', classKind: 'mage', tier: 'basic', path: 'defense',
    requiredLevel: 1, prereq: [],
    bonuses: [{ stat: 'def', value: 5 }],
    description: '永久 +5 DEF',
  },
  'm-basic-mana-pool': {
    id: 'm-basic-mana-pool', name: '法力池', classKind: 'mage', tier: 'basic', path: 'utility',
    requiredLevel: 1, prereq: [],
    bonuses: [{ stat: 'hp', value: 20 }],
    description: '永久 +20 HP',
  },
  'm-adv-meteor': {
    id: 'm-adv-meteor', name: '陨石', classKind: 'mage', tier: 'advanced', path: 'offense',
    requiredLevel: 5, prereq: ['m-basic-fireball'],
    bonuses: [{ stat: 'atk', value: 15 }],
    description: '永久 +15 ATK',
  },
  'm-adv-arcane-barrier': {
    id: 'm-adv-arcane-barrier', name: '奥术屏障', classKind: 'mage', tier: 'advanced', path: 'defense',
    requiredLevel: 5, prereq: ['m-basic-shield'],
    bonuses: [{ stat: 'def', value: 15 }, { stat: 'hp', value: 30 }],
    description: '+15 DEF +30 HP',
  },
  'm-adv-teleport': {
    id: 'm-adv-teleport', name: '传送', classKind: 'mage', tier: 'advanced', path: 'utility',
    requiredLevel: 5, prereq: ['m-basic-mana-pool'],
    bonuses: [{ stat: 'dodgePct', value: 5 }],
    description: '永久 +5% dodge',
  },
  'm-master-arcane-blast': {
    id: 'm-master-arcane-blast', name: '奥术冲击', classKind: 'mage', tier: 'master', path: 'offense',
    requiredLevel: 10, prereq: ['m-adv-meteor'],
    bonuses: [{ stat: 'atk', value: 30 }, { stat: 'critPct', value: 10 }],
    description: '+30 ATK +10% crit',
  },
  'm-master-mana-shield': {
    id: 'm-master-mana-shield', name: '法力护盾', classKind: 'mage', tier: 'master', path: 'defense',
    requiredLevel: 10, prereq: ['m-adv-arcane-barrier'],
    bonuses: [{ stat: 'def', value: 30 }, { stat: 'hp', value: 100 }],
    description: '+30 DEF +100 HP',
  },
  'm-master-arcane-blast-x': {
    id: 'm-master-arcane-blast-x', name: '法术洪流', classKind: 'mage', tier: 'master', path: 'utility',
    requiredLevel: 10, prereq: ['m-adv-teleport'],
    bonuses: [{ stat: 'hp', value: 200 }, { stat: 'dodgePct', value: 10 }],
    description: '+200 HP +10% dodge',
  },

  // === Rogue (3x3) ===
  'r-basic-stab': {
    id: 'r-basic-stab', name: '刺击', classKind: 'rogue', tier: 'basic', path: 'offense',
    requiredLevel: 1, prereq: [],
    bonuses: [{ stat: 'atk', value: 5 }],
    description: '永久 +5 ATK',
  },
  'r-basic-dodge': {
    id: 'r-basic-dodge', name: '闪避', classKind: 'rogue', tier: 'basic', path: 'defense',
    requiredLevel: 1, prereq: [],
    bonuses: [{ stat: 'def', value: 5 }],
    description: '永久 +5 DEF',
  },
  'r-basic-stealth': {
    id: 'r-basic-stealth', name: '潜行', classKind: 'rogue', tier: 'basic', path: 'utility',
    requiredLevel: 1, prereq: [],
    bonuses: [{ stat: 'critPct', value: 5 }],
    description: '永久 +5% crit',
  },
  'r-adv-backstab': {
    id: 'r-adv-backstab', name: '背刺', classKind: 'rogue', tier: 'advanced', path: 'offense',
    requiredLevel: 5, prereq: ['r-basic-stab'],
    bonuses: [{ stat: 'atk', value: 15 }, { stat: 'critPct', value: 5 }],
    description: '+15 ATK +5% crit',
  },
  'r-adv-evasion': {
    id: 'r-adv-evasion', name: '高级闪避', classKind: 'rogue', tier: 'advanced', path: 'defense',
    requiredLevel: 5, prereq: ['r-basic-dodge'],
    bonuses: [{ stat: 'def', value: 15 }, { stat: 'dodgePct', value: 5 }],
    description: '+15 DEF +5% dodge',
  },
  'r-adv-lockpick': {
    id: 'r-adv-lockpick', name: '开锁', classKind: 'rogue', tier: 'advanced', path: 'utility',
    requiredLevel: 5, prereq: ['r-basic-stealth'],
    bonuses: [{ stat: 'hp', value: 30 }],
    description: '永久 +30 HP',
  },
  'r-master-assassinate': {
    id: 'r-master-assassinate', name: '暗杀', classKind: 'rogue', tier: 'master', path: 'offense',
    requiredLevel: 10, prereq: ['r-adv-backstab'],
    bonuses: [{ stat: 'atk', value: 30 }, { stat: 'critPct', value: 15 }],
    description: '+30 ATK +15% crit',
  },
  'r-master-shadow': {
    id: 'r-master-shadow', name: '暗影之躯', classKind: 'rogue', tier: 'master', path: 'defense',
    requiredLevel: 10, prereq: ['r-adv-evasion'],
    bonuses: [{ stat: 'def', value: 30 }, { stat: 'dodgePct', value: 15 }],
    description: '+30 DEF +15% dodge',
  },
  'r-master-ghost': {
    id: 'r-master-ghost', name: '鬼魅', classKind: 'rogue', tier: 'master', path: 'utility',
    requiredLevel: 10, prereq: ['r-adv-lockpick'],
    bonuses: [{ stat: 'hp', value: 200 }, { stat: 'critPct', value: 10 }],
    description: '+200 HP +10% crit',
  },
};

/** 玩家学过的技能 id 列表 (存 SimEntity.buffs 或新字段) */
// 借用 buffs 数组: { type: 'skill_learned', skillId }
export interface SkillLearnedBuff {
  type: 'skill_learned';
  skillId: string;
}

/** 玩家职业 + 学过的技能 (存 buffs) */
export interface ClassInfoBuff {
  type: 'class';
  classKind: ClassKind;
  skillPoints: number;
}

/** 获取 entity 已学技能 */
export function getLearnedSkills(entity: SimEntity): string[] {
  const skills: string[] = [];
  for (const b of entity.buffs) {
    if ((b as any).type === 'skill_learned') {
      skills.push((b as any).skillId);
    }
  }
  return skills;
}

/** 获取 entity 职业 (默认 warrior) */
export function getClass(entity: SimEntity): ClassKind {
  for (const b of entity.buffs) {
    if ((b as any).type === 'class') {
      return (b as any).classKind as ClassKind;
    }
  }
  return 'warrior';
}

/** 获取 entity 技能点 */
export function getSkillPoints(entity: SimEntity): number {
  for (const b of entity.buffs) {
    if ((b as any).type === 'class') {
      return (b as any).skillPoints ?? 0;
    }
  }
  return 0;
}

/** 升级给技能点 (1/级) */
export function gainSkillPointsOnLevelUp(state: GameState, entityId: EntityId, newLevel: number): GameState {
  const entity = state.entities[entityId];
  if (!entity) return state;
  const points = getSkillPoints(entity) + 1;
  const classKind = getClass(entity);
  const newBuffs = entity.buffs.filter((b) => (b as any).type !== 'class');
  newBuffs.push({ type: 'class', classKind, skillPoints: points } as any);
  return { ...state, entities: { ...state.entities, [entityId]: { ...entity, buffs: newBuffs } } };
}

/** 学技能结果 */
export interface LearnSkillResult {
  newState: GameState;
  success: boolean;
  reason: string;
  events: GameEvent[];
}

/** 学一个技能 (扣技能点 + 加 buff) */
export function learnSkill(
  state: GameState,
  entityId: EntityId,
  skillId: string,
): LearnSkillResult {
  const skill = SKILL_LIBRARY[skillId];
  if (!skill) {
    return { newState: state, success: false, reason: 'unknown skill', events: [] };
  }

  const entity = state.entities[entityId];
  if (!entity) {
    return { newState: state, success: false, reason: 'entity not found', events: [] };
  }

  const entityClass = getClass(entity);
  if (skill.classKind !== entityClass) {
    return { newState: state, success: false, reason: `wrong class (${entityClass} != ${skill.classKind})`, events: [] };
  }

  if (entity.level < skill.requiredLevel) {
    return { newState: state, success: false, reason: `level too low (${entity.level} < ${skill.requiredLevel})`, events: [] };
  }

  const learned = getLearnedSkills(entity);
  if (learned.includes(skillId)) {
    return { newState: state, success: false, reason: 'already learned', events: [] };
  }

  // 检查前置
  for (const prereq of skill.prereq) {
    if (!learned.includes(prereq)) {
      return { newState: state, success: false, reason: `missing prereq: ${prereq}`, events: [] };
    }
  }

  // 检查技能点
  const points = getSkillPoints(entity);
  if (points < 1) {
    return { newState: state, success: false, reason: 'no skill points', events: [] };
  }

  // 应用: 扣 1 点 + 保留已学技能 + 加新 skill_learned + 更新 class
  const newClassInfo: ClassInfoBuff = { type: 'class', classKind: entityClass, skillPoints: points - 1 };
  const kept = entity.buffs.filter(
    (b) => (b as any).type !== 'class',
  );
  const newBuffs = [...kept, newClassInfo as any, { type: 'skill_learned', skillId } as any];

  // 加 bonuses 到 entity stats
  let atk = entity.atk, def = entity.def, hp = entity.hp, maxHp = entity.maxHp;
  for (const b of skill.bonuses) {
    if (b.stat === 'atk') atk += b.value;
    else if (b.stat === 'def') def += b.value;
    else if (b.stat === 'hp') { hp += b.value; maxHp += b.value; }
    // critPct / dodgePct 暂不接 combat.ts, 只存 bonuses (未来可扩展)
  }

  const newEntity: SimEntity = {
    ...entity,
    atk,
    def,
    hp,
    maxHp,
    buffs: newBuffs,
  };

  const event: GameEvent = {
    type: 'level_up',  // 复用 level_up event, data 含 skillId
    source: entityId,
    target: entityId,
    data: { newLevel: 0 } as any,  // TODO: 加 SkillLearnedData
    tick: state.tick,
  };

  return {
    newState: { ...state, entities: { ...state.entities, [entityId]: newEntity } },
    success: true,
    reason: 'learned',
    events: [event],
  };
}

/** 按类获取技能列表 */
export function getSkillsByClass(classKind: ClassKind): Skill[] {
  return Object.values(SKILL_LIBRARY).filter((s) => s.classKind === classKind);
}

/** 按 tier 排序 (basic → advanced → master) */
export function sortByTier(skills: Skill[]): Skill[] {
  const order: Record<SkillTier, number> = { basic: 0, advanced: 1, master: 2 };
  return [...skills].sort((a, b) => order[a.tier] - order[b.tier]);
}