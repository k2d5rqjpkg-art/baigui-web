/**
 * src/render/terrain-mesh.ts
 *
 * v3.1: 把 terrain-gen 输出转成 Three.js Mesh
 *
 * 设计:
 *   - terrainGenToBufferGeometry(data) → BufferGeometry
 *   - 给每个 cell 着色 (biome → color)
 *   - 浏览器端 Three.js 直接用
 */
import * as THREE from 'three';
import { generateTerrain, BIOME_COLORS, type TerrainData, type Biome } from './terrain-gen';

/** 生成 Three.js BufferGeometry (有颜色) */
export function terrainToMesh(data: TerrainData): THREE.Mesh {
  const geometry = new THREE.BufferGeometry();

  // 顶点
  geometry.setAttribute('position', new THREE.BufferAttribute(data.vertices, 3));

  // 索引
  geometry.setIndex(data.indices);

  // 顶点颜色 (每个顶点对应一个 biome color)
  const colors = new Float32Array((data.vertices.length / 3) * 3);
  const triCount = data.indices.length / 3;
  for (let t = 0; t < triCount; t++) {
    const i0 = data.indices[t * 3]!;
    const i1 = data.indices[t * 3 + 1]!;
    const i2 = data.indices[t * 3 + 2]!;

    // 三角形重心对应的 cell (用第 1 个顶点近似)
    const cx = Math.floor(i0 % data.width);
    const cy = Math.floor(i0 / data.width);
    const biome: Biome = data.biomes[cy]?.[cx] ?? 'grass';
    const color = new THREE.Color(BIOME_COLORS[biome]);

    for (const idx of [i0, i1, i2]) {
      colors[idx * 3] = color.r;
      colors[idx * 3 + 1] = color.g;
      colors[idx * 3 + 2] = color.b;
    }
  }
  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));

  // 法线 (用于光照)
  geometry.computeVertexNormals();

  // 材质 (vertexColors)
  const material = new THREE.MeshLambertMaterial({
    vertexColors: true,
    flatShading: false,
  });

  const mesh = new THREE.Mesh(geometry, material);
  mesh.receiveShadow = true;
  return mesh;
}

/** 快速 helper: seed → mesh */
export function buildTerrainMesh(seed: number, width: number, height: number): THREE.Mesh {
  const data = generateTerrain(seed, width, height);
  return terrainToMesh(data);
}
