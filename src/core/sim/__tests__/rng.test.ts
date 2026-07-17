/**
 * vitest: Mulberry32 确定性
 *  - same seed → same sequence (10 values)
 *  - 不同 seed → 不同 sequence
 *  - 字符串 seed 可重复
 */

import { describe, it, expect } from 'vitest';
import { nextRand, rand, randInt, seedFromString, chance, pickOne } from '../rng';

describe('Mulberry32 RNG', () => {
  it('same seed produces same sequence (10 values)', () => {
    let s1: number = 0xdeadbeef;
    let s2: number = 0xdeadbeef;
    const seq1: number[] = [];
    const seq2: number[] = [];
    for (let i = 0; i < 10; i++) {
      const r1 = rand(s1);
      s1 = r1.next;
      seq1.push(r1.value);
      const r2 = rand(s2);
      s2 = r2.next;
      seq2.push(r2.value);
    }
    expect(seq1).toEqual(seq2);
    expect(seq1.length).toBe(10);
  });

  it('different seeds produce different sequences', () => {
    const a: number[] = [];
    const b: number[] = [];
    let sa = 1;
    let sb = 2;
    for (let i = 0; i < 5; i++) {
      const ra = rand(sa);
      sa = ra.next;
      a.push(ra.value);
      const rb = rand(sb);
      sb = rb.next;
      b.push(rb.value);
    }
    expect(a).not.toEqual(b);
  });

  it('nextRand advances state every call', () => {
    const s0 = 42;
    const s1 = nextRand(s0);
    const s2 = nextRand(s1);
    expect(s1).not.toBe(s0);
    expect(s2).not.toBe(s1);
    expect(s1).toBeGreaterThanOrEqual(0);
    expect(s1).toBeLessThan(0x100000000);
  });

  it('seedFromString is deterministic', () => {
    expect(seedFromString('hello')).toBe(seedFromString('hello'));
    expect(seedFromString('hello')).not.toBe(seedFromString('world'));
    expect(seedFromString('')).toBe(0x811c9dc5); // FNV offset
  });

  it('randInt stays within bounds', () => {
    let s = 12345;
    for (let i = 0; i < 50; i++) {
      const r = randInt(s, 3, 7);
      s = r.next;
      expect(r.value).toBeGreaterThanOrEqual(3);
      expect(r.value).toBeLessThanOrEqual(7);
      expect(Number.isInteger(r.value)).toBe(true);
    }
  });

  it('chance(0) never hits, chance(1) always hits', () => {
    let s = 999;
    for (let i = 0; i < 20; i++) {
      const r0 = chance(s, 0);
      s = r0.next;
      expect(r0.hit).toBe(false);
    }
    for (let i = 0; i < 20; i++) {
      const r1 = chance(s, 1);
      s = r1.next;
      expect(r1.hit).toBe(true);
    }
  });

  it('pickOne returns an element from the array', () => {
    let s = 7777;
    const arr = ['a', 'b', 'c', 'd'] as const;
    for (let i = 0; i < 20; i++) {
      const r = pickOne(s, arr);
      s = r.next;
      expect(arr).toContain(r.value);
    }
  });
});
