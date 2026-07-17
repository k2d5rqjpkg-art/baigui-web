/**
 * vitest: world (BSP 房间)
 *  - same seed → same layout
 *  - 至少 4 个房间
 *  - spawnPoints 数量 >= 房间数
 *  - 房间不重叠 (粗糙检查)
 */

import { describe, it, expect } from 'vitest';
import { worldGen } from '../world';
import { seedFromString } from '../rng';

describe('worldGen (BSP)', () => {
  it('same seed produces identical layout', () => {
    const seed = seedFromString('baigui-level1');
    const a = worldGen(seed, 1);
    const b = worldGen(seed, 1);
    expect(a.rooms.length).toBe(b.rooms.length);
    expect(a.walls.length).toBe(b.walls.length);
    expect(a.spawnPoints).toEqual(b.spawnPoints);
    expect(a.rooms).toEqual(b.rooms);
  });

  it('different seeds produce different layouts', () => {
    const a = worldGen(seedFromString('seed-a'), 1);
    const b = worldGen(seedFromString('seed-b'), 1);
    // 至少 spawnPoints 序列不同 (或房间数不同)
    const sameSpawns = JSON.stringify(a.spawnPoints) === JSON.stringify(b.spawnPoints);
    const sameRoomCount = a.rooms.length === b.rooms.length;
    expect(sameSpawns && sameRoomCount).toBe(false);
  });

  it('produces at least 4 rooms', () => {
    const layout = worldGen(seedFromString('baigui'), 1);
    expect(layout.rooms.length).toBeGreaterThanOrEqual(4);
  });

  it('has spawnPoints matching rooms', () => {
    const layout = worldGen(seedFromString('baigui'), 2);
    expect(layout.spawnPoints.length).toBeGreaterThanOrEqual(layout.rooms.length);
  });

  it('walls and rooms do not overlap (room cells are not in walls)', () => {
    const layout = worldGen(seedFromString('baigui'), 1);
    const wallSet = new Set(layout.walls.map((w) => `${w.x},${w.y}`));
    for (const r of layout.rooms) {
      for (let x = r.x; x < r.x + r.w; x++) {
        for (let y = r.y; y < r.y + r.h; y++) {
          expect(wallSet.has(`${x},${y}`)).toBe(false);
        }
      }
    }
  });

  it('layout respects bounds', () => {
    const layout = worldGen(seedFromString('baigui'), 1);
    for (const r of layout.rooms) {
      expect(r.x).toBeGreaterThanOrEqual(0);
      expect(r.y).toBeGreaterThanOrEqual(0);
      expect(r.x + r.w).toBeLessThanOrEqual(layout.width);
      expect(r.y + r.h).toBeLessThanOrEqual(layout.height);
    }
    for (const w of layout.walls) {
      expect(w.x).toBeGreaterThanOrEqual(0);
      expect(w.y).toBeGreaterThanOrEqual(0);
      expect(w.x).toBeLessThan(layout.width);
      expect(w.y).toBeLessThan(layout.height);
    }
  });

  it('higher level yields larger map (or equal)', () => {
    const a = worldGen(seedFromString('baigui'), 1);
    const b = worldGen(seedFromString('baigui'), 5);
    expect(b.width).toBeGreaterThanOrEqual(a.width);
    expect(b.height).toBeGreaterThanOrEqual(a.height);
  });
});
