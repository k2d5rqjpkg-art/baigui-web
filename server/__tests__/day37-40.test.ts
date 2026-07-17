/**
 * server/__tests__/day37-40.test.ts
 */
import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import { GameRoom } from '../state.js';
import type { EntityId } from '../../src/core/sim/types.js';

describe('Day37-40', () => {
  it('enterDungeon 设置 activeDungeon', () => {
    const room = new GameRoom('d1');
    room.reset(1);
    room.enterDungeonRun('cave_1');
    expect(room.activeDungeon).not.toBeNull();
    expect(room.activeDungeon!.bossId).toContain('boss');
  });

  it('respawnPlayer 满血回出生点', () => {
    const room = new GameRoom('d2');
    room.reset(1);
    const pid = Object.keys(room.state.entities).find(
      (id) => room.state.entities[id as EntityId]?.kind === 'player',
    ) as EntityId;
    room.state.entities[pid]!.hp = 0;
    expect(room.respawnPlayer(pid)).toBe(true);
    expect(room.state.entities[pid]!.hp).toBe(room.state.entities[pid]!.maxHp);
  });

  it('bridge 有 /respawn', () => {
    const src = fs.readFileSync(path.resolve(__dirname, '../bridge.ts'), 'utf-8');
    expect(src).toMatch(/\/respawn/);
  });

  it('state 含 boss 掉落逻辑', () => {
    const src = fs.readFileSync(path.resolve(__dirname, '../state.ts'), 'utf-8');
    expect(src).toMatch(/distributeLoot/);
    expect(src).toMatch(/kill_streak_/);
    expect(src).toMatch(/dungeon_clear/);
  });

  it('客户端 hotbar + 连杀日志', () => {
    const hot = fs.readFileSync(
      path.resolve(__dirname, '../../src/hosts/browser/hotbar.ts'),
      'utf-8',
    );
    const hud = fs.readFileSync(path.resolve(__dirname, '../../src/hosts/browser/hud.ts'), 'utf-8');
    expect(hot).toMatch(/Digit1/);
    expect(hot).toMatch(/learnPlayerSkill/);
    expect(hud).toMatch(/kill_streak_/);
    expect(hud).toMatch(/dungeon_clear/);
  });
});
