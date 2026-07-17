/**
 * src/hosts/browser/__tests__/renderer-terrain.test.ts
 *
 * Day11: renderer.ts 接 terrain/building mesh 验证
 * (源码静态分析, 避免构造 GameRenderer 的 Three.js mock)
 */
// @vitest-environment jsdom
import { describe, it, expect, beforeAll } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';

describe('Day11: renderer.ts 静态集成验证 (terrain/building)', () => {
  let src = '';
  beforeAll(() => {
    src = fs.readFileSync(path.resolve(__dirname, '../renderer.ts'), 'utf-8');
  });

  it('renderer.ts 导入了 terrain-mesh', () => {
    expect(src).toMatch(/from ['"].*terrain-mesh['"]/);
  });

  it('renderer.ts 导入了 building-mesh', () => {
    expect(src).toMatch(/from ['"].*building-mesh['"]/);
  });

  it('renderer.ts 包含 buildTerrainMesh 调用', () => {
    expect(src).toMatch(/buildTerrainMesh\(/);
  });

  it('renderer.ts 包含 settlementToMeshes 调用 (村庄)', () => {
    expect(src).toMatch(/settlementToMeshes\(/);
  });

  it('renderer.ts 有 terrainMesh 字段', () => {
    expect(src).toMatch(/private terrainMesh: THREE\.Mesh \| null/);
  });

  it('renderer.ts 有 buildingMeshes 字段', () => {
    expect(src).toMatch(/private buildingMeshes: THREE\.Mesh\[\]/);
  });

  it('renderer.ts buildWorld 添加 terrainMesh 到 scene', () => {
    expect(src).toMatch(/this\.terrainMesh = buildTerrainMesh/);
    expect(src).toMatch(/this\.scene\.add\(this\.terrainMesh\)/);
  });

  it('renderer.ts buildWorld 添加村庄到 scene', () => {
    expect(src).toMatch(/this\.buildingMeshes = settlementToMeshes/);
    // 循环里 add
    expect(src).toMatch(/this\.scene\.add\(b\)/);
  });

  it('terrain 缩放用 CELL_SIZE', () => {
    // scale.set(CELL_SIZE, CELL_SIZE, 1) 或类似
    expect(src).toMatch(/CELL_SIZE/);
  });
});
