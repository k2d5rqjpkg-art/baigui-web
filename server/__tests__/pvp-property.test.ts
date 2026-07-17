/**
 * server/__tests__/pvp-property.test.ts
 *
 * Day44: property-based PvP — 用 fast-check 生成参数化对战
 */
import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import { PvPRoom, expectedScore, updateElo } from '../pvp.js';

describe('Day44: property-based PvP', () => {
  it('Elo 更新 zero-sum (deltaA + deltaB = 0)', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 800, max: 2500 }),
        fc.integer({ min: 800, max: 2500 }),
        fc.boolean(),
        (rA, rB, winnerA) => {
          const r = updateElo(rA, rB, winnerA, 32);
          expect(r.newA + r.newB).toBe(rA + rB);
          return true;
        },
      ),
      { numRuns: 100 },
    );
  });

  it('expectedScore 在 [0, 1]', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 100, max: 3000 }),
        fc.integer({ min: 100, max: 3000 }),
        (rA, rB) => {
          const e = expectedScore(rA, rB);
          expect(e).toBeGreaterThanOrEqual(0);
          expect(e).toBeLessThanOrEqual(1);
          return true;
        },
      ),
      { numRuns: 100 },
    );
  });

  it('K-factor 越大 |delta| 越大 (单调)', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1000, max: 2000 }),
        fc.integer({ min: 1000, max: 2000 }),
        (rA, rB) => {
          const k16 = Math.abs(updateElo(rA, rB, true, 16).deltaA);
          const k32 = Math.abs(updateElo(rA, rB, true, 32).deltaA);
          const k64 = Math.abs(updateElo(rA, rB, true, 64).deltaA);
          expect(k32).toBeGreaterThanOrEqual(k16);
          expect(k64).toBeGreaterThanOrEqual(k32);
          return true;
        },
      ),
      { numRuns: 50 },
    );
  });

  it('PvPRoom 200 步: HP 合法, winner A/B/null', () => {
    fc.assert(
      fc.property(fc.integer({ min: 1, max: 200 }), (n) => {
        const room = new PvPRoom('p-' + Math.random(), 'p_a' as any, 'p_b' as any, 1200, 1200);
        for (let i = 0; i < n; i++) {
          const a = room.state.entities['p_a' as any];
          const b = room.state.entities['p_b' as any];
          if (!a || !b || a.hp <= 0 || b.hp <= 0) break;
          room.step({ A: { type: 'attack', entityId: 'p_a' as any, payload: { targetId: 'p_b' as any } }, B: null });
          room.step({ A: null, B: { type: 'attack', entityId: 'p_b' as any, payload: { targetId: 'p_a' as any } } });
        }
        expect(room.tickNum).toBeGreaterThanOrEqual(0);
        if (room.winner !== null) {
          expect(['A', 'B']).toContain(room.winner);
        }
        for (const e of Object.values(room.state.entities)) {
          expect(e.hp).toBeGreaterThanOrEqual(0);
        }
        return true;
      }),
      { numRuns: 20 },
    );
  });

  it('K=32 时 |delta| ≤ 32 (上界)', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 100, max: 3000 }),
        fc.integer({ min: 100, max: 3000 }),
        fc.boolean(),
        (rA, rB, wA) => {
          const r = updateElo(rA, rB, wA, 32);
          expect(Math.abs(r.deltaA)).toBeLessThanOrEqual(32);
          return true;
        },
      ),
      { numRuns: 200 },
    );
  });
});