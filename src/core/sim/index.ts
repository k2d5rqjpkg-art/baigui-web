/**
 * sim 模块 barrel export
 *
 * 设计:Day1 sim 核心的对外 API。
 * 上层 (renderer / replay / network) 只从这个文件 import。
 */

// 类型
export type {
  EntityId,
  EquipSlot,
  EntityKind,
  ClassKind,
  Affix,
  ItemTemplate,
  Buff,
  EntityData,
  XpData,
  ClassData,
  SkillLearnedData,
  KillStreakData,
  SimEntity,
  Action,
  GameEvent,
  GameEventType,
  RNGState,
  GameState,
  MonsterTemplate,
  Room,
  MapLayout,
  CombatResolution,
} from './types';

// RNG
export { seedFromString, nextRand, rand, randInt, chance, pickOne } from './rng';

// 子模块
export { resolveCombat } from './combat';
export { moveEntity } from './movement';
export type { MoveResult, MoveOptions } from './movement';
export { pickup, equipFromInventory, getItemTemplate, sumAffixes, ITEM_TABLE } from './items';
export type { PickupResult } from './items';
export { generateEncounter } from './encounters';
export { worldGen } from './world';
export { Recorder, replay, type ReplayFrame, type ReplayResult } from './replay';
// 核心入口
export { tick, emptyState, addEntity } from './tick';
export type { TickOptions, TickResult } from './tick';
