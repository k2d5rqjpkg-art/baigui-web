import * as THREE from 'three';
import { ecs } from './ecs';

// ============ 组件类型 ============

export interface Position {
  x: number;
  y: number;
}

export interface Velocity {
  x: number;
  y: number;
}

export interface Health {
  current: number;
  max: number;
}

export interface Combat {
  attack: number;
  defense: number;
  speed: number;
}

export interface PlayerTag {
  /** 职业 */
  job: JobType;
}

export interface EnemyTag {
  type: EnemyType;
}

export interface MeshComponent {
  mesh: THREE.Mesh;
  w: number;
  h: number;
}

/** 经验与等级 */
export interface Experience {
  level: number;
  currentXp: number;
  nextLevelXp: number;
  totalXp: number;
}

/** 技能系统 */
export interface SkillSet {
  skills: Skill[];
}

export interface Skill {
  id: string;
  name: string;
  description: string;
  /** 冷却时间（秒） */
  cooldown: number;
  /** 当前剩余冷却 */
  currentCooldown: number;
  /** 伤害倍率（基于攻击力） */
  damageMultiplier: number;
  /** 技能类型 */
  type: 'melee' | 'ranged' | 'heal' | 'buff' | 'aoe';
  /** 范围 */
  range: number;
  /** 消耗 */
  cost: number;
  /** 图标（从颜色代表） */
  color: string;
}

/** 增益/减益效果 */
export interface Buff {
  id: string;
  name: string;
  duration: number;
  remaining: number;
  /** 攻击力加成 */
  attackBonus?: number;
  /** 防御力加成 */
  defenseBonus?: number;
  /** 速度加成 */
  speedBonus?: number;
}

export interface BuffList {
  buffs: Buff[];
}

export interface Loot {
  /** 金币 */
  gold: number;
  /** 经验 */
  xp: number;
}

export interface LootDrop {
  items: { gold: number; xp: number };
}

/** 投射物（飞剑/法术弹） */
export interface Projectile {
  mesh: THREE.Mesh;
  targetX: number;
  targetY: number;
  speed: number;
  damage: number;
  fromEntity: number;
  lifetime: number;
  alive: boolean;
}

// ============ 职业枚举 ============

export type JobType = '书生' | '剑客' | '术士' | '医者';

export type EnemyType = '游魂' | '兵煞' | '妖狐' | '夜叉';

export interface JobConfig {
  name: JobType;
  description: string;
  baseHp: number;
  baseAttack: number;
  baseDefense: number;
  baseSpeed: number;
  skills: Skill[];
  color: string;
}

export const JOBS: Record<JobType, JobConfig> = {
  '书生': {
    name: '书生',
    description: '以笔为剑，以墨为盾。攻守兼备。',
    baseHp: 100,
    baseAttack: 15,
    baseDefense: 5,
    baseSpeed: 10,
    color: '#f5e6c8',
    skills: [
      { id: 'brush_strike', name: '笔锋', description: '以毛笔疾刺敌人', cooldown: 0.5, currentCooldown: 0, damageMultiplier: 1.0, type: 'melee', range: 3, cost: 0, color: '#d4a017' },
      { id: 'ink_explosion', name: '墨爆', description: '泼墨成爆，范围伤害', cooldown: 3, currentCooldown: 0, damageMultiplier: 1.8, type: 'aoe', range: 4, cost: 0, color: '#1a1a2e' },
      { id: 'calligraphy_shield', name: '字盾', description: '以书法之力构筑护盾', cooldown: 8, currentCooldown: 0, damageMultiplier: 0, type: 'buff', range: 0, cost: 0, color: '#2d7d3a' },
    ],
  },
  '剑客': {
    name: '剑客',
    description: '近战霸主，高爆发高机动。',
    baseHp: 120,
    baseAttack: 22,
    baseDefense: 3,
    baseSpeed: 14,
    color: '#c0392b',
    skills: [
      { id: 'sword_slash', name: '斩击', description: '强力近战斩击', cooldown: 0.4, currentCooldown: 0, damageMultiplier: 1.2, type: 'melee', range: 3, cost: 0, color: '#c0392b' },
      { id: 'dash_attack', name: '突进', description: '向前冲刺并攻击路径上的敌人', cooldown: 4, currentCooldown: 0, damageMultiplier: 2.0, type: 'melee', range: 6, cost: 0, color: '#e74c3c' },
      { id: 'battle_cry', name: '战吼', description: '提升攻击力', cooldown: 10, currentCooldown: 0, damageMultiplier: 0, type: 'buff', range: 0, cost: 0, color: '#f39c12' },
    ],
  },
  '术士': {
    name: '术士',
    description: '远程法系，群体伤害。',
    baseHp: 80,
    baseAttack: 20,
    baseDefense: 2,
    baseSpeed: 8,
    color: '#8e44ad',
    skills: [
      { id: 'magic_missile', name: '法弹', description: '发射一枚法术飞弹', cooldown: 0.6, currentCooldown: 0, damageMultiplier: 0.8, type: 'ranged', range: 8, cost: 0, color: '#9b59b6' },
      { id: 'fire_ring', name: '火环', description: '以自身为中心释放火焰环', cooldown: 4, currentCooldown: 0, damageMultiplier: 1.5, type: 'aoe', range: 4, cost: 0, color: '#e74c3c' },
      { id: 'mana_shield', name: '灵盾', description: '灵力护体，提升防御', cooldown: 8, currentCooldown: 0, damageMultiplier: 0, type: 'buff', range: 0, cost: 0, color: '#3498db' },
    ],
  },
  '医者': {
    name: '医者',
    description: '治疗与辅助，团队支柱。',
    baseHp: 90,
    baseAttack: 8,
    baseDefense: 6,
    baseSpeed: 9,
    color: '#2d7d3a',
    skills: [
      { id: 'herb_throw', name: '药投', description: '投掷药材攻击敌人', cooldown: 0.7, currentCooldown: 0, damageMultiplier: 0.6, type: 'ranged', range: 6, cost: 0, color: '#27ae60' },
      { id: 'healing_light', name: '愈光', description: '恢复自身生命', cooldown: 5, currentCooldown: 0, damageMultiplier: -2.0, type: 'heal', range: 0, cost: 0, color: '#2ecc71' },
      { id: 'revitalize', name: '回春', description: '持续恢复生命', cooldown: 12, currentCooldown: 0, damageMultiplier: 0, type: 'buff', range: 0, cost: 0, color: '#1abc9c' },
    ],
  },
};

// ============ 经验表 ============

/** 升级所需经验 */
export function getXpForLevel(level: number): number {
  return Math.floor(50 * Math.pow(level, 1.5));
}

export function getEnemyXp(type: EnemyType): number {
  const map: Record<EnemyType, number> = {
    '游魂': 15,
    '兵煞': 30,
    '妖狐': 50,
    '夜叉': 80,
  };
  return map[type] || 20;
}

export function getEnemyGold(type: EnemyType): number {
  const map: Record<EnemyType, number> = {
    '游魂': 2,
    '兵煞': 5,
    '妖狐': 8,
    '夜叉': 15,
  };
  return map[type] || 3;
}
