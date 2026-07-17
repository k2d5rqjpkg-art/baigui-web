/**
 * src/render/model-loader.ts
 *
 * 借鉴 #3: CC0 GLB 模型集成 (KayKit/Quaternius/Kenney)
 *
 * WoC: import CC0 GLB, 服务器端 resolve 路径
 * 我们: 异步 fetch GLB, Three.js GLTFLoader 解析
 *
 * 设计:
 *   - ModelManifest: { id, url, license, attribution }
 *   - loadModel(url): Promise<ModelData>
 *   - ModelData: { vertices, indices, materials } (无 Three.js 依赖, 纯数据)
 *
 * 测试: 不真下载 GLB (网络问题), 用 mock ArrayBuffer
 */
import { log } from '../core/log';

/** 模型 manifest (CC0 标注) */
export interface ModelManifest {
  id: string;
  url: string;
  license: 'CC0' | 'CC-BY' | 'MIT';
  attribution: string;
  /** 角色类型, 用于游戏逻辑 */
  role: 'player' | 'monster' | 'npc' | 'building';
}

/** 加载后的模型数据 (无 Three.js 依赖, 纯几何) */
export interface ModelData {
  manifest: ModelManifest;
  /** 顶点 (X, Y, Z, X, Y, Z, ...) */
  positions: Float32Array;
  /** 法线 */
  normals: Float32Array;
  /** 三角形索引 */
  indices: Uint32Array;
  /** 子 mesh 列表 (每个一个 material color) */
  meshes: Array<{ name: string; color: number; indexOffset: number; indexCount: number }>;
}

/** 内置 manifest 库 (CC0 来源标注) */
export const MODEL_MANIFESTS: ModelManifest[] = [
  {
    id: 'kaykit-adventurer',
    url: 'https://kaylousberg.itch.io/kaykit-adventurers',
    license: 'CC0',
    attribution: 'KayKit Adventurers by Kay Lousberg (CC0 1.0)',
    role: 'player',
  },
  {
    id: 'quaternius-rpg',
    url: 'https://quaternius.com/packs/cardkitfantasy.html',
    license: 'CC0',
    attribution: 'Quaternius Fantasy RPG Characters (CC0 1.0)',
    role: 'monster',
  },
  {
    id: 'kenney-buildings',
    url: 'https://kenney.nl/assets/medieval-town',
    license: 'CC0',
    attribution: 'Kenney Medieval Town (CC0 1.0)',
    role: 'building',
  },
];

/** 根据角色找 manifest */
export function findManifestByRole(role: ModelManifest['role']): ModelManifest | null {
  return MODEL_MANIFESTS.find((m) => m.role === role) ?? null;
}

/** fetch + 简化的 GLB 解析 (bin chunk only, 不依赖 GLTFLoader) */
export async function loadModel(url: string): Promise<ModelData> {
  log.info(`[model-loader] fetch ${url}`);
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Model fetch failed: ${res.status}`);
  const buf = await res.arrayBuffer();
  return parseGLB(buf);
}

/**
 * 极简 GLB 解析 (只读 bin chunk)
 * GLB 格式: 12 字节 header + JSON chunk + BIN chunk
 * 我们不需要完整 GLTF 解析, 只拿 vertices/indices 给 Three.js 用
 *
 * 注: 真实生产环境用 GLTFLoader + three/addons/loaders/GLTFLoader.js
 * 这里只做骨架, 验证加载流程
 */
export function parseGLB(buf: ArrayBuffer): ModelData {
  const dv = new DataView(buf);
  // header: magic(4) + version(4) + length(4) = 12 bytes
  const magic = dv.getUint32(0, true);
  if (magic !== 0x46546c67) { // 'glTF'
    throw new Error('Not a GLB file');
  }
  const version = dv.getUint32(4, true);
  if (version !== 2) {
    throw new Error(`Unsupported GLB version: ${version}`);
  }
  // JSON chunk header: length(4) + type(4) = 8 bytes
  // length 是 padded 长度, 但 JSON 实际只用前 jsonStr.length 字节
  const jsonChunkLen = dv.getUint32(12, true);
  const jsonType = dv.getUint32(16, true);
  if (jsonType !== 0x4e4f534a) { // 'JSON'
    throw new Error('First chunk not JSON');
  }
  const jsonBytes = new Uint8Array(buf, 20, jsonChunkLen);
  // 找 JSON 末尾 (可能有 padding 空格/0)
  let jsonEnd = jsonChunkLen;
  for (let i = jsonChunkLen - 1; i >= 0; i--) {
    if (jsonBytes[i]! > 0x20) { jsonEnd = i + 1; break; }
  }
  const jsonStr = new TextDecoder().decode(jsonBytes.subarray(0, jsonEnd));
  const json = JSON.parse(jsonStr);

  // BIN chunk: 紧跟 JSON (用 padded length 跳过 padding)
  const binOffset = 20 + jsonChunkLen;
  const binLen = dv.getUint32(binOffset, true);
  const binType = dv.getUint32(binOffset + 4, true);
  if (binType !== 0x004e4942) { // 'BIN\0'
    throw new Error('Second chunk not BIN');
  }
  const binData = new Uint8Array(buf, binOffset + 8, binLen);

  // 提取第一个 mesh 的 positions/indices
  // 优先用 meshViews (Fable 5 写代码时的输出结构),
  // fallback: 第一个 VEC3 是 positions, 第一个 SCALAR 是 indices
  const accessors = json.accessors ?? [];
  let accessorPos: any = null;
  let accessorIndices: any = null;
  if (json.meshViews?.[0]?.accessors) {
    const ac = json.meshViews[0].accessors;
    accessorPos = accessors[ac.positions ?? 0];
    accessorIndices = accessors[ac.indices ?? 1];
  } else {
    // fallback: 类型匹配
    accessorPos = accessors.find((a: any) => a.type === 'VEC3');
    accessorIndices = accessors.find((a: any) => a.type === 'SCALAR');
  }

  const positions = accessorPos
    ? readFloat32(binData, accessorPos.byteOffset ?? 0, accessorPos.count * 3)
    : [];
  const indices = accessorIndices
    ? readUint32(binData, accessorIndices.byteOffset ?? 0, accessorIndices.count)
    : [];

  return {
    manifest: { id: 'parsed', url: '', license: 'CC0', attribution: '', role: 'monster' },
    positions: new Float32Array(positions),
    normals: new Float32Array(positions.length),
    indices: new Uint32Array(indices),
    meshes: [
      { name: 'mesh_0', color: 0xd4a017, indexOffset: 0, indexCount: indices.length },
    ],
  };
}

function readFloat32(data: Uint8Array, offset: number, count: number): number[] {
  const out: number[] = [];
  const view = new DataView(data.buffer, data.byteOffset + offset, count * 4);
  for (let i = 0; i < count; i++) {
    out.push(view.getFloat32(i * 4, true));
  }
  return out;
}

function readUint32(data: Uint8Array, offset: number, count: number): number[] {
  const out: number[] = [];
  const view = new DataView(data.buffer, data.byteOffset + offset, count * 4);
  for (let i = 0; i < count; i++) {
    out.push(view.getUint32(i * 4, true));
  }
  return out;
}

/** 缓存已加载模型 */
const cache = new Map<string, ModelData>();

export async function loadModelCached(url: string): Promise<ModelData> {
  if (cache.has(url)) return cache.get(url)!;
  const m = await loadModel(url);
  cache.set(url, m);
  return m;
}

export function clearModelCache(): void {
  cache.clear();
}