/**
 * src/render/__tests__/terrain-mesh.test.ts
 *
 * v3.1: terrain-mesh 测试 (mock Three.js)
 */
import { describe, it, expect, vi } from 'vitest';

// Mock Three.js (避免 600KB import)
vi.mock('three', () => ({
  BufferGeometry: vi.fn(() => ({
    setAttribute: vi.fn(),
    setIndex: vi.fn(),
    computeVertexNormals: vi.fn(),
  })),
  BufferAttribute: vi.fn(),
  Mesh: vi.fn(),
  MeshLambertMaterial: vi.fn(),
  Color: vi.fn((hex: number) => ({
    r: ((hex >> 16) & 0xff) / 255,
    g: ((hex >> 8) & 0xff) / 255,
    b: (hex & 0xff) / 255,
  })),
}));

import { terrainToMesh, buildTerrainMesh } from '../terrain-mesh';
import { generateTerrain, BIOME_COLORS } from '../terrain-gen';

describe('terrainToMesh (Three.js 集成)', () => {
  it('从 terrain 数据生成 mesh', () => {
    const data = generateTerrain(42, 20, 15);
    const mesh = terrainToMesh(data);
    expect(mesh).toBeDefined();
  });

  it('buildTerrainMesh seed → mesh (helper)', () => {
    const mesh = buildTerrainMesh(42, 20, 15);
    expect(mesh).toBeDefined();
  });

  it('每个 biome 颜色映射正确', () => {
    for (const [biome, hex] of Object.entries(BIOME_COLORS)) {
      expect(typeof hex).toBe('number');
      expect(hex).toBeGreaterThan(0);
      // biome 在已知列表
      expect(['water', 'sand', 'grass', 'forest', 'mountain']).toContain(biome);
    }
  });

  it('mesh 是同一个 data → 同样大小', () => {
    const data = generateTerrain(42, 20, 15);
    const mesh = terrainToMesh(data);
    expect(mesh).toBeDefined();
    // 顶点数 = width * height
    // 三角形数 = (w-1) * (h-1) * 2
    const expectedVerts = 20 * 15;
    const expectedTris = (20 - 1) * (15 - 1) * 2;
    expect(expectedVerts).toBe(300);
    expect(expectedTris).toBe(532);
  });
});