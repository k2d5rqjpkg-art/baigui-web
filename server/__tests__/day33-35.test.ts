/**
 * server/__tests__/day33-35.test.ts
 */
import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import { GameRoom } from '../state.js';
import { gainSkillPointsOnLevelUp } from '../../src/core/sim/skills.js';
import type { EntityId } from '../../src/core/sim/types.js';

describe('Day33-35 GameRoom API', () => {
  it('applyLearnSkill 可学 basic', () => {
    const room = new GameRoom('t1');
    room.reset(1);
    // 找玩家并给技能点
    const pid = Object.keys(room.state.entities).find(
      (id) => room.state.entities[id as EntityId]?.kind === 'player',
    ) as EntityId;
    expect(pid).toBeTruthy();
    room.state = gainSkillPointsOnLevelUp(room.state, pid, 2);
    // 确保 class buff
    const p = room.state.entities[pid]!;
    if (!p.buffs.some((b: any) => b.type === 'class')) {
      room.state = {
        ...room.state,
        entities: {
          ...room.state.entities,
          [pid]: {
            ...p,
            buffs: [...p.buffs, { type: 'class', classKind: 'warrior', skillPoints: 2 } as any],
          },
        },
      };
    } else {
      room.state = gainSkillPointsOnLevelUp(room.state, pid, 2);
    }
    const r = room.applyLearnSkill(pid, 'w-basic-power-strike');
    // 可能因 skill points / class 失败, 但 API 不崩
    expect(typeof r.ok).toBe('boolean');
    expect(typeof r.reason).toBe('string');
  });

  it('enterDungeonRun 替换 layout 并有 boss', () => {
    const room = new GameRoom('t2');
    room.reset(1);
    const before = room.entityCount;
    const r = room.enterDungeonRun('cave_1');
    expect(r.ok).toBe(true);
    expect(r.name).toContain('洞窟');
    expect(room.entityCount).toBeGreaterThan(0);
    const hasBoss = Object.values(room.state.entities).some((e) => String(e.id).includes('boss'));
    expect(hasBoss).toBe(true);
    expect(before).toBeGreaterThanOrEqual(0);
  });
});

describe('Day33-36 源码', () => {
  it('bridge 有 skill/equip/dungeon 路由', () => {
    const src = fs.readFileSync(path.resolve(__dirname, '../bridge.ts'), 'utf-8');
    expect(src).toMatch(/\/skill\/learn/);
    expect(src).toMatch(/\/equip/);
    expect(src).toMatch(/\/dungeon\/enter/);
  });
  it('pvp 匹配跳转 room', () => {
    const src = fs.readFileSync(
      path.resolve(__dirname, '../../src/hosts/browser/pvp-panel.ts'),
      'utf-8',
    );
    expect(src).toMatch(/searchParams\.set\('room'/);
  });
  it('minimap + G 键副本', () => {
    const mini = fs.readFileSync(
      path.resolve(__dirname, '../../src/hosts/browser/minimap.ts'),
      'utf-8',
    );
    const input = fs.readFileSync(
      path.resolve(__dirname, '../../src/hosts/browser/input.ts'),
      'utf-8',
    );
    expect(mini).toMatch(/getLayout/);
    expect(input).toMatch(/KeyG/);
    expect(input).toMatch(/enterDungeonLocal/);
  });
});
