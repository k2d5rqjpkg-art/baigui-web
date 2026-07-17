/**
 * src/render/__tests__/model-loader.test.ts
 *
 * 借鉴 #3: GLB 模型加载测试 (mock fetch + 假 GLB 数据)
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  MODEL_MANIFESTS,
  findManifestByRole,
  parseGLB,
  loadModelCached,
  clearModelCache,
} from '../model-loader';

describe('MODEL_MANIFESTS', () => {
  it('包含 CC0 来源 (KayKit/Quaternius/Kenney)', () => {
    expect(MODEL_MANIFESTS.length).toBeGreaterThanOrEqual(3);
    for (const m of MODEL_MANIFESTS) {
      expect(m.license).toBe('CC0');
      expect(m.attribution).toContain('CC0');
    }
  });

  it('覆盖 player/monster/building 角色', () => {
    expect(findManifestByRole('player')).not.toBeNull();
    expect(findManifestByRole('monster')).not.toBeNull();
    expect(findManifestByRole('building')).not.toBeNull();
  });

  it('所有 manifest 都有 url', () => {
    for (const m of MODEL_MANIFESTS) {
      expect(m.url).toMatch(/^https?:\/\//);
    }
  });
});

describe('findManifestByRole', () => {
  it('返回第一个匹配 role 的 manifest', () => {
    const m = findManifestByRole('player');
    expect(m?.role).toBe('player');
  });

  it('不存在的 role → null', () => {
    const m = findManifestByRole('unknown' as any);
    expect(m).toBeNull();
  });
});

describe('parseGLB', () => {
  /**
   * 构造最小合法 GLB
   * Header(12) + JSON chunk(8 + N) + BIN chunk(8 + M)
   */
  function makeGLB(jsonObj: object, bin: Uint8Array): ArrayBuffer {
    const jsonStr = JSON.stringify(jsonObj);
    const jsonBytes = new TextEncoder().encode(jsonStr);
    // pad to 4
    const jsonPadLen = (4 - (jsonBytes.length % 4)) % 4;
    const jsonPadded = new Uint8Array(jsonBytes.length + jsonPadLen);
    jsonPadded.set(jsonBytes);

    const binPadLen = (4 - (bin.length % 4)) % 4;
    const binPadded = new Uint8Array(bin.length + binPadLen);
    binPadded.set(bin);

    const total = 12 + 8 + jsonPadded.length + 8 + binPadded.length;
    const buf = new ArrayBuffer(total);
    const dv = new DataView(buf);
    const u8 = new Uint8Array(buf);

    // Header
    dv.setUint32(0, 0x46546c67, true); // 'glTF'
    dv.setUint32(4, 2, true); // version
    dv.setUint32(8, total, true); // total length

    // JSON chunk
    let off = 12;
    dv.setUint32(off, jsonPadded.length, true);
    dv.setUint32(off + 4, 0x4e4f534a, true); // 'JSON'
    u8.set(jsonPadded, off + 8);
    off += 8 + jsonPadded.length;

    // BIN chunk
    dv.setUint32(off, binPadded.length, true);
    dv.setUint32(off + 4, 0x004e4942, true); // 'BIN\0'
    u8.set(binPadded, off + 8);

    return buf;
  }

  it('拒绝非 GLB 文件', () => {
    const buf = new ArrayBuffer(100);
    expect(() => parseGLB(buf)).toThrow();
  });

  it('解析最小合法 GLB (header + JSON + BIN)', () => {
    // 简单: 3 顶点 (0,0,0) (1,0,0) (0,1,0), 1 三角形 0,1,2
    const positions = new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0]);
    const positionsBuf = new Uint8Array(positions.buffer);
    const indices = new Uint32Array([0, 1, 2]);
    const indicesBuf = new Uint8Array(indices.buffer);

    // 合并 BIN 数据 (positions + indices)
    const bin = new Uint8Array(positionsBuf.length + indicesBuf.length);
    bin.set(positionsBuf, 0);
    bin.set(indicesBuf, positionsBuf.length);

    const json = {
      asset: { version: '2.0' },
      accessors: [
        { count: 3, componentType: 5126, type: 'VEC3', byteOffset: 0 },
        { count: 3, componentType: 5125, type: 'SCALAR', byteOffset: positionsBuf.length },
      ],
      bufferViews: [
        { buffer: 0, byteOffset: 0, byteLength: positionsBuf.length },
        { buffer: 0, byteOffset: positionsBuf.length, byteLength: indicesBuf.length },
      ],
    };

    const buf = makeGLB(json, bin);
    const m = parseGLB(buf);
    expect(m.positions.length).toBe(9); // 3 顶点 × 3
    expect(m.indices.length).toBe(3);
    expect(m.positions[0]).toBe(0);
    expect(m.positions[3]).toBe(1);
  });

  it('解析失败抛错', () => {
    expect(() => parseGLB(new ArrayBuffer(0))).toThrow();
  });
});

describe('loadModelCached', () => {
  beforeEach(() => {
    clearModelCache();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('缓存命中: 第二次 fetch 不发请求', async () => {
    let fetchCount = 0;
    const mockFetch = vi.fn(async () => {
      fetchCount++;
      return {
        ok: true,
        status: 200,
        arrayBuffer: async () => {
          // 最小 GLB
          const json = JSON.stringify({
            asset: { version: '2.0' },
            accessors: [],
            bufferViews: [],
          });
          const jsonBytes = new TextEncoder().encode(json);
          const bin = new Uint8Array(0);
          const total = 12 + 8 + jsonBytes.length + 8 + bin.length;
          const buf = new ArrayBuffer(total);
          const dv = new DataView(buf);
          const u8 = new Uint8Array(buf);
          dv.setUint32(0, 0x46546c67, true);
          dv.setUint32(4, 2, true);
          dv.setUint32(8, total, true);
          dv.setUint32(12, jsonBytes.length, true);
          dv.setUint32(16, 0x4e4f534a, true);
          u8.set(jsonBytes, 20);
          dv.setUint32(20 + jsonBytes.length, 0, true);
          dv.setUint32(20 + jsonBytes.length + 4, 0x004e4942, true);
          return buf;
        },
      } as any;
    });
    vi.stubGlobal('fetch', mockFetch);

    const m1 = await loadModelCached('https://test/model.glb');
    const m2 = await loadModelCached('https://test/model.glb');
    expect(m1).toBe(m2); // 同一引用
    expect(fetchCount).toBe(1); // 只 fetch 1 次
  });

  it('不同 URL → 不同缓存', async () => {
    clearModelCache();
    const mockFetch = vi.fn(
      async (url: string) =>
        ({
          ok: true,
          status: 200,
          arrayBuffer: async () => {
            const json = JSON.stringify({
              asset: { version: '2.0' },
              accessors: [],
              bufferViews: [],
            });
            const jsonBytes = new TextEncoder().encode(json);
            const bin = new Uint8Array(0);
            const total = 12 + 8 + jsonBytes.length + 8 + bin.length;
            const buf = new ArrayBuffer(total);
            const dv = new DataView(buf);
            const u8 = new Uint8Array(buf);
            dv.setUint32(0, 0x46546c67, true);
            dv.setUint32(4, 2, true);
            dv.setUint32(8, total, true);
            dv.setUint32(12, jsonBytes.length, true);
            dv.setUint32(16, 0x4e4f534a, true);
            u8.set(jsonBytes, 20);
            dv.setUint32(20 + jsonBytes.length, 0, true);
            dv.setUint32(20 + jsonBytes.length + 4, 0x004e4942, true);
            return buf;
          },
        }) as any,
    );
    vi.stubGlobal('fetch', mockFetch);

    await loadModelCached('https://test/a.glb');
    await loadModelCached('https://test/b.glb');
    expect(mockFetch).toHaveBeenCalledTimes(2);
  });

  it('fetch 失败抛错', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(
        async () =>
          ({
            ok: false,
            status: 404,
          }) as any,
      ),
    );
    await expect(loadModelCached('https://test/missing.glb')).rejects.toThrow();
  });
});
