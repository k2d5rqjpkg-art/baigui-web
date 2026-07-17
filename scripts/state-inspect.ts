/**
 * scripts/state-inspect.ts
 * 独立 tsx 入口 — state-dump / bench-repl 调它
 */
import { GameRoom } from '../server/state.js';
import { emptyState, addEntity, worldGen, tick } from '../src/core/sim/index.js';

const cmd = process.argv[2];

if (cmd === 'dump') {
  const seed = Number(process.argv[3] ?? 1);
  const entityId = process.argv[4] ?? null;
  const room = new GameRoom(`inspect-${Date.now()}`);
  room.reset(seed);
  if (entityId) {
    const e = room.state.entities[entityId as never];
    console.log(JSON.stringify(e ?? null, null, 2));
  } else {
    const summary = {
      tick: room.state.tick,
      rng: room.state.rng,
      layout: {
        width: room.layout.width,
        height: room.layout.height,
        rooms: room.layout.rooms.length,
      },
      entities: Object.fromEntries(
        Object.entries(room.state.entities).map(([id, e]) => [
          id,
          {
            kind: e.kind,
            pos: e.pos,
            hp: e.hp,
            maxHp: e.maxHp,
            level: e.level,
            atk: e.atk,
            def: e.def,
          },
        ]),
      ),
      content: { quest: room.content?.quest?.title ?? null, npcs: room.content?.npcs.length ?? 0 },
    };
    console.log(JSON.stringify(summary, null, 2));
  }
} else if (cmd === 'bench') {
  const N = Number(process.argv[3] ?? 1000);
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
  for (let i = 0; i < 100; i++) {
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
  const t0 = performance.now();
  for (let i = 0; i < N; i++) tick(s, [], 50, { layout });
  const ms = performance.now() - t0;
  console.log(`N=${N} ${ms.toFixed(1)}ms ${(N / (ms / 1000)).toFixed(0)} ticks/s`);
} else {
  console.log('Usage: state-inspect dump [seed] [entityId] | bench [N]');
}
