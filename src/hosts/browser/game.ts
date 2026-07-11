/**
 * src/hosts/browser/game.ts
 *
 * Day2: 浏览器宿主核心
 *
 * 职责:
 *   - 持有 sim 权威 GameState + MapLayout
 *   - 20Hz tick loop (调用 sim 核心的 tick())
 *   - sim EntityId ↔ ECS number id 双向映射
 *   - 同步 sim 状态到 ECS (渲染层读 ECS)
 *   - 暴露事件订阅 (renderer/hud 订阅)
 *   - 接收外部 Action 队列
 *
 * 设计哲学 (WoC 风格):
 *   - sim 是 source of truth, ECS 只是渲染中间层
 *   - 每帧从 sim 读 state, 重建 ECS entities (幂等)
 *   - events 流是渲染层唯一的更新信号
 */

import * as THREE from 'three';
import {
  tick as simTick,
  emptyState,
  addEntity,
  worldGen,
  generateEncounter,
  ITEM_TABLE,
} from '../../core/sim';
import type {
  GameState,
  Action,
  GameEvent,
  SimEntity,
  MapLayout,
  EntityId,
  ItemTemplate,
} from '../../core/sim';

// ============ 类型 ============

export interface BrowserGameOptions {
  seed?: number;
  level?: number;
  tickHz?: number;
}

export type GameEventHandler = (event: GameEvent) => void;

export interface PlayerSnapshot {
  id: EntityId;
  pos: { x: number; y: number };
  hp: number;
  maxHp: number;
  atk: number;
  def: number;
  level: number;
  alive: boolean;
}

// ============ BrowserGame 主类 ============

export class BrowserGame {
  private state: GameState;
  private layout: MapLayout;
  private options: Required<BrowserGameOptions>;

  // 玩家固定为 e_player_1 (与 server/bridge.ts 对齐)
  static readonly PLAYER_ID: EntityId = 'e_player_1' as EntityId;

  // 20Hz tick 调度
  private tickIntervalId: number | null = null;
  private lastTickTime = 0;

  // 待处理的 Action 队列 (input 模块 push, tick 时消费)
  private pendingActions: Action[] = [];

  // 最近一次 tick 的 events (供 hud 显示)
  private recentEvents: GameEvent[] = [];

  // 事件订阅 (renderer/hud 注册)
  private eventHandlers: GameEventHandler[] = [];

  // 玩家死亡回调
  onPlayerDeath?: () => void;

  // 玩家击杀回调 (用于音效/特效)
  onPlayerKill?: (monsterId: EntityId) => void;

  constructor(options: BrowserGameOptions = {}) {
    this.options = {
      seed: options.seed ?? Date.now() % 1_000_000,
      level: options.level ?? 1,
      tickHz: options.tickHz ?? 20,
    };

    // 1. emptyState 初始化
    this.state = emptyState(this.options.seed);

    // 2. 生成地图
    this.layout = worldGen(this.options.seed, this.options.level);

    // 3-5. 加玩家 + 怪物 + 物品 (共用 seedEntities)
    this.seedEntities();
  }

  // ============ 公共 API ============

  /** 启动 tick loop */
  start(): void {
    if (this.tickIntervalId !== null) return;
    const intervalMs = 1000 / this.options.tickHz;
    this.lastTickTime = performance.now();
    this.tickIntervalId = window.setInterval(() => this.tick(), intervalMs);
  }

  /** 停止 tick loop */
  stop(): void {
    if (this.tickIntervalId !== null) {
      clearInterval(this.tickIntervalId);
      this.tickIntervalId = null;
    }
  }

  /** 推入 Action (input 模块调用) */
  pushAction(action: Action): void {
    this.pendingActions.push(action);
  }

  /** 订阅事件 */
  onEvent(handler: GameEventHandler): () => void {
    this.eventHandlers.push(handler);
    return () => {
      const idx = this.eventHandlers.indexOf(handler);
      if (idx >= 0) this.eventHandlers.splice(idx, 1);
    };
  }

  /** 获取当前 state (供 renderer 读) */
  getState(): GameState {
    return this.state;
  }

  /** 获取地图布局 (供 renderer 画墙/房间) */
  getLayout(): MapLayout {
    return this.layout;
  }

  /** 获取玩家快照 (供 HUD 显示) */
  getPlayerSnapshot(): PlayerSnapshot | null {
    const p = this.state.entities[BrowserGame.PLAYER_ID];
    if (!p) return null;
    return {
      id: p.id,
      pos: { ...p.pos },
      hp: p.hp,
      maxHp: p.maxHp,
      atk: p.atk,
      def: p.def,
      level: p.level,
      alive: p.hp > 0,
    };
  }

  /** 获取所有 entities (renderer 用) */
  getEntities(): SimEntity[] {
    return Object.values(this.state.entities);
  }

  /** 获取最近一次 tick 的 events (HUD 显示) */
  getRecentEvents(): GameEvent[] {
    return this.recentEvents;
  }

  /** 获取地图宽高 (renderer 计算相机用) */
  getMapSize(): { width: number; height: number } {
    return { width: this.layout.width, height: this.layout.height };
  }

  /** 重置游戏 */
  reset(seed?: number): void {
    if (seed !== undefined) this.options.seed = seed;
    const oldEvents = this.recentEvents;
    const oldHandlers = this.eventHandlers;
    this.stop();

    // 重建
    this.state = emptyState(this.options.seed);
        this.layout = worldGen(this.options.seed, this.options.level);
        this.seedEntities();

        this.pendingActions = [];
        this.recentEvents = oldEvents; // 保留,直到下次 tick 覆盖
        this.eventHandlers = oldHandlers;

        this.start();
      }

      /** 从当前 seed 重新填充 entities (构造器和 reset 共用) */
      private seedEntities(): void {
        const playerSpawn = this.layout.spawnPoints[0] ?? { x: 5, y: 5 };
        this.state = addEntity(this.state, {
          id: BrowserGame.PLAYER_ID,
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
        });

        // 怪物
        const encounter = generateEncounter(this.state, this.options.level, this.state.rng);
        this.state = { ...this.state, rng: encounter.nextRng };
        for (let i = 0; i < encounter.monsters.length; i++) {
          const m = encounter.monsters[i];
          const spawn = this.layout.spawnPoints[(i + 1) % this.layout.spawnPoints.length] ?? { x: 10 + i, y: 10 };
          const monsterId = `e_monster_${i + 1}` as EntityId;
          this.state = addEntity(this.state, {
            id: monsterId,
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
          });
        }

        // 物品
        const itemSpawnPoints = this.layout.spawnPoints.slice(1);
        const itemTemplates: ItemTemplate[] = [...ITEM_TABLE];
        for (let i = 0; i < Math.min(itemSpawnPoints.length, itemTemplates.length); i++) {
          const template = itemTemplates[i];
          const spawn = itemSpawnPoints[i];
          const itemId = `e_item_${i + 1}` as EntityId;
          const atkAffix = template.affixes.find((a) => a.key === 'atk');
          const defAffix = template.affixes.find((a) => a.key === 'def');
          this.state = addEntity(this.state, {
            id: itemId,
            kind: 'item',
            pos: { x: spawn.x, y: spawn.y },
            hp: 0,
            maxHp: 0,
            atk: atkAffix?.value ?? 0,
            def: defAffix?.value ?? 0,
            level: 0,
            faction: 'neutral',
            inventory: [template.id],
            equipment: {},
            buffs: [],
          });
        }
      }

  // ============ 内部 ============

  private tick(): void {
    const now = performance.now();
    const dt = now - this.lastTickTime;
    this.lastTickTime = now;

    // 取出所有 pending actions (一次性处理)
    const actions = this.pendingActions.splice(0);

    // 调 sim 核心
    const result = simTick(this.state, actions, dt, { layout: this.layout });

    // 更新状态 (sim 返回新 state, 我们替换)
    this.state = result.state;
    this.recentEvents = result.events;

    // 分发事件
    for (const e of result.events) {
      for (const h of this.eventHandlers) {
        try {
          h(e);
        } catch (err) {
          console.error('[game] event handler error:', err);
        }
      }
    }

    // 玩家死亡检测
    const player = this.state.entities[BrowserGame.PLAYER_ID];
    if (player && player.hp <= 0 && this.onPlayerDeath) {
      this.onPlayerDeath();
    }

    // 击杀事件 → onPlayerKill
    for (const e of result.events) {
      if (e.type === 'death' && e.source === BrowserGame.PLAYER_ID && e.target) {
        if (this.onPlayerKill) this.onPlayerKill(e.target);
      }
    }
  }
}