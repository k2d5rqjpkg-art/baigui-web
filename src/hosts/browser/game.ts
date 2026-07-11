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
import { log } from '../../core/log';
import type { GameClient, StateMessage, WelcomeMessage } from './network';

// ============ 类型 ============

export type GameMode = 'local' | 'network';

export interface BrowserGameOptions {
  seed?: number;
  level?: number;
  tickHz?: number;
  /** 启动时尝试的 network client (Day4); undefined = 纯 local */
  networkClient?: GameClient | null;
}

type BrowserGameInternal = {
  seed: number;
  level: number;
  tickHz: number;
  networkClient: GameClient | null;
};

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
  private options: BrowserGameInternal;

  // 玩家固定为 e_player_1 (与 server/bridge.ts 对齐)
  static readonly PLAYER_ID: EntityId = 'e_player_1' as EntityId;

  // 当前模式 (Day4): local 本地 sim, network 远端 server
  private mode: GameMode = 'local';
  // network 模式下服务端分配的真实 EntityId (可能不是 e_player_1)
  private networkEid: EntityId = BrowserGame.PLAYER_ID;
  // 持有的 network client (断线时不销毁, 让 GameHost 决定)
  private client: GameClient | null = null;
  // 上次接收到的 events (从 server 广播)
  private networkEvents: GameEvent[] = [];

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

  // 玩家击杀回调 (用于音效/特效) — Day4 占位, 主流程暂未订阅
  onPlayerKill?: (monsterId: EntityId) => void;

  constructor(options: BrowserGameOptions = {}) {
    this.options = {
      seed: options.seed ?? Date.now() % 1_000_000,
      level: options.level ?? 1,
      tickHz: options.tickHz ?? 20,
      networkClient: options.networkClient ?? null,
    };

    // 1. emptyState 初始化
    this.state = emptyState(this.options.seed);

    // 2. 生成地图
    this.layout = worldGen(this.options.seed, this.options.level);

    // 3-5. 加玩家 + 怪物 + 物品 (共用 seedEntities)
    this.seedEntities();

    // Day4: 若传了 networkClient, 切换到 network 模式
    if (this.options.networkClient) {
      this.attachNetworkClient(this.options.networkClient);
    }
  }

  // ============ 公共 API ============

  /** 启动 tick loop */
  start(): void {
    if (this.mode === 'network') return; // network 模式不跑本地 tick
    if (this.tickIntervalId !== null) return;
    const intervalMs = 1000 / this.options.tickHz;
    this.lastTickTime = performance.now();
    this.tickIntervalId = window.setInterval(() => this.tick(), intervalMs);
  }

  /** 当前模式 (Day4) */
  getMode(): GameMode {
    return this.mode;
  }

  /** network 模式下玩家在服务端分配的真实 EntityId */
  getNetworkPlayerId(): EntityId {
    return this.networkEid;
  }

  /**
   * 挂载 network client, 切换到 network 模式
   *
   * 行为:
   *   - 停掉本地 sim tick
   *   - 等 'welcome' (server 分配 EntityId + 初始 snapshot)
   *   - 收到 'state' 后替换本地 state + emit events
   *   - pushAction 改为发 intent 到 server (而非进本地 pendingActions)
   */
  attachNetworkClient(client: GameClient): void {
    this.client = client;
    this.stop(); // 停掉本地 tick

    client.onWelcome = (msg: WelcomeMessage) => {
      this.networkEid = msg.entityId as EntityId;
      // 用 server 的 snapshot 替换本地 state (包括 player pos/HP/items/monsters)
      this.state = {
        tick: msg.snapshot.tick,
        rng: this.state.rng, // 保留 RNG (客户端不参与随机)
        entities: entitiesArrayToRecord(msg.snapshot.entities),
      };
      this.mode = 'network';
      log.info(`[game] switched to network mode, eid=${this.networkEid}`);
    };

    client.onState = (msg: StateMessage) => {
      if (this.mode !== 'network') return;
      this.state = {
        tick: msg.tick,
        rng: this.state.rng,
        entities: entitiesArrayToRecord(msg.entities),
      };
      this.networkEvents = msg.events;
      // emit events 给订阅者
      for (const e of msg.events) {
        for (const h of this.eventHandlers) {
          try { h(e); } catch (err) { log.error('[game] event handler error:', err); }
        }
      }
      // 死亡检测
      const player = this.state.entities[this.networkEid];
      if (player && player.hp <= 0 && this.onPlayerDeath) {
        this.onPlayerDeath();
      }
    };

    client.onClose = () => {
      if (this.mode === 'network') {
        log.warn('[game] network disconnected, falling back to local');
        this.mode = 'local';
        this.start();
      }
    };
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
    if (this.mode === 'network') {
      // network 模式: 把 Action 翻译成 Discrete (0..5), 发给 server
      const discrete = actionToDiscrete(action);
      if (discrete >= 0) this.client?.sendIntent(discrete);
      return;
    }
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
    const id = this.mode === 'network' ? this.networkEid : BrowserGame.PLAYER_ID;
    const p = this.state.entities[id];
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
    // network 模式: 发 reset intent 给 server (Day4+ 优化: 单独 /reset endpoint)
    // 当前简化: 不支持 network reset, 玩家按 R 提示重连
    if (this.mode === 'network') {
      log.warn('[game] reset() not supported in network mode, please reconnect');
      return;
    }

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
    // network 模式不走本地 sim
    if (this.mode === 'network') return;

    const now = performance.now();
    const dt = now - this.lastTickTime;
    this.lastTickTime = now;

    // 取出所有 pending actions (一次性处理)
    const actions = this.pendingActions.splice(0);

    // 注入 AI actions (怪物主动追玩家) + auto-pickup
    const aiActions = this.computeAIActions();
    const autoPickup = this.computeAutoPickup();
    const allActions = [...actions, ...aiActions, ...autoPickup];

    // 调 sim 核心
    const result = simTick(this.state, allActions, dt, { layout: this.layout });

    // 更新状态 (sim 返回新 state, 我们替换)
    this.state = result.state;
    this.recentEvents = result.events;

    // 分发事件
    for (const e of result.events) {
      for (const h of this.eventHandlers) {
        try {
          h(e);
        } catch (err) {
          log.error('[game] event handler error:', err);
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

  // ============ AI / 自动行为 (Day3) ============

  /**
   * 怪物 AI:
   *   - 邻接玩家 (曼哈顿 ≤ 1) → 自动 attack
   *   - 否则朝玩家方向移动一格 (每只怪物每 tick 都尝试一次)
   *   - 跳过已死亡怪物
   *   - 限制怪物总数 ≤ MAX_AI_PER_TICK, 防止一帧过多 action
   *
   * 复杂度: O(M) where M = alive monsters
   */
  private computeAIActions(): Action[] {
    const player = this.state.entities[BrowserGame.PLAYER_ID];
    if (!player || player.hp <= 0) return [];

    const actions: Action[] = [];
    const MAX_AI_PER_TICK = 8;
    let aiCount = 0;

    for (const [id, e] of Object.entries(this.state.entities) as [EntityId, SimEntity][]) {
      if (aiCount >= MAX_AI_PER_TICK) break;
      if (e.kind !== 'monster' || e.hp <= 0) continue;

      const dx = player.pos.x - e.pos.x;
      const dy = player.pos.y - e.pos.y;
      const dist = Math.abs(dx) + Math.abs(dy);

      if (dist <= 1) {
        // 邻接 → 攻击
        actions.push({
          type: 'attack',
          entityId: id,
          payload: { targetId: BrowserGame.PLAYER_ID },
        });
      } else if (dist > 1 && dist <= 12) {
        // 视野内 (≤12 曼哈顿) → 追玩家
        // 选差值更大的轴先移动 (简单贪心)
        const stepDx = Math.sign(dx);
        const stepDy = Math.sign(dy);
        if (Math.abs(dx) >= Math.abs(dy) && stepDx !== 0) {
          actions.push({
            type: 'move',
            entityId: id,
            payload: { dx: stepDx, dy: 0 },
          });
        } else if (stepDy !== 0) {
          actions.push({
            type: 'move',
            entityId: id,
            payload: { dx: 0, dy: stepDy },
          });
        }
      }
      aiCount++;
    }

    return actions;
  }

  /**
   * Auto-pickup:
   *   玩家与某物品同格子 → 自动 emit pickup action
   *   (避免玩家需要按 E 才能拿东西 — 肉鸽标配)
   */
  private computeAutoPickup(): Action[] {
    const player = this.state.entities[BrowserGame.PLAYER_ID];
    if (!player || player.hp <= 0) return [];

    const actions: Action[] = [];
    for (const [id, e] of Object.entries(this.state.entities) as [EntityId, SimEntity][]) {
      if (e.kind !== 'item') continue;
      if (e.pos.x === player.pos.x && e.pos.y === player.pos.y) {
        actions.push({
          type: 'pickup',
          entityId: BrowserGame.PLAYER_ID,
          payload: { itemId: id },
        });
      }
    }
    return actions;
  }
}

// ============ 工具函数 ============

/**
 * Action → Discrete (0..5) 翻译, 与 server/translateDiscrete 对称
 *
 *   0=上, 1=下, 2=左, 3=右, 4=attack, 5=pickup
 *   move 含 target/auto-target 信息的 (Day3 输入层) 被忽略
 *   (server 端会重新找最近敌人/物品)
 */
function actionToDiscrete(action: Action): number {
  switch (action.type) {
    case 'move': {
      const { dx, dy } = action.payload;
      if (dx === 0 && dy === -1) return 0; // 上
      if (dx === 0 && dy === 1) return 1;  // 下
      if (dx === -1 && dy === 0) return 2; // 左
      if (dx === 1 && dy === 0) return 3;  // 右
      return -1;
    }
    case 'attack':
      return 4;
    case 'pickup':
      return 5;
    case 'use_item':
      return -1; // Day1 stub
  }
}

/**
 * SimEntity[] → Record<EntityId, SimEntity> (服务端广播的快照转客户端 state 格式)
 * 抽出来避免 onWelcome/onState 两处重复 boilerplate
 */
function entitiesArrayToRecord(entities: SimEntity[]): Record<EntityId, SimEntity> {
  const map = {} as Record<EntityId, SimEntity>;
  for (const e of entities) {
    map[e.id] = e;
  }
  return map;
}