/**
 * src/render/__tests__/building-mesh.test.ts
 */
import { describe, it, expect, vi } from 'vitest';

vi.mock('three', () => ({
  BufferGeometry: vi.fn(() => ({
    setAttribute: vi.fn(),
    setIndex: vi.fn(),
    computeVertexNormals: vi.fn(),
  })),
  BufferAttribute: vi.fn(),
  Mesh: vi.fn(),
  MeshLambertMaterial: vi.fn(),
}));

import { buildingToMesh, settlementToMeshes } from '../building-mesh';
import { generateBuilding, generateSettlement, defaultSpec } from '../building-gen';

describe('buildingToMesh', () => {
  it('从 BuildingData 生成 mesh', () => {
    const b = generateBuilding(defaultSpec('house'), 0, 0, 0, 42);
    const m = buildingToMesh(b);
    expect(m).toBeDefined();
  });

  it('settlementToMeshes 生成指定数量的 mesh', () => {
    const meshes = settlementToMeshes(0, 0, 5, 42);
    expect(meshes.length).toBe(5);
  });

  it('settlement 同 seed 同数量', () => {
    const a = settlementToMeshes(0, 0, 3, 42);
    const b = settlementToMeshes(0, 0, 3, 42);
    expect(a.length).toBe(b.length);
  });
});