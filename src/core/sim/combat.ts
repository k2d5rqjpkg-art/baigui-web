/**
 * 战斗公式 —— 纯函数
 *
 * 公式:
 *   baseDmg  = max(1, attacker.atk - defender.def + jitter(rng))
 *   jitter   = [-2, +2] 整数 (取自 rng)
 *   crit     = 10% 概率,触发时 dmg *= 1.5
 *   dodge    = defender.level * 2% 概率,触发时 dmg = 0
 *
 * 顺序:先判定 dodge → 再算 dmg (含 crit) → 应用
 *
 * 设计:
 *   - 不修改入参 state,返回 newState
 *   - 死亡后 entity 留在 entities 里但 hp=0 (让上层 GC 决定何时移除)
 *   - 写 death 事件让 UI/网络层订阅
 */

import type {
  CombatResolution,
  EntityId,
  GameState,
  GameEvent,
  RNGState,
  SimEntity,
} from './types';
import { chance, randInt } from './rng';

const CRIT_CHANCE = 0.1;
const CRIT_MULTIPLIER = 1.5;
const JITTER_MIN = -2;
const JITTER_MAX = 2;
const BASE_DMG_MIN = 1;

function attackBuffBonus(entity: SimEntity): number {
  let bonus = 0;
  for (const b of entity.buffs) {
    if (b.type === 'buff' && typeof b.attackBonus === 'number') bonus += b.attackBonus;
  }
  return bonus;
}

function defenseBuffBonus(entity: SimEntity): number {
  let bonus = 0;
  for (const b of entity.buffs) {
    if (b.type === 'buff' && typeof b.defenseBonus === 'number') bonus += b.defenseBonus;
  }
  return bonus;
}

/**
 * 解析一次战斗 (单次攻击)。
 *
 * @param state 当前 state
 * @param attackerId 攻击者 entity id
 * @param defenderId 防御者 entity id
 * @param rng RNG 状态 (会被推进)
 */
export function resolveCombat(
  state: GameState,
  attackerId: EntityId,
  defenderId: EntityId,
  rng: RNGState,
): CombatResolution {
  const attacker = state.entities[attackerId];
  const defender = state.entities[defenderId];

  const events: GameEvent[] = [];

  if (!attacker || !defender) {
    return { events, newState: state };
  }
  if (attacker.faction === defender.faction) {
    // 同派系不互殴 —— 不产生事件,直接返回
    return { events, newState: state };
  }
  if (attacker.hp <= 0 || defender.hp <= 0) {
    // 已经死了,跳过
    return { events, newState: state };
  }

  // 应用 buff
  const atkTotal = attacker.atk + attackBuffBonus(attacker);
  const defTotal = defender.def + defenseBuffBonus(defender);

  // 1) dodge 判定
  const dodgeChance = Math.min(0.95, Math.max(0, defender.level * 0.02));
  const dodgeRoll = chance(rng, dodgeChance);
  let currentRng: RNGState = dodgeRoll.next;

  if (dodgeRoll.hit) {
    events.push({
      type: 'attack_miss',
      source: attackerId,
      target: defenderId,
      data: { reason: 'dodge' },
      tick: state.tick,
    });
    return { events, newState: state };
  }

  // 2) 伤害公式
  const jitter = randInt(currentRng, JITTER_MIN, JITTER_MAX);
  currentRng = jitter.next;
  const rawDmg = atkTotal - defTotal + jitter.value;
  const baseDmg = Math.max(BASE_DMG_MIN, rawDmg);

  // 3) crit 判定
  const critRoll = chance(currentRng, CRIT_CHANCE);
  currentRng = critRoll.next;
  const isCrit = critRoll.hit;
  const finalDmg = Math.max(1, Math.floor(baseDmg * (isCrit ? CRIT_MULTIPLIER : 1)));

  // 4) 应用到 defender
  const newDefenderHp = Math.max(0, defender.hp - finalDmg);
  const newDefender: SimEntity = {
    ...defender,
    hp: newDefenderHp,
  };

  events.push({
    type: 'damage',
    source: attackerId,
    target: defenderId,
    data: { amount: finalDmg, crit: isCrit, rawDmg: baseDmg },
    tick: state.tick,
  });
  if (isCrit) {
    events.push({
      type: 'attack_hit',
      source: attackerId,
      target: defenderId,
      data: { amount: finalDmg, crit: true },
      tick: state.tick,
    });
  } else {
    events.push({
      type: 'attack_hit',
      source: attackerId,
      target: defenderId,
      data: { amount: finalDmg, crit: false },
      tick: state.tick,
    });
  }

  // 5) 死亡事件
  const newEntities: Record<EntityId, SimEntity> = { ...state.entities };
  newEntities[defenderId] = newDefender;
  if (newDefenderHp === 0 && defender.hp > 0) {
    events.push({
      type: 'death',
      source: attackerId,
      target: defenderId,
      data: { entityName: defender.id },
      tick: state.tick,
    });
  }

  return {
    events,
    newState: { ...state, entities: newEntities, rng: currentRng },
  };
}
