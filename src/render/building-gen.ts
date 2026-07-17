/**
 * src/render/building-gen.ts
 *
 * 借鉴 #2: 房屋/建筑程序化 (简化版 WoC Three.js 组合几何)
 *
 * WoC 做法: Fable 5 写代码生成 box + pyramid roof + door + window
 * 我们做法: 用纯函数生成建筑描述 (3D vertices), 浏览器端组装 Three.js mesh
 *
 * 设计:
 *   - BuildingSpec: { width, depth, height, roof, doorPos, windows[] }
 *   - generateBuilding(spec, seed) → { vertices, indices, materials }
 *   - 4 种建筑: house / tower / shop / shrine (基于 seed 选)
 */
import { mulberry32 } from './terrain-gen';

export type BuildingType = 'house' | 'tower' | 'shop' | 'shrine';

export interface BuildingSpec {
  type: BuildingType;
  /** 底面宽 (X) */
  width: number;
  /** 底面深 (Z) */
  depth: number;
  /** 墙高 (Y) */
  height: number;
  /** 屋顶类型 */
  roof: 'flat' | 'pitched' | 'pyramid';
  /** 颜色 (墙) */
  wallColor: number;
  /** 颜色 (屋顶) */
  roofColor: number;
  /** 门位置 (相对底面, 0-1) */
  doorPos: { u: number; v: number };
  /** 窗户位置列表 */
  windows: Array<{ u: number; y: number; size: number }>;
}

export interface BuildingMesh {
  vertices: Float32Array;
  indices: number[];
  /** 简化: 整建筑用 1 个 material (避免子 mesh 复杂度) */
  materialColor: number;
  /** 边界框 (用于碰撞) */
  bounds: { minX: number; minY: number; minZ: number; maxX: number; maxY: number; maxZ: number };
}

/** 标准建筑尺寸 */
export const BUILDING_PRESETS: Record<BuildingType, Partial<BuildingSpec>> = {
  house: {
    width: 4, depth: 4, height: 3,
    roof: 'pitched',
    wallColor: 0xd4a017,
    roofColor: 0x8b4513,
  },
  tower: {
    width: 3, depth: 3, height: 8,
    roof: 'pyramid',
    wallColor: 0x7f8c8d,
    roofColor: 0x2c3e50,
  },
  shop: {
    width: 5, depth: 3, height: 3,
    roof: 'flat',
    wallColor: 0xc0392b,
    roofColor: 0x34495e,
  },
  shrine: {
    width: 3, depth: 3, height: 4,
    roof: 'pitched',
    wallColor: 0x8e44ad,
    roofColor: 0x2c3e50,
  },
};

/** 根据类型生成默认 spec */
export function defaultSpec(type: BuildingType): BuildingSpec {
  const preset = BUILDING_PRESETS[type]!;
  return {
    type,
    width: preset.width ?? 4,
    depth: preset.depth ?? 4,
    height: preset.height ?? 3,
    roof: preset.roof ?? 'flat',
    wallColor: preset.wallColor ?? 0xd4a017,
    roofColor: preset.roofColor ?? 0x8b4513,
    doorPos: { u: 0.5, v: 0.05 }, // 默认前方居中
    windows: type === 'tower' ? [] : [{ u: 0.25, y: 0.5, size: 0.4 }, { u: 0.75, y: 0.5, size: 0.4 }],
  };
}

/** 生成 1 个 box 的 8 顶点 + 12 三角形 */
function boxMesh(
  cx: number, cy: number, cz: number,
  w: number, h: number, d: number,
): { vertices: number[]; indices: number[] } {
  const x0 = cx - w / 2, x1 = cx + w / 2;
  const y0 = cy, y1 = cy + h;
  const z0 = cz - d / 2, z1 = cz + d / 2;

  const vertices: number[] = [
    // 4 底面顶点 (y=y0)
    x0, y0, z0,
    x1, y0, z0,
    x1, y0, z1,
    x0, y0, z1,
    // 4 顶面顶点 (y=y1)
    x0, y1, z0,
    x1, y1, z0,
    x1, y1, z1,
    x0, y1, z1,
  ];

  const indices = [
    // 底面 (反时针)
    0, 2, 1, 0, 3, 2,
    // 顶面
    4, 5, 6, 4, 6, 7,
    // 前 (z=z0)
    0, 1, 5, 0, 5, 4,
    // 后 (z=z1)
    2, 3, 7, 2, 7, 6,
    // 左 (x=x0)
    3, 0, 4, 3, 4, 7,
    // 右 (x=x1)
    1, 2, 6, 1, 6, 5,
  ];

  return { vertices, indices };
}

/** 生成建筑 (中心点在 (cx, cy, cz), 底部着地) */
export function generateBuilding(
  spec: BuildingSpec,
  cx: number = 0,
  cy: number = 0,
  cz: number = 0,
  seed: number = 1,
): BuildingMesh {
  const rng = mulberry32(seed);

  // 1. 主体 (墙)
  const body = boxMesh(cx, cy, cz, spec.width, spec.height, spec.depth);

  // 2. 屋顶
  const roofY = cy + spec.height;
  let roofVertices: number[] = [];
  let roofIndices: number[] = [];
  let roofVertOffset = 0;

  if (spec.roof === 'pitched') {
    // 三角顶: 5 顶点 (4 顶角 + 1 中央)
    const x0 = cx - spec.width / 2, x1 = cx + spec.width / 2;
    const z0 = cz - spec.depth / 2, z1 = cz + spec.depth / 2;
    const peakY = roofY + spec.height * 0.5;
    roofVertices = [
      x0, roofY, z0,
      x1, roofY, z0,
      x1, roofY, z1,
      x0, roofY, z1,
      cx, peakY, cz, // 顶点
    ];
    // 4 三角形 (4 面)
    roofIndices = [
      0, 4, 1, // front
      1, 4, 2, // right
      2, 4, 3, // back
      3, 4, 0, // left
    ];
    roofVertOffset = body.vertices.length / 3;
  } else if (spec.roof === 'pyramid') {
    // 金字塔顶: 同上 5 顶点
    const x0 = cx - spec.width / 2, x1 = cx + spec.width / 2;
    const z0 = cz - spec.depth / 2, z1 = cz + spec.depth / 2;
    const peakY = roofY + spec.height * 0.7;
    roofVertices = [
      x0, roofY, z0,
      x1, roofY, z0,
      x1, roofY, z1,
      x0, roofY, z1,
      cx, peakY, cz,
    ];
    roofIndices = [
      0, 4, 1,
      1, 4, 2,
      2, 4, 3,
      3, 4, 0,
    ];
    roofVertOffset = body.vertices.length / 3;
  }
  // 'flat' 屋顶不增加额外顶点

  // 3. 合并
  const allVertices = [...body.vertices, ...roofVertices];
  const allIndices = [
    ...body.indices,
    ...roofIndices.map((i) => i + roofVertOffset),
  ];

  // 4. 边界框
  let roofExtra = 0;
  if (spec.roof === 'pitched') roofExtra = spec.height * 0.5;
  else if (spec.roof === 'pyramid') roofExtra = spec.height * 0.7;
  const bounds = {
    minX: cx - spec.width / 2,
    maxX: cx + spec.width / 2,
    minY: cy,
    maxY: cy + spec.height + roofExtra,
    minZ: cz - spec.depth / 2,
    maxZ: cz + spec.depth / 2,
  };

  return {
    vertices: new Float32Array(allVertices),
    indices: allIndices,
    materialColor: spec.wallColor, // 简化: 整建筑单色
    bounds,
  };
}

/** 生成建筑群 (村庄 / 城镇) */
export function generateSettlement(
  centerX: number,
  centerZ: number,
  count: number,
  seed: number,
  radius: number = 20,
): BuildingMesh[] {
  const rng = mulberry32(seed);
  const buildings: BuildingMesh[] = [];
  const types: BuildingType[] = ['house', 'shop', 'tower', 'shrine'];

  for (let i = 0; i < count; i++) {
    // 随机位置 (圆内均匀分布)
    const angle = rng() * Math.PI * 2;
    const r = Math.sqrt(rng()) * radius;
    const x = centerX + Math.cos(angle) * r;
    const z = centerZ + Math.sin(angle) * r;

    // 随机类型
    const type = types[Math.floor(rng() * types.length)]!;
    const spec = defaultSpec(type);

    buildings.push(generateBuilding(spec, x, 0, z, seed + i));
  }
  return buildings;
}

/** 检测 AABB 碰撞 (点 vs building bounds) */
export function isPointInBuilding(
  building: BuildingMesh,
  px: number, py: number, pz: number,
): boolean {
  return (
    px >= building.bounds.minX && px <= building.bounds.maxX &&
    py >= building.bounds.minY && py <= building.bounds.maxY &&
    pz >= building.bounds.minZ && pz <= building.bounds.maxZ
  );
}