/**
 * src/core/sim/__tests__/skills.test.ts
 *
 * Day12: 技能系统测试 (27 技能 + 3 类)
 */
import { describe, it, expect } from 'vitest';
import {
  SKILL_LIBRARY,
  getSkillsByClass,
  sortByTier,
  getLearnedSkills,
  getClass,
  getSkillPoints,
  learnSkill,
  gainSkillPointsOnLevelUp,
  type ClassKind,
} from '../skills';
import { emptyState, addEntity } from '../tick';
import type { SimEntity, EntityId } from '../types';

function makePlayer(level: number = 1, classKind: ClassKind = 'warrior'): SimEntity {
  const e: SimEntity = {
    id: 'e_p1' as EntityId,
    kind: 'player',
    pos: { x: 5, y: 5 },
    hp: 100,
    maxHp: 100,
    atk: 30,
    def: 5,
    level,
    faction: 'player',
    inventory: [],
    equipment: {},
    buffs: [{ type: 'class', classKind, skillPoints: 0 } as any],
  };
  return e;
}

describe('SKILL_LIBRARY (27 技能 × 3 类)', () => {
  it('总数 27 (3 类 × 3 tier × 3 path)', () => {
    expect(Object.keys(SKILL_LIBRARY).length).toBe(27);
  });

  it('每类 9 技能', () => {
    expect(getSkillsByClass('warrior').length).toBe(9);
    expect(getSkillsByClass('mage').length).toBe(9);
    expect(getSkillsByClass('rogue').length).toBe(9);
  });

  it('每个技能有 id/name/class/tier/path/requiredLevel', () => {
    for (const s of Object.values(SKILL_LIBRARY)) {
      expect(s.id).toBeTruthy();
      expect(s.name).toBeTruthy();
      expect(['warrior', 'mage', 'rogue']).toContain(s.classKind);
      expect(['basic', 'advanced', 'master']).toContain(s.tier);
      expect(['offense', 'defense', 'utility']).toContain(s.path);
      expect(s.requiredLevel).toBeGreaterThan(0);
    }
  });

  it('basic 等级 1, advanced 5, master 10', () => {
    for (const s of Object.values(SKILL_LIBRARY)) {
      if (s.tier === 'basic') expect(s.requiredLevel).toBe(1);
      else if (s.tier === 'advanced') expect(s.requiredLevel).toBe(5);
      else if (s.tier === 'master') expect(s.requiredLevel).toBe(10);
    }
  });
});

describe('sortByTier', () => {
  it('basic → advanced → master', () => {
    const sorted = sortByTier(Object.values(SKILL_LIBRARY));
    expect(sorted[0]!.tier).toBe('basic');
    expect(sorted[sorted.length - 1]!.tier).toBe('master');
  });
});

describe('getClass / getSkillPoints (从 buffs 取)', () => {
  it('默认 warrior, 0 点', () => {
    const p = makePlayer(1);
    expect(getClass(p)).toBe('warrior');
    expect(getSkillPoints(p)).toBe(0);
  });

  it('mage 类', () => {
    const p = makePlayer(1, 'mage');
    expect(getClass(p)).toBe('mage');
  });

  it('无 class buff → 默认 warrior', () => {
    const p: SimEntity = { ...makePlayer(1), buffs: [] };
    expect(getClass(p)).toBe('warrior');
  });

  it('gainSkillPointsOnLevelUp 加 1 点', () => {
    const s = addEntity(emptyState(42), makePlayer(1));
    const s2 = gainSkillPointsOnLevelUp(s, 'e_p1' as EntityId, 2);
    expect(getSkillPoints(s2.entities['e_p1' as EntityId]!)).toBe(1);
  });
});

describe('learnSkill (学技能)', () => {
  it('basic 技能 lv1 → 成功学, atk +5', () => {
    const s = addEntity(emptyState(42), makePlayer(1, 'warrior'));
    // 给技能点
    const sWithPoints = gainSkillPointsOnLevelUp(s, 'e_p1' as EntityId, 2);
    const r = learnSkill(sWithPoints, 'e_p1' as EntityId, 'w-basic-power-strike');
    expect(r.success).toBe(true);
    expect(r.newState.entities['e_p1' as EntityId]!.atk).toBe(35); // 30 + 5
  });

  it('高级技能需前置 → 失败', () => {
    const s = addEntity(emptyState(42), makePlayer(5, 'warrior'));
    const sWithPoints = gainSkillPointsOnLevelUp(s, 'e_p1' as EntityId, 6);
    const r = learnSkill(sWithPoints, 'e_p1' as EntityId, 'w-adv-whirlwind');
    expect(r.success).toBe(false);
    expect(r.reason).toContain('missing prereq');
  });

  it('错误职业学技能 → 失败', () => {
    const s = addEntity(emptyState(42), makePlayer(1, 'mage'));
    const sWithPoints = gainSkillPointsOnLevelUp(s, 'e_p1' as EntityId, 2);
    const r = learnSkill(sWithPoints, 'e_p1' as EntityId, 'w-basic-power-strike'); // warrior 技能
    expect(r.success).toBe(false);
    expect(r.reason).toContain('wrong class');
  });

  it('等级不够 → 失败', () => {
    const s = addEntity(emptyState(42), makePlayer(1, 'warrior'));
    const sWithPoints = gainSkillPointsOnLevelUp(s, 'e_p1' as EntityId, 2);
    const r = learnSkill(sWithPoints, 'e_p1' as EntityId, 'w-master-berserker'); // 需 lv10
    expect(r.success).toBe(false);
    expect(r.reason).toContain('level too low');
  });

  it('已学技能 → 失败', () => {
    const s = addEntity(emptyState(42), makePlayer(1, 'warrior'));
    const sWithPoints = gainSkillPointsOnLevelUp(s, 'e_p1' as EntityId, 2);
    const r1 = learnSkill(sWithPoints, 'e_p1' as EntityId, 'w-basic-power-strike');
    expect(r1.success).toBe(true);
    const r2 = learnSkill(r1.newState, 'e_p1' as EntityId, 'w-basic-power-strike');
    expect(r2.success).toBe(false);
    expect(r2.reason).toContain('already learned');
  });

  it('没技能点 → 失败', () => {
    const s = addEntity(emptyState(42), makePlayer(1, 'warrior'));
    // 不加技能点
    const r = learnSkill(s, 'e_p1' as EntityId, 'w-basic-power-strike');
    expect(r.success).toBe(false);
    expect(r.reason).toContain('no skill points');
  });

  it('学完前置 → 能学 advanced', () => {
    const s = addEntity(emptyState(42), makePlayer(5, 'warrior'));
    // 多次升级给技能点
    let cur = s;
    for (let i = 0; i < 5; i++) cur = gainSkillPointsOnLevelUp(cur, 'e_p1' as EntityId, 2 + i);
    // 学前置
    const r1 = learnSkill(cur, 'e_p1' as EntityId, 'w-basic-power-strike');
    expect(r1.success).toBe(true);
    // 学 advanced
    const r2 = learnSkill(r1.newState, 'e_p1' as EntityId, 'w-adv-whirlwind');
    expect(r2.success).toBe(true);
    // atk: 30 + 5 (basic) + 15 (advanced) = 50
    expect(r2.newState.entities['e_p1' as EntityId]!.atk).toBe(50);
  });

  it('学技能扣技能点', () => {
    const s = addEntity(emptyState(42), makePlayer(1, 'warrior'));
    const sWithPoints = gainSkillPointsOnLevelUp(s, 'e_p1' as EntityId, 2);
    expect(getSkillPoints(sWithPoints.entities['e_p1' as EntityId]!)).toBe(1);
    const r = learnSkill(sWithPoints, 'e_p1' as EntityId, 'w-basic-power-strike');
    expect(getSkillPoints(r.newState.entities['e_p1' as EntityId]!)).toBe(0);
  });
});

describe('getLearnedSkills', () => {
  it('从 buffs 提取', () => {
    const s = addEntity(emptyState(42), makePlayer(1, 'warrior'));
    const sWithPoints = gainSkillPointsOnLevelUp(s, 'e_p1' as EntityId, 2);
    const r = learnSkill(sWithPoints, 'e_p1' as EntityId, 'w-basic-power-strike');
    expect(getLearnedSkills(r.newState.entities['e_p1' as EntityId]!)).toEqual([
      'w-basic-power-strike',
    ]);
  });
});
