/**
 * src/render/terrain-gen.ts
 *
 * 借鉴 #1: 程序化地形生成 (WoC Three.js 程序化几何)
 *
 * 设计:
 *   - 基于 mulberry32 PRNG (与 sim 共用)
 *   - 值噪声 (value noise) + FBM (fractional Brownian motion) 高度场
 *   - biome: water/sand/grass/forest/mountain (基于高度)
 *   - 输出: { heights[y][x], biomes[y][x], mesh? } 给 Three.js 用
 *
 * 借鉴 WoC "procgen 地形" — 但我们的更简化, 用 heightmap 而非真实 3D mesh
 */
import type { EntityId } from '../core/sim';

// 复用 sim 的 mulberry32 PRNG
export function mulberry32(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** 2D value noise (可双线性插值) */
function valueNoise(rng: () => number, gridSize: number, width: number, height: number): number[][] {
  const grid: number[][] = [];
  for (let y = 0; y <= gridSize; y++) {
    const row: number[] = [];
    for (let x = 0; x <= gridSize; x++) {
      row.push(rng());
    }
    grid.push(row);
  }

  const heights: number[][] = [];
  const step = gridSize / Math.max(width, height);
  for (let y = 0; y < height; y++) {
    const row: number[] = [];
    for (let x = 0; x < width; x++) {
      const gx = x * step;
      const gy = y * step;
      const x0 = Math.floor(gx);
      const y0 = Math.floor(gy);
      const fx = gx - x0;
      const fy = gy - y0;
      const x1 = Math.min(x0 + 1, gridSize);
      const y1 = Math.min(y0 + 1, gridSize);
      // 双线性插值
      const v00 = grid[y0]![x0]!;
      const v10 = grid[y0]![x1]!;
      const v01 = grid[y1]![x0]!;
      const v11 = grid[y1]![x1]!;
      const v0 = v00 * (1 - fx) + v10 * fx;
      const v1 = v01 * (1 - fx) + v11 * fx;
      row.push(v0 * (1 - fy) + v1 * fy);
    }
    heights.push(row);
  }
  return heights;
}

/** FBM 多 octave noise */
function fbm(
  rng: () => number,
  width: number,
  height: number,
  octaves: number = 4,
  lacunarity: number = 2.0,
  persistence: number = 0.5,
): number[][] {
  const result: number[][] = [];
  for (let y = 0; y < height; y++) {
    result.push(new Array(width).fill(0));
  }
  let amp = 1.0;
  let freq = 4;
  let maxAmp = 0;
  for (let o = 0; o < octaves; o++) {
    const layer = valueNoise(rng, freq, width, height);
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        result[y]![x]! += layer[y]![x]! * amp;
      }
    }
    maxAmp += amp;
    amp *= persistence;
    freq *= lacunarity;
  }
  // 归一化到 [0, 1]
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      result[y]![x] = result[y]![x]! / maxAmp;
    }
  }
  return result;
}

/** 地形 biome 类型 */
export type Biome = 'water' | 'sand' | 'grass' | 'forest' | 'mountain';

/** biome 颜色 (供 Three.js mesh 用) */
export const BIOME_COLORS: Record<Biome, number> = {
  water: 0x2980b9,
  sand: 0xd4c4a0,
  grass: 0x2d7d3a,
  forest: 0x1a4a20,
  mountain: 0x7f8c8d,
};

/** biome 高度阈值 */
const BIOME_THRESHOLDS: Array<{ min: number; max: number; biome: Biome }> = [
  { min: 0.0, max: 0.3, biome: 'water' },
  { min: 0.3, max: 0.35, biome: 'sand' },
  { min: 0.35, max: 0.65, biome: 'grass' },
  { min: 0.65, max: 0.8, biome: 'forest' },
  { min: 0.8, max: 1.0, biome: 'mountain' },
];

/** 生成完整地形数据 */
export interface TerrainData {
  width: number;
  height: number;
  /** 高度图 (0-1, Y-up) */
  heights: number[][];
  /** 每个 cell 的 biome */
  biomes: Biome[][];
  /** 顶点坐标 (3D, XZ plane) */
  vertices: Float32Array;
  /** 三角形索引 */
  indices: number[];
}

/** 程序化生成地形 */
export function generateTerrain(
  seed: number,
  width: number,
  height: number,
  cellSize: number = 1,
): TerrainData {
  const rng = mulberry32(seed);

  // FBM 高度场
  const heights = fbm(rng, width, height, 4, 2.0, 0.5);

  // biome 分配
  const biomes: Biome[][] = [];
  for (let y = 0; y < height; y++) {
    const row: Biome[] = [];
    for (let x = 0; x < width; x++) {
      const h = heights[y]![x]!;
      const matched = BIOME_THRESHOLDS.find((t) => h >= t.min && h < t.max);
      row.push(matched?.biome ?? 'grass');
    }
    biomes.push(row);
  }

  // 顶点 (XZ 平面, Y=height)
  const vertices: number[] = [];
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      vertices.push(
        x * cellSize,
        heights[y]![x]! * 5, // Y-up, 5x 放大便于观察
        y * cellSize,
      );
    }
  }

  // 三角形索引 (2 triangles per quad)
  const indices: number[] = [];
  for (let y = 0; y < height - 1; y++) {
    for (let x = 0; x < width - 1; x++) {
      const tl = y * width + x;
      const tr = tl + 1;
      const bl = (y + 1) * width + x;
      const br = bl + 1;
      // 两个三角形: (tl, bl, tr) + (tr, bl, br)
      indices.push(tl, bl, tr, tr, bl, br);
    }
  }

  return {
    width,
    height,
    heights,
    biomes,
    vertices: new Float32Array(vertices),
    indices,
  };
}

/** 获取 cell 中心点 (XZ) */
export function getCellCenter(
  data: TerrainData,
  cellX: number,
  cellY: number,
  cellSize: number = 1,
): { x: number; y: number; z: number; biome: Biome; height: number } {
  const biome = data.biomes[cellY]?.[cellX] ?? 'grass';
  const height = data.heights[cellY]?.[cellX] ?? 0;
  return {
    x: cellX * cellSize + cellSize / 2,
    y: height * 5,
    z: cellY * cellSize + cellSize / 2,
    biome,
    height,
  };
}

/** 统计地形 */
export function summarizeTerrain(data: TerrainData): {
  totalCells: number;
  biomeCounts: Record<Biome, number>;
  avgHeight: number;
  maxHeight: number;
  minHeight: number;
} {
  let total = 0;
  let sumH = 0;
  let maxH = 0;
  let minH = 1;
  const counts: Record<Biome, number> = {
    water: 0, sand: 0, grass: 0, forest: 0, mountain: 0,
  };
  for (let y = 0; y < data.height; y++) {
    for (let x = 0; x < data.width; x++) {
      const h = data.heights[y]![x]!;
      total++;
      sumH += h;
      if (h > maxH) maxH = h;
      if (h < minH) minH = h;
      counts[data.biomes[y]![x]!]++;
    }
  }
  return {
    totalCells: total,
    biomeCounts: counts,
    avgHeight: sumH / total,
    maxHeight: maxH,
    minHeight: minH,
  };
}