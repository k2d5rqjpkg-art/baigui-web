/**
 * scripts/bench-repl-collect.ts
 * 实际跑 sim N 步, 输出一行 JSON
 */
import { emptyState, addEntity, worldGen, tick } from '../src/core/sim/index.js';

const N = Number(process.argv[2] ?? 1000);
const monsters = Number(process.argv[3] ?? 20);

let s = emptyState(1);
s = addEntity(s, {
  id: 'e_p1' as never,
  kind: 'player',
  pos: { x: 5, y: 5 },
  hp: 200,
  maxHp: 200,
  atk: 50,
  def: 10,
  level: 5,
  faction: 'player',
  inventory: [],
  equipment: {},
  buffs: [],
});
for (let i = 0; i < monsters; i++) {
  s = addEntity(s, {
    id: `e_m_${i}` as never,
    kind: 'monster',
    pos: { x: (i % 20) + 1, y: ((i / 20) | 0) + 5 },
    hp: 30,
    maxHp: 30,
    atk: 8,
    def: 1,
    level: 1,
    faction: 'enemy',
    inventory: [],
    equipment: {},
    buffs: [],
  });
}
const layout = worldGen(1, 5);

// 预热
for (let i = 0; i < 100; i++) tick(s, [], 50, { layout });

const t0 = performance.now();
for (let i = 0; i < N; i++) tick(s, [], 50, { layout });
const ms = performance.now() - t0;

console.log(
  JSON.stringify({
    N,
    monsters,
    ms: +ms.toFixed(2),
    ticksPerSec: Math.round(N / (ms / 1000)),
    perTickUs: +((ms * 1000) / N).toFixed(2),
  }),
);
