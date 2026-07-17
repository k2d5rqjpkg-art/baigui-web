/**
 * src/render/__tests__/building-gen.test.ts
 *
 * 借鉴 #2: 建筑程序化测试
 */
import { describe, it, expect } from 'vitest';
import {
  generateBuilding,
  generateSettlement,
  defaultSpec,
  isPointInBuilding,
  BUILDING_PRESETS,
} from '../building-gen';

describe('defaultSpec', () => {
  it('4 种建筑类型', () => {
    expect(Object.keys(BUILDING_PRESETS)).toEqual(
      expect.arrayContaining(['house', 'tower', 'shop', 'shrine']),
    );
  });

  it('每个 type 都有 spec', () => {
    for (const type of ['house', 'tower', 'shop', 'shrine'] as const) {
      const s = defaultSpec(type);
      expect(s.type).toBe(type);
      expect(s.width).toBeGreaterThan(0);
      expect(s.height).toBeGreaterThan(0);
      expect(s.depth).toBeGreaterThan(0);
    }
  });

  it('tower 没窗户 (高塔)', () => {
    const s = defaultSpec('tower');
    expect(s.windows.length).toBe(0);
  });

  it('house 有 2 个窗户', () => {
    const s = defaultSpec('house');
    expect(s.windows.length).toBe(2);
  });
});

describe('generateBuilding', () => {
  it('生成合法 mesh 数据', () => {
    const s = defaultSpec('house');
    const m = generateBuilding(s, 0, 0, 0, 42);
    // 8 顶点的 box: 24 floats
    expect(m.vertices.length).toBeGreaterThanOrEqual(24);
    // 12 triangles × 3 = 36 indices (box)
    expect(m.indices.length).toBeGreaterThanOrEqual(36);
  });

  it('pitch 屋顶增加 5 顶点 + 4 三角形', () => {
    const s = { ...defaultSpec('house'), roof: 'pitched' as const };
    const m = generateBuilding(s, 0, 0, 0, 42);
    // 8 box 顶点 + 5 roof 顶点 = 13 顶点 (39 floats)
    expect(m.vertices.length).toBe(13 * 3);
    // 36 box + 12 roof = 48
    expect(m.indices.length).toBe(48);
  });

  it('flat 屋顶不加额外顶点', () => {
    const s = { ...defaultSpec('shop'), roof: 'flat' as const };
    const m = generateBuilding(s, 0, 0, 0, 42);
    expect(m.vertices.length).toBe(8 * 3); // 仅 box
    expect(m.indices.length).toBe(36);
  });

  it('pyramid 屋顶比 pitched 高', () => {
    const s1 = defaultSpec('house'); // pitched
    const m1 = generateBuilding({ ...s1, roof: 'pitched' }, 0, 0, 0, 42);
    const s2 = { ...defaultSpec('house'), roof: 'pyramid' as const };
    const m2 = generateBuilding(s2, 0, 0, 0, 42);
    // pyramid peakY = height * 0.7, pitched = height * 0.5
    expect(m2.bounds.maxY).toBeGreaterThan(m1.bounds.maxY);
  });

  it('同 seed 同结果 (deterministic)', () => {
    const s = defaultSpec('tower');
    const a = generateBuilding(s, 5, 0, 5, 42);
    const b = generateBuilding(s, 5, 0, 5, 42);
    expect(Array.from(a.vertices)).toEqual(Array.from(b.vertices));
  });

  it('bounds 反映实际尺寸', () => {
    const s = defaultSpec('shop'); // 5x3x3
    const m = generateBuilding(s, 10, 0, 10, 42);
    expect(m.bounds.minX).toBe(10 - 2.5);
    expect(m.bounds.maxX).toBe(10 + 2.5);
    expect(m.bounds.minZ).toBe(10 - 1.5);
    expect(m.bounds.maxZ).toBe(10 + 1.5);
  });

  it('materialColor 用 wallColor', () => {
    const s = defaultSpec('house');
    const m = generateBuilding(s, 0, 0, 0, 42);
    expect(m.materialColor).toBe(s.wallColor);
  });
});

describe('generateSettlement', () => {
  it('生成指定数量的建筑', () => {
    const buildings = generateSettlement(0, 0, 5, 42);
    expect(buildings.length).toBe(5);
  });

  it('同 seed 同分布', () => {
    const a = generateSettlement(0, 0, 8, 42);
    const b = generateSettlement(0, 0, 8, 42);
    expect(a.length).toBe(b.length);
    for (let i = 0; i < a.length; i++) {
      expect(a[i]!.bounds.minX).toBeCloseTo(b[i]!.bounds.minX);
    }
  });

  it('不同 seed 不同分布', () => {
    const a = generateSettlement(0, 0, 5, 1);
    const b = generateSettlement(0, 0, 5, 2);
    // 至少一个建筑位置不同
    let diff = false;
    for (let i = 0; i < a.length; i++) {
      if (a[i]!.bounds.minX !== b[i]!.bounds.minX) {
        diff = true;
        break;
      }
    }
    expect(diff).toBe(true);
  });

  it('建筑都在 radius 范围内', () => {
    const buildings = generateSettlement(0, 0, 10, 42, 15);
    for (const b of buildings) {
      const cx = (b.bounds.minX + b.bounds.maxX) / 2;
      const cz = (b.bounds.minZ + b.bounds.maxZ) / 2;
      const d = Math.sqrt(cx * cx + cz * cz);
      expect(d).toBeLessThanOrEqual(15 + 3); // 留 3 单位误差
    }
  });
});

describe('isPointInBuilding', () => {
  it('中心点碰撞', () => {
    const s = defaultSpec('house');
    const m = generateBuilding(s, 0, 0, 0, 42);
    expect(isPointInBuilding(m, 0, 1, 0)).toBe(true);
  });

  it('边界外不碰撞', () => {
    const s = defaultSpec('house');
    const m = generateBuilding(s, 0, 0, 0, 42);
    expect(isPointInBuilding(m, 100, 1, 100)).toBe(false);
  });

  it('上下方向边界检测', () => {
    const s = defaultSpec('house');
    const m = generateBuilding(s, 0, 0, 0, 42);
    expect(isPointInBuilding(m, 0, -1, 0)).toBe(false); // 地下
    expect(isPointInBuilding(m, 0, m.bounds.maxY + 1, 0)).toBe(false); // 屋顶上
  });
});
