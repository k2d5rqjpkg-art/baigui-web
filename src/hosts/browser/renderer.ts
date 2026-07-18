/**
 * src/hosts/browser/renderer.ts
 *
 * Day2: Three.js 渲染层 (订阅 sim GameState + GameEvent)
 *
 * 职责:
 *   - 接收 BrowserGame 实例
 *   - 每帧从 game.getEntities() 同步 entities 到 Three.js mesh
 *   - 订阅 events 触发特效 (伤害飘字/拾取闪光/死亡)
 *   - 坐标系: sim (grid x,y) → Three.js (world unit), Y轴翻转
 *
 * 设计:
 *   - 渲染频率 60Hz (requestAnimationFrame)
 *   - sim 20Hz tick, 渲染读最新 state (不插值, 单人模式够用)
 *   - 每帧 O(N) 同步 entities (N ≤ 20, 无性能问题)
 */

import * as THREE from 'three';
import type { BrowserGame } from './game';
import type { SimEntity, GameEvent } from '../../core/sim';
import { createPlayerTexture, createEnemyTexture, createItemTexture } from '../../entities/sprites';
import type { EnemyType } from '../../entities/sprites';
import { sfx } from '../../render/sfx-gen';
import { AnimationMixer, ANIMATION_PRESETS } from '../../render/animation-mixer';
import { terrainToMesh, buildTerrainMesh } from '../../render/terrain-mesh';
import { settlementToMeshes } from '../../render/building-mesh';

// v3.5: 玩家 entity id 常量 (与 server/state.ts ROOM_PLAYER_ID 一致)
const ROOM_PLAYER_ID = 'e_player_1' as const;

const CELL_SIZE = 0.18; // sim 1 格 = 0.18 世界单位 (40x30 地图 → 7.2 x 5.4 世界单位)

// sim 怪物 (5 种) → Day0 EnemyType (4 种) 映射, 按 baseLevel 选最贴切的 sprite
function pickEnemySpriteType(level: number): EnemyType {
  if (level >= 8) return '夜叉';
  if (level >= 5) return '妖狐';
  if (level >= 3) return '兵煞';
  return '游魂';
}

export class GameRenderer {
  private scene: THREE.Scene;
  /** v3.5: 动画 mixer (借鉴 WoC 12 族生物骨骼动画) */
  private mixer = new AnimationMixer();
  private currentAnimation = 'idle';
  private animationTime = 0;
  /** Day11: terrain mesh + 村庄建筑 (借鉴 WoC 程序化几何) */
  private terrainMesh: THREE.Mesh | null = null;
  private buildingMeshes: THREE.Mesh[] = [];
  private camera: THREE.OrthographicCamera;
  private renderer: THREE.WebGLRenderer;
  private container: HTMLElement;

  // mesh 缓存: sim EntityId → THREE.Object3D
  private meshByEntityId = new Map<string, THREE.Object3D>();

  // 用于特效的 DOM 容器 (伤害飘字)
  private fxContainer: HTMLDivElement;

  private running = false;
  private rafId = 0;

  constructor(game: BrowserGame, container: HTMLElement) {
    this.container = container;

    // 渲染器
    this.renderer = new THREE.WebGLRenderer({ antialias: false, alpha: false });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.setClearColor(0x1a1a2e);
    container.appendChild(this.renderer.domElement);

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x1a1a2e);

    // 相机 (正交) — 视野覆盖整个 40x30 地图
    const mapSize = game.getMapSize();
    const worldW = mapSize.width * CELL_SIZE;
    const worldH = mapSize.height * CELL_SIZE;
    const aspect = container.clientWidth / container.clientHeight;
    const viewSize = Math.max(worldW, worldH) * 0.5;
    this.camera = new THREE.OrthographicCamera(
      -viewSize * aspect,
      viewSize * aspect,
      viewSize,
      -viewSize,
      0.1,
      100,
    );
    this.camera.position.set(0, 0, 10);
    this.camera.lookAt(0, 0, 0);

    window.addEventListener('resize', () => this.handleResize());

    // FX DOM 层 (伤害飘字)
    this.fxContainer = document.createElement('div');
    this.fxContainer.style.cssText = `
      position: absolute; inset: 0; pointer-events: none; z-index: 10;
      font-family: 'Microsoft YaHei', sans-serif; font-weight: bold;
    `;
    container.style.position = 'relative';
    container.appendChild(this.fxContainer);

    // 订阅 sim events
    game.onEvent((e) => this.handleEvent(e));

    // 初始构建场景
    this.buildWorld(game);
  }

  start(): void {
    if (this.running) return;
    this.running = true;
    // v3.5: 初始化 AnimationMixer, 预加载 5 个动画 clip
    for (const clip of Object.values(ANIMATION_PRESETS)) {
      this.mixer.register(clip);
    }
    this.playAnimation('idle');
    this.tick();
  }

  /** v3.5: 切换动画 (借鉴 WoC 多族生物动画切换) */
  private playAnimation(name: string, loop: boolean = true): void {
    if (this.currentAnimation === name) return;
    this.mixer.play(name, loop);
    this.currentAnimation = name;
    this.animationTime = 0;
  }

  /** v3.5: 在 tick 里 update mixer (数据准备好给 Three.js 用) */
  private updateAnimation(dt: number): void {
    this.animationTime += dt;
    this.mixer.update(dt);
  }

  stop(): void {
    this.running = false;
    if (this.rafId) cancelAnimationFrame(this.rafId);
  }

  dispose(): void {
    this.stop();
    this.renderer.dispose();
    this.scene.clear();
    this.meshByEntityId.clear();
    this.fxContainer.remove();
  }

  // ============ 内部 ============

  private handleResize(): void {
    const w = this.container.clientWidth;
    const h = this.container.clientHeight;
    this.renderer.setSize(w, h, false);
    const aspect = w / h;
    const viewSize = this.camera.top;
    this.camera.left = -viewSize * aspect;
    this.camera.right = viewSize * aspect;
    this.camera.updateProjectionMatrix();
  }

  private tick = (): void => {
    if (!this.running) return;
    this.rafId = requestAnimationFrame(this.tick);

    // v3.5: 推进动画 mixer (~60fps)
    this.updateAnimation(1 / 60);

    // 60Hz 渲染: 不重读 game state (20Hz sim 给的数据, 渲染层补间)
    this.renderer.render(this.scene, this.camera);
  };

  /** 构建地图背景 (地板 + 房间 + 墙) */
  private buildWorld(game: BrowserGame): void {
    const layout = game.getLayout();

    // 1. 整个地图底色 (深紫 = 墙外)
    const mapW = layout.width * CELL_SIZE;
    const mapH = layout.height * CELL_SIZE;
    const bgGeo = new THREE.PlaneGeometry(mapW, mapH);
    const bgMat = new THREE.MeshBasicMaterial({ color: 0x0d0d1f });
    const bg = new THREE.Mesh(bgGeo, bgMat);
    bg.position.z = -2;
    this.scene.add(bg);

    // 2. 每个房间 (亮色 = 地板)
    const floorMat = new THREE.MeshBasicMaterial({ color: 0x333366 });
    for (const room of layout.rooms) {
      const w = room.w * CELL_SIZE;
      const h = room.h * CELL_SIZE;
      const geo = new THREE.PlaneGeometry(w, h);
      const mesh = new THREE.Mesh(geo, floorMat);
      mesh.position.set(this.gridX(room.x + room.w / 2), this.gridY(room.y + room.h / 2), -1);
      this.scene.add(mesh);
    }

    // 3. 墙壁网格线 (lines, 给地图纹理感)
    const wallMat = new THREE.LineBasicMaterial({
      color: 0x444488,
      transparent: true,
      opacity: 0.4,
    });
    const points: THREE.Vector3[] = [];
    for (const room of layout.rooms) {
      const x1 = this.gridX(room.x);
      const y1 = this.gridY(room.y);
      const x2 = this.gridX(room.x + room.w);
      const y2 = this.gridY(room.y + room.h);
      points.push(new THREE.Vector3(x1, y1, -0.5), new THREE.Vector3(x2, y1, -0.5));
      points.push(new THREE.Vector3(x2, y1, -0.5), new THREE.Vector3(x2, y2, -0.5));
      points.push(new THREE.Vector3(x2, y2, -0.5), new THREE.Vector3(x1, y2, -0.5));
      points.push(new THREE.Vector3(x1, y2, -0.5), new THREE.Vector3(x1, y1, -0.5));
    }
    if (points.length > 0) {
      const geo = new THREE.BufferGeometry().setFromPoints(points);
      const lines = new THREE.LineSegments(geo, wallMat);
      this.scene.add(lines);
    }

    // 5. 初始 entities
    this.syncEntities(game);

    // 6. Day11: 程序化地形 + 村庄 (借鉴 WoC Three.js 几何)
    // terrain mesh: 用 sim 网格宽高, 中心偏移对齐 renderer 坐标系
    const w = layout.width;
    const h = layout.height;
    // 中心偏移: sim 中心 (w/2, h/2) → world 中心
    const centerX = -((w - 1) / 2) * CELL_SIZE;
    const centerY = ((h - 1) / 2) * CELL_SIZE;
    this.terrainMesh = buildTerrainMesh(42, w, h);
    this.terrainMesh.position.set(centerX, centerY, -1.5);
    this.terrainMesh.scale.set(CELL_SIZE, CELL_SIZE, 1);
    this.scene.add(this.terrainMesh);

    // 村庄: 在地图中心生成 5 个建筑
    this.buildingMeshes = settlementToMeshes(0, 0, 5, 42, 10);
    for (const b of this.buildingMeshes) {
      // building 的 x/z 是 sim 坐标, 转 world
      b.position.set(b.position.x * CELL_SIZE, b.position.y * CELL_SIZE, b.position.z * CELL_SIZE);
      this.scene.add(b);
    }
  }

  /** 每帧从 sim 同步 entities 到 mesh */
  private syncEntities(game: BrowserGame): void {
    const entities = game.getEntities();
    const seen = new Set<string>();

    for (const e of entities) {
      if (e.hp <= 0 && e.kind !== 'item') continue; // 死亡实体不渲染
      seen.add(e.id);

      let mesh = this.meshByEntityId.get(e.id);
      if (!mesh) {
        mesh = this.createMesh(e);
        this.meshByEntityId.set(e.id, mesh);
        this.scene.add(mesh);
      }

      // 更新位置
      mesh.position.set(this.gridX(e.pos.x), this.gridY(e.pos.y), 0);
    }

    // 清理已不存在的 entities
    for (const [id, mesh] of this.meshByEntityId) {
      if (!seen.has(id)) {
        this.scene.remove(mesh);
        this.meshByEntityId.delete(id);
      }
    }
  }

  /** 根据 entity kind 创建对应 mesh */
  private createMesh(e: SimEntity): THREE.Object3D {
    if (e.kind === 'player') {
      // 玩家: Day0 像素风 sprite (默认书生职业)
      const tex = createPlayerTexture('书生');
      const mat = new THREE.SpriteMaterial({ map: tex, transparent: true });
      const sprite = new THREE.Sprite(mat);
      sprite.scale.set(CELL_SIZE * 1.2, CELL_SIZE * 1.2, 1);
      return sprite;
    }
    if (e.kind === 'monster') {
      // 怪物: Day0 sprite 工厂 + HP 条
      const group = new THREE.Group();
      const tex = createEnemyTexture(pickEnemySpriteType(e.level));
      const mat = new THREE.SpriteMaterial({ map: tex, transparent: true });
      const sprite = new THREE.Sprite(mat);
      sprite.scale.set(CELL_SIZE * 1.0, CELL_SIZE * 1.0, 1);
      group.add(sprite);

      // HP 条 (背景)
      const hpBg = new THREE.Mesh(
        new THREE.PlaneGeometry(CELL_SIZE * 0.9, CELL_SIZE * 0.12),
        new THREE.MeshBasicMaterial({ color: 0x330000 }),
      );
      hpBg.position.set(0, CELL_SIZE * 0.65, 0.1);
      group.add(hpBg);

      // HP 条 (前景)
      const ratio = e.hp / Math.max(1, e.maxHp);
      const hpFg = new THREE.Mesh(
        new THREE.PlaneGeometry(CELL_SIZE * 0.9 * ratio, CELL_SIZE * 0.12),
        new THREE.MeshBasicMaterial({ color: ratio > 0.3 ? 0xcc3333 : 0xff6600 }),
      );
      hpFg.position.set((-CELL_SIZE * 0.9 * (1 - ratio)) / 2, CELL_SIZE * 0.65, 0.2);
      group.add(hpFg);
      (group as any).__hpBar = sprite;

      return group;
    }
    // item: 按 template id 决定外观
    const itemTplId = (e.inventory?.[0] ?? 'generic') as string;
    const tex = createItemTexture(itemTplId);
    const mat = new THREE.SpriteMaterial({ map: tex, transparent: true });
    const sprite = new THREE.Sprite(mat);
    sprite.scale.set(CELL_SIZE * 0.7, CELL_SIZE * 0.7, 1);
    return sprite;
  }

  /** 处理 sim events (伤害飘字/拾取闪光/死亡) */
  private handleEvent(e: GameEvent): void {
    if (e.type === 'damage') {
      // 找到 target 位置, 显示伤害数字
      const targetId = e.target;
      if (!targetId) return;
      const mesh = this.meshByEntityId.get(targetId);
      if (!mesh) return;
      const amount = 'amount' in e.data ? e.data.amount : 0;
      const crit = 'crit' in e.data ? e.data.crit : false;
      this.showDamageText(mesh.position.x, mesh.position.y, amount, crit);
      // v3.5: SFX 触发 (借鉴 WoC 11Labs 合成音效)
      // source 是攻击者, 是玩家才播 hit 音
      if (e.source === ROOM_PLAYER_ID) {
        sfx.play('attack');
      } else {
        sfx.play('hit');
      }
    } else if (e.type === 'death') {
      // 目标实体立即从 mesh 移除
      const targetId = e.target;
      if (targetId) {
        const mesh = this.meshByEntityId.get(targetId);
        if (mesh) {
          this.scene.remove(mesh);
          this.meshByEntityId.delete(targetId);
        }
        // 死亡闪烁
        const pos = this.getEntityWorldPos(targetId);
        if (pos) this.flashAt(pos.x, pos.y, 'rgba(255,80,80,0.4)');
        // v3.5: 死亡 SFX + 动画
        sfx.play('death');
        if (targetId === ROOM_PLAYER_ID) {
          this.playAnimation('death');
        }
      }
    } else if (e.type === 'pickup') {
      const targetId = e.target;
      if (targetId) {
        const pos = this.getEntityWorldPos(targetId);
        if (pos) this.flashAt(pos.x, pos.y, 'rgba(255,215,0,0.6)');
        // 物品消失
        const mesh = this.meshByEntityId.get(targetId);
        if (mesh) {
          this.scene.remove(mesh);
          this.meshByEntityId.delete(targetId);
        }
        // v3.5: 拾取 SFX
        sfx.play('pickup');
      }
    }
  }

  /** 同步实体 (renderer 外部可调用, 比如 sim tick 之后) */
  public refresh(game: BrowserGame): void {
    this.syncEntities(game);
  }

  // ============ 工具 ============

  /** sim grid X → Three.js world X (中心化) */
  private gridX(gx: number): number {
    return (gx - 20) * CELL_SIZE;
  }

  private gridY(gy: number): number {
    return -(gy - 15) * CELL_SIZE; // Y 翻转 + 中心化 (40x30 地图中心约 (20,15))
  }

  private getEntityWorldPos(id: string): { x: number; y: number } | null {
    const mesh = this.meshByEntityId.get(id);
    if (!mesh) return null;
    return { x: mesh.position.x, y: mesh.position.y };
  }

  /** DOM 飘字 (伤害) */
  private showDamageText(worldX: number, worldY: number, amount: number, crit: boolean): void {
    // world → screen (用 camera.project)
    const v = new THREE.Vector3(worldX, worldY, 0).project(this.camera);
    const x = (v.x * 0.5 + 0.5) * this.container.clientWidth;
    const y = (-v.y * 0.5 + 0.5) * this.container.clientHeight;

    const el = document.createElement('div');
    el.textContent = crit ? `${amount}!` : `-${amount}`;
    el.style.cssText = `
      position: absolute; left: ${x}px; top: ${y}px;
      transform: translate(-50%, -50%);
      color: ${crit ? '#ff5555' : '#ffaa44'};
      font-size: ${crit ? '28px' : '20px'};
      text-shadow: 2px 2px 4px #000;
      animation: floatUp 800ms ease-out forwards;
      pointer-events: none;
    `;
    this.fxContainer.appendChild(el);
    setTimeout(() => el.remove(), 800);
  }

  private flashAt(worldX: number, worldY: number, color: string): void {
    const v = new THREE.Vector3(worldX, worldY, 0).project(this.camera);
    const x = (v.x * 0.5 + 0.5) * this.container.clientWidth;
    const y = (-v.y * 0.5 + 0.5) * this.container.clientHeight;
    const flash = document.createElement('div');
    flash.style.cssText = `
      position: absolute; left: ${x - 30}px; top: ${y - 30}px;
      width: 60px; height: 60px; border-radius: 50%;
      background: ${color}; animation: pulse 400ms ease-out forwards;
      pointer-events: none;
    `;
    this.fxContainer.appendChild(flash);
    setTimeout(() => flash.remove(), 400);
  }

  // ============ Utility ============
}

function makeCanvasTexture(
  size: number,
  draw: (ctx: CanvasRenderingContext2D) => void,
): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  draw(ctx);
  const tex = new THREE.CanvasTexture(canvas);
  tex.magFilter = THREE.NearestFilter;
  tex.minFilter = THREE.NearestFilter;
  return tex;
}

// 注入 FX CSS animation (一次性)
if (typeof document !== 'undefined' && !document.getElementById('__baigui_fx_css')) {
  const style = document.createElement('style');
  style.id = '__baigui_fx_css';
  style.textContent = `
    @keyframes floatUp {
      0% { transform: translate(-50%, -50%); opacity: 1; }
      100% { transform: translate(-50%, -120%); opacity: 0; }
    }
    @keyframes pulse {
      0% { transform: scale(0.5); opacity: 1; }
      100% { transform: scale(2); opacity: 0; }
    }
  `;
  document.head.appendChild(style);
}
