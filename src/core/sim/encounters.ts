/**
 * PCG 遭遇表 —— 按等级生成怪物组合
 *
 * 5 种怪物按等级分层:
 *   Lv 1-2: 小妖    (普通)
 *   Lv 2-4: 影狼    (普通)
 *   Lv 3-6: 鬼火    (稀有)
 *   Lv 5-9: 怨灵    (稀有)
 *   Lv 8+ : 百目鬼  (精英)
 *
 * 设计:
 *   - 每种怪物有"等级浮动"—— 实际 level = baseLevel + jitter(-1..+1)
 *   - 属性随等级缩放 (hp +5/lv, atk +1/lv, def +1/lv)
 *   - 数量按等级 1..3
 */

import type { GameState, MonsterTemplate, RNGState } from './types';
import { randInt, rand } from './rng';

interface MonsterSpec {
  name: string;
  baseLevel: number;
  baseHp: number;
  baseAtk: number;
  baseDef: number;
  glyph: string;
  minLevel: number;
  maxLevel: number;
}

const MONSTER_SPECS: MonsterSpec[] = [
  {
    name: '小妖',
    baseLevel: 1,
    baseHp: 12,
    baseAtk: 3,
    baseDef: 1,
    glyph: '#888888',
    minLevel: 1,
    maxLevel: 99,
  },
  {
    name: '影狼',
    baseLevel: 3,
    baseHp: 20,
    baseAtk: 5,
    baseDef: 2,
    glyph: '#4466aa',
    minLevel: 2,
    maxLevel: 99,
  },
  {
    name: '鬼火',
    baseLevel: 5,
    baseHp: 18,
    baseAtk: 7,
    baseDef: 1,
    glyph: '#aa4444',
    minLevel: 3,
    maxLevel: 99,
  },
  {
    name: '怨灵',
    baseLevel: 7,
    baseHp: 35,
    baseAtk: 9,
    baseDef: 4,
    glyph: '#8855aa',
    minLevel: 5,
    maxLevel: 99,
  },
  {
    name: '百目鬼',
    baseLevel: 10,
    baseHp: 60,
    baseAtk: 14,
    baseDef: 8,
    glyph: '#ddaa00',
    minLevel: 8,
    maxLevel: 99,
  },
];

/**
 * 给定等级,挑出该等级可出现的怪物池 (按 minLevel/maxLevel 过滤)
 */
function eligibleSpecs(level: number): MonsterSpec[] {
  return MONSTER_SPECS.filter((m) => level >= m.minLevel && level <= m.maxLevel);
}

/**
 * 生成一次遭遇 (返回怪物模板数组 + 推进后的 RNG)。
 *
 * 数量:level 1 → 1只,level 5 → 2只,level 9+ → 3只 (封顶)
 *
 * @param state 当前游戏状态 (取 tick 做次级随机源,确保纯函数)
 * @param level 玩家 / 区域等级
 * @param rng RNG 状态 (会被推进)
 */
export function generateEncounter(
  state: GameState,
  level: number,
  rng: RNGState,
): { monsters: MonsterTemplate[]; nextRng: RNGState } {
  const pool = eligibleSpecs(level);
  if (pool.length === 0) {
    return { monsters: [], nextRng: rng };
  }

  // 数量
  let currentRng = rng;
  const countRoll = randInt(currentRng, 1, 3);
  currentRng = countRoll.next;
  let count: number;
  if (level <= 2) count = 1;
  else if (level <= 5) count = 2;
  else count = Math.min(3, countRoll.value + 1);

  // 生成 count 只怪
  const monsters: MonsterTemplate[] = [];
  for (let i = 0; i < count; i++) {
    const r = rand(currentRng);
    currentRng = r.next;
    const idx = Math.floor(r.value * pool.length) % pool.length;
    const spec = pool[idx]!;

    // 等级浮动 -1..+1
    const lvlJitter = randInt(currentRng, -1, 1);
    currentRng = lvlJitter.next;
    const monsterLevel = Math.max(
      1,
      spec.baseLevel + lvlJitter.value + Math.floor((level - spec.baseLevel) * 0.3),
    );

    // 属性按等级缩放
    const lvlBonus = monsterLevel - spec.baseLevel;
    monsters.push({
      id: `m_${spec.name}_${state.tick}_${i}`,
      name: spec.name,
      level: monsterLevel,
      hp: spec.baseHp + lvlBonus * 5,
      atk: spec.baseAtk + lvlBonus * 1,
      def: spec.baseDef + lvlBonus * 1,
      glyph: spec.glyph,
    });
  }

  return { monsters, nextRng: currentRng };
}
