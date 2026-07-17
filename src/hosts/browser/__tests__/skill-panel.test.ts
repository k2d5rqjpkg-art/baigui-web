/**
 * src/hosts/browser/__tests__/skill-panel.test.ts
 * Day18: 技能面板 + learnPlayerSkill
 */
// @vitest-environment jsdom
import { describe, it, expect, beforeAll } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import { emptyState, addEntity } from '../../../core/sim/tick';
import { learnSkill, getLearnedSkills, getSkillPoints } from '../../../core/sim/skills';
import type { EntityId } from '../../../core/sim/types';

describe('Day18: learnSkill 路径 (面板后端)', () => {
  it('2 点可学 2 个 basic', () => {
    let s = addEntity(emptyState(1), {
      id: 'e_p1' as EntityId,
      kind: 'player',
      pos: { x: 1, y: 1 },
      hp: 100, maxHp: 100, atk: 30, def: 5, level: 5,
      faction: 'player', inventory: [], equipment: {},
      buffs: [{ type: 'class', classKind: 'warrior', skillPoints: 2 } as any],
    });
    const r1 = learnSkill(s, 'e_p1' as EntityId, 'w-basic-power-strike');
    expect(r1.success).toBe(true);
    s = r1.newState;
    const r2 = learnSkill(s, 'e_p1' as EntityId, 'w-basic-shield-up');
    expect(r2.success).toBe(true);
    s = r2.newState;
    expect(getLearnedSkills(s.entities['e_p1' as EntityId]!)).toHaveLength(2);
    expect(getSkillPoints(s.entities['e_p1' as EntityId]!)).toBe(0);
  });
});

describe('Day18: 源码集成', () => {
  let panel = '';
  let game = '';
  let main = '';
  beforeAll(() => {
    panel = fs.readFileSync(path.resolve(__dirname, '../skill-panel.ts'), 'utf-8');
    game = fs.readFileSync(path.resolve(__dirname, '../game.ts'), 'utf-8');
    main = fs.readFileSync(path.resolve(__dirname, '../main.ts'), 'utf-8');
  });
  it('SkillPanel 绑定 KeyK', () => {
    expect(panel).toMatch(/KeyK/);
    expect(panel).toMatch(/learnPlayerSkill/);
  });
  it('BrowserGame.learnPlayerSkill 存在', () => {
    expect(game).toMatch(/learnPlayerSkill/);
    expect(game).toMatch(/learnSkill/);
  });
  it('main 挂载 SkillPanel', () => {
    expect(main).toMatch(/SkillPanel/);
    expect(main).toMatch(/this\.skills/);
  });
  it('玩家初始 class buff + skillPoints', () => {
    expect(game).toMatch(/skillPoints:\s*2/);
    expect(game).toMatch(/classKind:\s*'warrior'/);
  });
});
