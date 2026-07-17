/**
 * GameRoom - 服务端内存房间状态容器 (Day1.5 适配版)
 *
 * 一个 GameRoom 代表一局对战:
 *   - 固定的 roomId
 *   - 持有 GameState (来自 src/core/sim/types.ts,权威状态)
 *   - 当前地图 layout (走 worldGen 生成)
 *   - 上一次 tick 的事件流 (供 RL reward shaping)
 *
 * Day1.5 适配:
 *   - GameRoom.state 是 GameState (而不是 Map<EntityId, SimEntity>)
 *   - reset() 走真实 API: emptyState → worldGen → generateEncounter → ITEM_TABLE
 *   - advance() 走真实 API: tick(state, actions, dt, { layout })
 *   - addPlayer() 自动分配 EntityId (e_player_<n>)
 *
 * Day1 占位 API (已废弃):
 *   - spawnInitialEntities() → 不存在,被 reset() 内部 inline 取代
 *   - runTick() → 不存在,被 tick() (lowercase) 取代
 *   - TickEvent / Intent → 不存在,被 GameEvent / Action 取代
 */

import type {
  Action,
  EntityId,
  GameEvent,
  GameState,
  MapLayout,
  SimEntity,
} from '../src/core/sim/types.js';
import { tick, emptyState, addEntity } from '../src/core/sim/tick.js';
import { worldGen } from '../src/core/sim/world.js';
import { generateEncounter } from '../src/core/sim/encounters.js';
import { ITEM_TABLE } from '../src/core/sim/items.js';
import { generateRoomContent, talkToNpc, findAdjacentNpc, type NpcData } from './quest.js';
import { log } from '../src/core/log.js';
import type { PersistenceLayer } from './persistence.js';
import { gainXp, killRewardXp } from '../src/core/sim/progression.js';
import { gainSkillPointsOnLevelUp } from '../src/core/sim/skills.js';

const MAX_PLAYERS = 4;

/** RL 训练固定控制的 entity id (Day1 协议: 字符串字面量) */
export const ROOM_PLAYER_ID: EntityId = 'e_player_1';

export class GameRoom {
  readonly id: string;
  /** 权威 sim state —— 一切派生值从这里算 */
  state: GameState;
  /** 当前地图布局 (走 worldGen 生成) */
  layout: MapLayout;
  /** 被占用的玩家 slot —— 1..MAX_PLAYERS */
  readonly occupiedSlots = new Set<number>();
  /** 玩家 id → slot 编号 (用于 hello/welcome 协议) */
  readonly slotForPlayer = new Map<EntityId, number>();
  /** 上一次 tick 之后累积未读的事件 (供 RL reward shaping) */
  unconsumedEvents: GameEvent[] = [];
  /**
   * Day6.1: 房间内容 (quest + npcs)
   * - quest 来自 LLM/fallback
   * - npcs 邻接玩家时按 J 触发对话
   * reset() 时同步重新生成
   */
  content: import('./quest.js').RoomContent = { quest: null, npcs: [], generatedAt: 0 };
  /** v2.0: 持久化层 (可选, 默认 null 用 memory) */
  persistence: PersistenceLayer | null = null;

  constructor(id: string) {
    this.id = id;
    // 先占位初始化,reset() 真正建图
    this.state = emptyState(1);
    this.layout = worldGen(1, 1);
    this.reset(1);
  }

  /**
   * 重置房间到 seed 决定的初始状态
   *
   * 步骤:
   *   1. emptyState(seed) → 空 state
   *   2. 加 RL 玩家 (e_player_1) 在 spawnPoints[0]
   *   3. worldGen 生成地图 layout
   *   4. generateEncounter 生成怪物 → 转换成 SimEntity 加进 state
   *   5. 从 ITEM_TABLE 选 2-3 件物品 → 转换成 item entity 加进 state
   */
  reset(seed: number): void {
    // 1. 空 state
    let s: GameState = emptyState(seed >>> 0);

    // 2. 地图 (先于玩家/怪物,因为 spawnPoints 决定初始位置)
    this.layout = worldGen(s.rng, 1);

    // 3. 加 RL 玩家 (slot 1 → e_player_1)
    const playerSpawn = this.layout.spawnPoints[0] ?? { x: 1, y: 1 };
    const player: SimEntity = {
      id: ROOM_PLAYER_ID,
      kind: 'player',
      pos: { x: playerSpawn.x, y: playerSpawn.y },
      hp: 100,
      maxHp: 100,
      atk: 30,
      def: 5,
      level: 5,
      faction: 'player',
      inventory: [],
      equipment: {},
      buffs: [],
    };
    s = addEntity(s, player);

    // 4. 加怪物 —— 用 generateEncounter(state, level, rng)
    const encRng = s.rng;
    const encounter = generateEncounter(s, 1, encRng);
    s = { ...s, rng: encounter.nextRng };

    const monsterSpawns = this.layout.spawnPoints.slice(1);
    for (let i = 0; i < encounter.monsters.length; i++) {
      const m = encounter.monsters[i]!;
      const spawn = monsterSpawns[i % Math.max(1, monsterSpawns.length)] ?? { x: 2, y: 2 };
      const monster: SimEntity = {
        id: `e_monster_${i + 1}` as EntityId,
        kind: 'monster',
        pos: { x: spawn.x, y: spawn.y },
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
      s = addEntity(s, monster);
    }

    // 5. 加 2-3 件物品 (从 ITEM_TABLE 选,借用 inventory[0] 存模板 id)
    const itemSpawns = monsterSpawns.length > encounter.monsters.length
      ? monsterSpawns.slice(encounter.monsters.length)
      : this.layout.spawnPoints; // 兜底
    const itemTemplateIds = ['sword_iron', 'armor_leather', 'ring_focus'];
    for (let i = 0; i < itemTemplateIds.length; i++) {
      const templateId = itemTemplateIds[i]!;
      // 验证模板存在
      const tpl = ITEM_TABLE.find((it) => it.id === templateId);
      if (!tpl) continue;
      const spawn = itemSpawns[i % Math.max(1, itemSpawns.length)] ?? { x: 3, y: 3 };
      const item: SimEntity = {
        id: `e_item_${i + 1}` as EntityId,
        kind: 'item',
        pos: { x: spawn.x, y: spawn.y },
        hp: 0,
        maxHp: 0,
        atk: 0,
        def: 0,
        level: 0,
        faction: 'neutral',
        inventory: [templateId], // 借用字段存模板 id (见 items.ts)
        equipment: {},
        buffs: [],
      };
      s = addEntity(s, item);
    }

    this.state = s;
    this.unconsumedEvents = [];
    this.occupiedSlots.clear();
    this.slotForPlayer.clear();
    // RL 玩家占用 slot 1
    this.occupiedSlots.add(1);
    this.slotForPlayer.set(ROOM_PLAYER_ID, 1);

    // Day6.1: 同步生成 quest + npcs
    // 用 LLM/fallback 异步生成,这里 fire-and-forget
    // Day6.1+ 可改成 await + 显式 init 接口
    this.initContent(1).catch((err) => {
      log.error('[state] initContent failed:', err);
    });
  }

  /**
   * Day6.1: 初始化/重新生成房间内容 (quest + npcs)
   * 收集当前 entities 的 spawn points, 调 generateRoomContent
   */
  async initContent(level: number): Promise<void> {
    const spawnPoints = this.layout.spawnPoints;
    // 怪物 spawn 是 layout.spawnPoints 的一部分
    const monsterSpawns = Object.values(this.state.entities)
      .filter((e) => e.kind === 'monster')
      .map((e) => e.pos);
    this.content = await generateRoomContent(level, spawnPoints, monsterSpawns, this.id ? Number(this.id.replace(/\D/g, '')) || 1 : 1);
  }

  /**
   * Day6.1: 玩家与 NPC 对话 (优先缓存, 调 LLM/fallback)
   */
  async talkToNearestNpc(
    playerId: EntityId,
    playerContext: string = '',
  ): Promise<{ npc: NpcData; dialogue: { greeting: string; hint: string; farewell: string; source: string } } | null> {
    const player = this.state.entities[playerId];
    if (!player) return null;
    const npc = findAdjacentNpc(this.content.npcs, player.pos);
    if (!npc) return null;
    const dialogue = await talkToNpc(npc, playerId, playerContext);
    return { npc, dialogue };
  }

  /** 添加玩家 slot (slotId ∈ [1..MAX_PLAYERS]) - 用于 WebSocket 客户端
   *  返回新分配的 EntityId,或 null 表示无可用 slot */
  addPlayer(slotId: number): EntityId | null {
    if (slotId <= 0 || slotId > MAX_PLAYERS) return null;
    if (this.occupiedSlots.has(slotId)) return null;
    if (this.occupiedSlots.size >= MAX_PLAYERS) return null;

    // slot 1 → e_player_1 (固定 RL 玩家);slot 2..4 → e_player_<n>
    const eid = `e_player_${slotId}` as EntityId;
    this.occupiedSlots.add(slotId);
    this.slotForPlayer.set(eid, slotId);

    // 如果玩家不在 state 里 (slot != RL slot),新增一个 SimEntity
    if (slotId !== 1 && !this.state.entities[eid]) {
      const spawn = this.layout.spawnPoints[slotId - 1] ?? { x: slotId, y: slotId };
      const newPlayer: SimEntity = {
        id: eid,
        kind: 'player',
        pos: { x: spawn.x, y: spawn.y },
        hp: 100,
        maxHp: 100,
        atk: 30,
        def: 5,
        level: 5,
        faction: 'player',
        inventory: [],
        equipment: {},
        buffs: [],
      };
      this.state = addEntity(this.state, newPlayer);
    }

    return eid;
  }

  /** 移除玩家 (WebSocket 断开时调用) */
  removePlayer(eid: EntityId): void {
    const slot = this.slotForPlayer.get(eid);
    if (slot === undefined) return;
    this.occupiedSlots.delete(slot);
    this.slotForPlayer.delete(eid);
    // Day1.5: 不真正从 state.entities 移除,留给 GC
    // v2.0: 移除时自动 save (如果 persistence 配置了)
    if (this.persistence) {
      void this.persistence.savePlayer(eid, this.state).catch((err) => {
        log.warn(`[state] persistence savePlayer failed for ${eid}:`, err);
      });
    }
  }

  /** v2.0: 加载玩家保存 (连接时用) */
  async loadSavedPlayer(eid: EntityId): Promise<GameState | null> {
    if (!this.persistence) return null;
    return this.persistence.loadPlayer(eid);
  }

  /** v2.0: 主动保存玩家 */
  async savePlayer(eid: EntityId): Promise<void> {
    if (!this.persistence) {
      log.debug(`[state] savePlayer(${eid}) skipped: no persistence`);
      return;
    }
    await this.persistence.savePlayer(eid, this.state);
  }

  /**
   * 推进一步 sim,更新 state,返回 TickResult
   *
   * @param intents 真实 Action 数组 (move/attack/pickup/use_item)
   * @param dt 时间步长 (毫秒) —— 默认 50ms (20Hz)
   */
  advance(intents: Action[] = [], dt: number = 50): {
    state: GameState;
    events: GameEvent[];
    tick: number;
  } {
    const result = tick(this.state, intents, dt, { layout: this.layout });
    let nextState = result.state;
    const allEvents = [...result.events];

    // Day14: 击杀 → XP → 升级 → 技能点 (闭环)
    for (const e of result.events) {
      if (e.type !== 'death' || !e.source || !e.target) continue;
      const killer = nextState.entities[e.source];
      const victim = nextState.entities[e.target] ?? this.state.entities[e.target];
      if (!killer || killer.kind !== 'player') continue;
      // victim 可能已 hp=0 仍在 entities; level 取死亡前或当前
      const monsterLevel = victim?.level ?? 1;
      const xp = killRewardXp(monsterLevel);
      const xpResult = gainXp(nextState, e.source, xp);
      nextState = xpResult.newState;
      allEvents.push(...xpResult.events);
      if (xpResult.leveledUp) {
        nextState = gainSkillPointsOnLevelUp(nextState, e.source, xpResult.newLevel);
        log.info(
          `[room ${this.id}] ${e.source} +${xp}xp → lv${xpResult.newLevel} (+1 skill point)`,
        );
      }
    }

    this.state = nextState;
    this.unconsumedEvents.push(...allEvents);
    return {
      state: this.state,
      events: allEvents,
      tick: this.state.tick,
    };
  }

  /** 给客户端用的快照 (entities 拍平为数组) */
  getSnapshot(): {
    tick: number;
    entities: SimEntity[];
    layout: MapLayout;
  } {
    return {
      tick: this.state.tick,
      entities: Object.values(this.state.entities),
      layout: this.layout,
    };
  }

  /** 当前 tick (供 server.ts 读) */
  get tick(): number {
    return this.state.tick;
  }

  /** 当前 entity 数 (供 server.ts 读) */
  get entityCount(): number {
    return Object.keys(this.state.entities).length;
  }

  /** 通过 entityId 查 entity (供 bridge.ts 找最近敌人用) */
  getEntity(eid: EntityId): SimEntity | undefined {
    return this.state.entities[eid];
  }
}