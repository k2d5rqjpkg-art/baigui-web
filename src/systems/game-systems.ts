import * as THREE from 'three';
import { ecs } from '../core/ecs';

/**
 * 移动系统：每帧根据 Velocity 更新 Position
 */
export class MovementSystem {
  update(delta: number) {
    const ids = ecs.query('position', 'velocity');
    for (const id of ids) {
      const pos = ecs.getComponent<{ x: number; y: number }>(id, 'position')!;
      const vel = ecs.getComponent<{ x: number; y: number }>(id, 'velocity')!;
      pos.x += vel.x * delta;
      pos.y += vel.y * delta;
    }
  }
}

/**
 * 精灵渲染系统：同步位置到 Sprite mesh 位置
 * 坐标映射：游戏坐标 (x,y) → Three.js 3D 坐标 (x, -y, 0)
 * 160x160 像素 = 1 个网格单位
 */
export class SpriteRenderSystem {
  update(_delta: number) {
    ecs.forEach('sprite', (id, spriteData) => {
      const pos = ecs.getComponent<{ x: number; y: number }>(id, 'position');
      if (!pos) return;
      const sprite = spriteData as { mesh: THREE.Sprite; scale: number };
      // 直接使用世界坐标（Y轴翻转，因为浏览器坐标 Y 向下）
      sprite.mesh.position.set(
        pos.x,
        -pos.y,
        0
      );
    });
  }
}

/**
 * 碰撞检测系统：检测 Position 之间的接近程度
 */
export class CollisionSystem {
  private readonly COLLIDE_DIST = 1.0; // 世界单位

  checkCollision(a: number, b: number): boolean {
    const posA = ecs.getComponent<{ x: number; y: number }>(a, 'position');
    const posB = ecs.getComponent<{ x: number; y: number }>(b, 'position');
    if (!posA || !posB) return false;
    const dx = posA.x - posB.x;
    const dy = posA.y - posB.y;
    return Math.sqrt(dx * dx + dy * dy) < this.COLLIDE_DIST;
  }

  /** 查找目标 type 组件中，距离 source 最近的实体 */
  findNearest(source: number, targetType: string): number | null {
    const pos = ecs.getComponent<{ x: number; y: number }>(source, 'position');
    if (!pos) return null;
    let nearest: number | null = null;
    let minDist = Infinity;
    ecs.forEach(targetType, (id) => {
      if (id === source) return;
      const tPos = ecs.getComponent<{ x: number; y: number }>(id, 'position');
      if (!tPos) return;
      const dx = pos.x - tPos.x;
      const dy = pos.y - tPos.y;
      const d = Math.sqrt(dx * dx + dy * dy);
      if (d < minDist) {
        minDist = d;
        nearest = id;
      }
    });
    return nearest;
  }
}
