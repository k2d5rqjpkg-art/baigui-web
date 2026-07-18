/**
 * Sim 核心类型定义
 *
 * 设计哲学 (WoC 风格):
 *   - 一切都是值。state 是不可变的 Record,函数返回新 state,不修改入参。
 *   - 所有随机性走受控 RNG (Mulberry32),不走 Math.random / Date.now。
 *   - entities 用 Record<EntityId, SimEntity> 做 O(1) 查询,替代扫描。
 *   - 所有变化经 events 流出,UI / replay / network 都消费同一份事件流。
 *
 * 这是 Day1 sim 核心 —— Day0 的 ECS (src/core/ecs.ts) 是可变状态,
 * 这里走另一条路:把"权威状态"做成纯函数式的,renderer 适配层负责镜像。
 */

// ============ 基础 ID ============

/** 实体 ID 用模板字符串,便于序列化/回放/网络传输 */
export type EntityId = `e_${string}`;

/** 装备槽位 */
export type EquipSlot = 'weapon' | 'armor' | 'helm' | 'accessory';

/** 实体类型 */
export type EntityKind = 'player' | 'monster' | 'item';

// ============ 词缀 / 物品 ============

/**
 * 词缀 (Affix) —— 装备上的属性条目。
 * 严格 JSON 友好:只有 number/string,没有嵌套对象,便于 PCG 生成。
 */
export interface Affix {
  /** 属性键,例如 'atk' / 'def' / 'hp' */
  key: 'atk' | 'def' | 'hp';
  /** 数值 (整数) */
  value: number;
}

/** 物品模板 (静态表里的一条) */
export interface ItemTemplate {
  id: string;
  name: string;
  slot: EquipSlot;
  /** 词缀列表 —— 至少有一条 */
  affixes: Affix[];
  /** 稀有度 */
  rarity: 'common' | 'rare' | 'epic' | 'legendary';
}

// ============ Buff ============

export interface Buff {
  type: 'buff';
  id: string;
  name: string;
  /** 剩余 tick 数 (向下衰减到 0 时移除) */
  remaining: number;
  /** 攻击加成 (可选) */
  attackBonus?: number;
  /** 防御加成 (可选) */
  defenseBonus?: number;
}

// ============ 职业 / 经验 / 技能状态 ============

export type ClassKind = 'warrior' | 'mage' | 'rogue';

/** 经验值条目 (存 buffs) */
export interface XpData {
  type: 'xp';
  xp: number;
}

/** 职业信息 (存 buffs) */
export interface ClassData {
  type: 'class';
  classKind: ClassKind;
  skillPoints: number;
}

/** 已学技能 (存 buffs) */
export interface SkillLearnedData {
  type: 'skill_learned';
  skillId: string;
}

/** 连杀计数 (存 buffs) */
export interface KillStreakData {
  type: 'kill_streak';
  count: number;
}

/**
 * EntityData —— 判别联合类型
 * SimEntity.buffs 从 Buff[] → EntityData[],
 * 消除所有 (entity.buffs[i] as any).type 强制转换
 */
export type EntityData = Buff | XpData | ClassData | SkillLearnedData | KillStreakData;

// ============ SimEntity ============

/**
 * 模拟实体 —— player / monster / item 共享同一结构,
 * kind 区分用途。这避免了"实体类型爆炸"。
 */
export interface SimEntity {
  id: EntityId;
  kind: EntityKind;
  pos: { x: number; y: number };
  hp: number;
  maxHp: number;
  atk: number;
  def: number;
  level: number;
  /** 派系,影响敌我判定 (player vs monster) */
  faction: 'player' | 'enemy' | 'neutral';
  /** 背包:物品模板 id 列表 (引用,非复制) */
  inventory: string[];
  /** 装备:slot → 物品模板 id。同 slot 只能有一件。 */
  equipment: Partial<Record<EquipSlot, string>>;
  /** 实体数据列表 (Buff / Xp / Class / Skill / KillStreak) */
  buffs: EntityData[];
}

// ============ Action ============

/** 玩家或 AI 提交的动作 */
export type Action =
  | { type: 'move'; entityId: EntityId; payload: { dx: number; dy: number } }
  | { type: 'attack'; entityId: EntityId; payload: { targetId: EntityId } }
  | { type: 'pickup'; entityId: EntityId; payload: { itemId: EntityId } }
  | { type: 'use_item'; entityId: EntityId; payload: { itemId: string } };

// ============ GameEvent ============

export type GameEventType =
  | 'move'
  | 'attack_hit'
  | 'attack_miss'
  | 'damage'
  | 'death'
  | 'pickup'
  | 'equip_swap'
  | 'heal'
  | 'buff_apply'
  | 'buff_expire'
  | 'level_up'
  | 'tick_end'
  | 'unknown_action';

export interface GameEvent {
  type: GameEventType;
  /** 发起者 id (可能为空 —— 例如环境伤害) */
  source: EntityId | null;
  /** 目标 id (可能为空) */
  target: EntityId | null;
  /** 附加数据 —— 攻击伤害、装备 id 等 */
  data: GameEventData;
  /** 发生时的 tick */
  tick: number;
}

/**
 * GameEvent.data 的具体形态 —— 按 event type 分发
 * 顶层用 discriminated union 让 renderer/hud 不用 cast
 */
export type GameEventData =
  | DamageData
  | AttackMissData
  | DeathData
  | PickupData
  | MoveData
  | EquipData
  | TickEndData
  | LevelUpData
  | UnknownActionData;

export interface DamageData {
  amount: number;
  crit: boolean;
  rawDmg?: number;
}

export interface AttackMissData {
  reason: 'dodge';
}

export interface DeathData {
  entityName?: string;
  killer?: EntityId;
}

export interface PickupData {
  slot?: string;
  oldItem?: string;
  newItem?: string;
  item?: string;
  itemName?: string;
  itemId?: EntityId;
}

export interface MoveData {
  fromX: number;
  fromY: number;
  toX: number;
  toY: number;
}

export interface EquipData {
  slot: string;
  oldItem?: string;
  newItem?: string;
  item?: string;
  itemName?: string;
}

export interface TickEndData {
  tick: number;
  dt: number;
}

export interface LevelUpData {
  newLevel: number;
}

export interface UnknownActionData {
  reason: string;
  itemId?: string;
  dt?: number;
}

// ============ RNG ============

/**
 * Mulberry32 状态 —— 32-bit 无符号整数。
 * 我们把它当成结构化字段,每 tick 由 tick() 推进,
 * 这样同一个 state 推进两次结果相同 (确定性)。
 */
export type RNGState = number;

// ============ GameState ============

/**
 * 顶层游戏状态 —— 一切派生值都从这里算。
 * 不可变。所有"修改"都返回新对象。
 */
export interface GameState {
  /** 当前 tick 数 (从 0 开始,每 tick +1) */
  tick: number;
  /** RNG 状态 (Mulberry32) */
  rng: RNGState;
  /** 实体字典 —— O(1) 查询 */
  entities: Record<EntityId, SimEntity>;
}

// ============ 怪物模板 / 遭遇 / 地图布局 ============

export interface MonsterTemplate {
  id: string;
  name: string;
  level: number;
  hp: number;
  atk: number;
  def: number;
  /** 视觉标识 (颜色 hex) —— 用于 renderer 适配 */
  glyph: string;
}

export interface Room {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface MapLayout {
  width: number;
  height: number;
  rooms: Room[];
  /** 墙体坐标 (走 grid) */
  walls: Array<{ x: number; y: number }>;
  /** 出生点 (每个房间中心) */
  spawnPoints: Array<{ x: number; y: number }>;
}

// ============ Combat 内部结果 (用于 resolveCombat 返回) ============

export interface CombatResolution {
  events: GameEvent[];
  /** 新 state (immutable) */
  newState: GameState;
}
