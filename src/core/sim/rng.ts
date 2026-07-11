/**
 * Mulberry32 —— 32-bit 周期确定性 PRNG
 *
 * 选型理由:
 *   - 周期 2^32,足够 Day1 PCG 用 (不需要更长周期)
 *   - 单 state 字段 (u32),可直接塞进 GameState,便于回放 / 网络同步
 *   - 质量足够好 (通过 BigCrush 不少指标),远好于 `Math.random` (不可控)
 *
 * 参考: Tommy Ettinger / 业界广用 —— 见 https://stackoverflow.com/a/47593316
 */

import type { RNGState } from './types';

/**
 * 用字符串生成确定性 seed。
 * FNV-1a 32-bit —— 简单、稳、无依赖。
 * 同一个字符串永远得到同一个 seed。
 */
export function seedFromString(s: string): RNGState {
  let h = 0x811c9dc5; // FNV offset basis
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    // 32-bit FNV prime: 16777619
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h >>> 0;
}

/**
 * Mulberry32 步进 —— 输入 state,输出新 state。
 * 纯函数,可序列化。
 */
export function nextRand(state: RNGState): RNGState {
  let t = (state + 0x6D2B79F5) >>> 0;
  t = Math.imul(t ^ (t >>> 15), t | 1) >>> 0;
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61) >>> 0;
  return (t ^ (t >>> 14)) >>> 0;
}

/**
 * 推进 state 并返回 [0, 1) 的浮点。
 * 这是默认的 `rand()` 函数 —— UI / 战斗 / PCG 全用这个。
 */
export function rand(state: RNGState): { value: number; next: RNGState } {
  const next = nextRand(state);
  return { value: next / 0x100000000, next };
}

/**
 * 整数区间 [min, max] —— 含两端。
 * 注意:对 min === max 仍返回 min (不会死循环)。
 */
export function randInt(
  state: RNGState,
  min: number,
  max: number,
): { value: number; next: RNGState } {
  if (max < min) {
    throw new Error(`randInt: max (${max}) < min (${min})`);
  }
  const r = rand(state);
  const range = max - min + 1;
  return { value: min + Math.floor(r.value * range), next: r.next };
}

/**
 * 概率判定 —— 用 r < p 形式,这样 p === 0 永不命中,p === 1 永远命中。
 */
export function chance(state: RNGState, p: number): { hit: boolean; next: RNGState } {
  const r = rand(state);
  return { hit: r.value < p, next: r.next };
}

/**
 * 数组里随机挑一个。空数组抛错 (确定性:错误信息固定)。
 */
export function pickOne<T>(
  state: RNGState,
  arr: readonly T[],
): { value: T; next: RNGState } {
  if (arr.length === 0) {
    throw new Error('pickOne: empty array');
  }
  const r = randInt(state, 0, arr.length - 1);
  return { value: arr[r.value]!, next: r.next };
}