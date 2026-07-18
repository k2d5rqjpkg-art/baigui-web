/**
 * src/core/sim/progression.ts
 *
 * Day8: 经验 + 升级系统
 *
 * 设计:
 *   - xp: 击杀怪物给 xp
 *   - level: xp 累计到阈值升 1 级
 *   - levelUp: 提升 atk/def/hp, 推 'level_up' event
 *   - 借鉴 WoC: 用 on_level_up 钩子 (我们用 GameEvent)
 */
import type { GameState, SimEntity, EntityId, GameEvent, EntityData, XpData } from './types';

export interface ProgressionConfig {
  /** xp 公式: nextLevelXp = BASE * (level ** EXPONENT) */
  baseXp: number;
  exponent: number;
  /** 升级加的属性 */
  hpPerLevel: number;
  atkPerLevel: number;
  defPerLevel: number;
}

export const DEFAULT_PROGRESSION: ProgressionConfig = {
  baseXp: 100,
  exponent: 1.5,
  hpPerLevel: 20,
  atkPerLevel: 5,
  defPerLevel: 2,
};

/** 下一级所需 xp */
export function xpToNextLevel(
  currentLevel: number,
  cfg: ProgressionConfig = DEFAULT_PROGRESSION,
): number {
  return Math.floor(cfg.baseXp * Math.pow(currentLevel, cfg.exponent));
}

/** 给 player 加 xp, 返回 { newState, leveledUp, newLevel, totalXpGained, events } */
export interface XpGainResult {
  newState: GameState;
  leveledUp: boolean;
  newLevel: number;
  totalXpGained: number;
  events: GameEvent[];
}

/** 给 entity 加经验, 检查升级 */
export function gainXp(
  state: GameState,
  entityId: EntityId,
  amount: number,
  cfg: ProgressionConfig = DEFAULT_PROGRESSION,
): XpGainResult {
  const entity = state.entities[entityId];
  if (!entity) {
    return { newState: state, leveledUp: false, newLevel: 0, totalXpGained: 0, events: [] };
  }

  let currentXp = 0;
  for (const d of entity.buffs) {
    if (d.type === 'xp') {
      currentXp = d.xp;
      break;
    }
  }
  let currentLevel = entity.level;

  currentXp += amount;
  let leveledUp = false;
  const events: GameEvent[] = [];

  // 可能升多级
  while (currentXp >= xpToNextLevel(currentLevel, cfg)) {
    currentXp -= xpToNextLevel(currentLevel, cfg);
    currentLevel++;
    leveledUp = true;
    events.push({
      type: 'level_up',
      source: entityId,
      target: entityId,
      data: { newLevel: currentLevel },
      tick: state.tick,
    });
  }

  // 更新 entity.level
  const newXpData: XpData = { type: 'xp', xp: currentXp };
  const others = entity.buffs.filter((d) => d.type !== 'xp');
  const newBuffs: EntityData[] = [...others, newXpData];

  const updatedEntity: SimEntity = {
    ...entity,
    level: currentLevel,
    hp: leveledUp ? entity.hp + cfg.hpPerLevel : entity.hp,
    maxHp: leveledUp ? entity.maxHp + cfg.hpPerLevel : entity.maxHp,
    atk: leveledUp ? entity.atk + cfg.atkPerLevel : entity.atk,
    def: leveledUp ? entity.def + cfg.defPerLevel : entity.def,
    buffs: newBuffs,
  };

  return {
    newState: { ...state, entities: { ...state.entities, [entityId]: updatedEntity } },
    leveledUp,
    newLevel: currentLevel,
    totalXpGained: amount,
    events,
  };
}

/** 杀怪给 xp (基于怪等级) */
export function killRewardXp(monsterLevel: number): number {
  return monsterLevel * 10 + 10;
}

/** 查 entity 当前经验值 */
export function getXp(entity: SimEntity): number {
  for (const d of entity.buffs) {
    if (d.type === 'xp') {
      return d.xp;
    }
  }
  return 0;
}

/** 查 entity 下一级所需 xp */
export function getXpToNext(
  entity: SimEntity,
  cfg: ProgressionConfig = DEFAULT_PROGRESSION,
): number {
  return xpToNextLevel(entity.level, cfg);
}
