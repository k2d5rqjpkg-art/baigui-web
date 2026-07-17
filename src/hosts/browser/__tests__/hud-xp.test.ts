/**
 * src/hosts/browser/__tests__/hud-xp.test.ts
 * Day15: HUD XP / 技能点 + PlayerSnapshot 字段
 */
// @vitest-environment jsdom
import { describe, it, expect, beforeAll } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import { getXp, getXpToNext, gainXp, killRewardXp } from '../../../core/sim/progression';
import { getSkillPoints, gainSkillPointsOnLevelUp } from '../../../core/sim/skills';
import { emptyState, addEntity } from '../../../core/sim/tick';
import type { EntityId, SimEntity } from '../../../core/sim/types';

describe('Day15: progression 快照字段 (HUD 数据源)', () => {
  it('新玩家 xp=0, xpToNext>0, skillPoints=0', () => {
    const p: SimEntity = {
      id: 'e_p1' as EntityId,
      kind: 'player',
      pos: { x: 1, y: 1 },
      hp: 100,
      maxHp: 100,
      atk: 30,
      def: 5,
      level: 1,
      faction: 'player',
      inventory: [],
      equipment: {},
      buffs: [],
    };
    expect(getXp(p)).toBe(0);
    expect(getXpToNext(p)).toBe(100);
    expect(getSkillPoints(p)).toBe(0);
  });

  it('gainXp + level up → skillPoints 可加', () => {
    let s = addEntity(emptyState(1), {
      id: 'e_p1' as EntityId,
      kind: 'player',
      pos: { x: 1, y: 1 },
      hp: 100,
      maxHp: 100,
      atk: 30,
      def: 5,
      level: 1,
      faction: 'player',
      inventory: [],
      equipment: {},
      buffs: [{ type: 'class', classKind: 'warrior', skillPoints: 0 } as any],
    });
    const r = gainXp(s, 'e_p1' as EntityId, 100);
    s = r.newState;
    expect(r.leveledUp).toBe(true);
    s = gainSkillPointsOnLevelUp(s, 'e_p1' as EntityId, r.newLevel);
    expect(getSkillPoints(s.entities['e_p1' as EntityId]!)).toBe(1);
  });

  it('killRewardXp 正数', () => {
    expect(killRewardXp(1)).toBeGreaterThan(0);
  });
});

describe('Day15: hud/game 源码集成', () => {
  let hudSrc = '';
  let gameSrc = '';
  beforeAll(() => {
    hudSrc = fs.readFileSync(path.resolve(__dirname, '../hud.ts'), 'utf-8');
    gameSrc = fs.readFileSync(path.resolve(__dirname, '../game.ts'), 'utf-8');
  });

  it('PlayerSnapshot 含 xp / xpToNext / skillPoints', () => {
    expect(gameSrc).toMatch(/xp:\s*number/);
    expect(gameSrc).toMatch(/xpToNext:\s*number/);
    expect(gameSrc).toMatch(/skillPoints:\s*number/);
  });

  it('getPlayerSnapshot 填 xp 字段', () => {
    expect(gameSrc).toMatch(/xp:\s*getXp/);
    expect(gameSrc).toMatch(/skillPoints:\s*getSkillPoints/);
  });

  it('本地 tick 击杀给 XP', () => {
    expect(gameSrc).toMatch(/gainXp/);
    expect(gameSrc).toMatch(/killRewardXp/);
    expect(gameSrc).toMatch(/gainSkillPointsOnLevelUp/);
  });

  it('HUD 有 XP 条 + 技能点 + level_up 日志', () => {
    expect(hudSrc).toMatch(/__xpfill/);
    expect(hudSrc).toMatch(/__skillpts/);
    expect(hudSrc).toMatch(/level_up/);
    expect(hudSrc).toMatch(/技能点/);
  });
});
