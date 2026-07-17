/**
 * src/render/__tests__/terrain-gen.test.ts
 *
 * 借鉴 #1: 程序化地形测试
 */
import { describe, it, expect } from 'vitest';
import { generateTerrain, summarizeTerrain, mulberry32, BIOME_COLORS } from '../terrain-gen';

describe('mulberry32 PRNG', () => {
  it('同 seed 同序列 (确定性)', () => {
    const rng1 = mulberry32(42);
    const rng2 = mulberry32(42);
    for (let i = 0; i < 100; i++) {
      expect(rng1()).toBe(rng2());
    }
  });

  it('输出 [0, 1] 范围', () => {
    const rng = mulberry32(1);
    for (let i = 0; i < 1000; i++) {
      const v = rng();
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThanOrEqual(1);
    }
  });

  it('不同 seed → 不同序列', () => {
    const rng1 = mulberry32(1);
    const rng2 = mulberry32(2);
    let diff = 0;
    for (let i = 0; i < 50; i++) {
      if (rng1() !== rng2()) diff++;
    }
    expect(diff).toBeGreaterThan(40); // 几乎全不同
  });
});

describe('generateTerrain', () => {
  it('生成指定尺寸的地形', () => {
    const t = generateTerrain(42, 20, 15);
    expect(t.width).toBe(20);
    expect(t.height).toBe(15);
    expect(t.heights.length).toBe(15);
    expect(t.heights[0]!.length).toBe(20);
    expect(t.biomes.length).toBe(15);
    expect(t.biomes[0]!.length).toBe(20);
  });

  it('同 seed 同结果 (deterministic)', () => {
    const a = generateTerrain(42, 20, 15);
    const b = generateTerrain(42, 20, 15);
    expect(a.heights[0]![0]).toBe(b.heights[0]![0]);
    expect(a.biomes[5]![10]).toBe(b.biomes[5]![10]);
  });

  it('不同 seed → 不同结果', () => {
    const a = generateTerrain(1, 20, 15);
    const b = generateTerrain(2, 20, 15);
    // biome 分布应该不同
    const sum = (t: any) => Object.values(t).reduce((s: any, v: any) => s + v, 0);
    let diff = 0;
    for (let y = 0; y < 15; y++) {
      for (let x = 0; x < 20; x++) {
        if (a.biomes[y]![x] !== b.biomes[y]![x]) diff++;
      }
    }
    expect(diff).toBeGreaterThan(50); // 至少 1/6 cells 不同
  });

  it('biome 分布合理 (不是全 water 也不是全 mountain)', () => {
    const t = generateTerrain(42, 30, 30);
    const s = summarizeTerrain(t);
    // 至少 2 种 biome
    const usedBiomes = Object.values(s.biomeCounts).filter((c) => c > 0);
    expect(usedBiomes.length).toBeGreaterThanOrEqual(2);
  });

  it('vertices 数量正确 (width * height * 3)', () => {
    const t = generateTerrain(42, 10, 8);
    expect(t.vertices.length).toBe(10 * 8 * 3);
  });

  it('indices 数量正确 ((w-1)*(h-1)*6)', () => {
    const t = generateTerrain(42, 10, 8);
    expect(t.indices.length).toBe((10 - 1) * (8 - 1) * 6);
  });

  it('每个 cell 有有效 biome', () => {
    const t = generateTerrain(42, 20, 15);
    const validBiomes = Object.keys(BIOME_COLORS);
    for (let y = 0; y < t.height; y++) {
      for (let x = 0; x < t.width; x++) {
        expect(validBiomes).toContain(t.biomes[y]![x]);
      }
    }
  });
});

describe('summarizeTerrain', () => {
  it('统计 biome 分布', () => {
    const t = generateTerrain(42, 20, 20);
    const s = summarizeTerrain(t);
    expect(s.totalCells).toBe(400);
    const sum = Object.values(s.biomeCounts).reduce((a, b) => a + b, 0);
    expect(sum).toBe(400); // 所有 cell 都被分类
  });

  it('height 范围 [0, 1]', () => {
    const t = generateTerrain(42, 20, 20);
    const s = summarizeTerrain(t);
    expect(s.minHeight).toBeGreaterThanOrEqual(0);
    expect(s.maxHeight).toBeLessThanOrEqual(1);
    expect(s.avgHeight).toBeGreaterThan(s.minHeight);
    expect(s.avgHeight).toBeLessThan(s.maxHeight);
  });
});
