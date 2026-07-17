/**
 * src/hosts/browser/__tests__/save-load.test.ts
 * Day24: 存档序列化 / 读档应用
 */
// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from 'vitest';
import { writeSave, readSave, type LocalSave } from '../save-load';

describe('Day24 localStorage 存档', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('write + read 往返', () => {
    const save: LocalSave = {
      version: 1,
      savedAt: 123,
      level: 7,
      xp: 50,
      hp: 80,
      maxHp: 120,
      atk: 40,
      def: 10,
      inventory: ['iron_sword'],
      equipment: { weapon: 'iron_sword' },
      classKind: 'warrior',
      skillPoints: 2,
      learnedSkills: ['w-basic-power-strike'],
    };
    writeSave(save);
    const loaded = readSave();
    expect(loaded?.level).toBe(7);
    expect(loaded?.inventory).toEqual(['iron_sword']);
    expect(loaded?.learnedSkills).toContain('w-basic-power-strike');
  });

  it('无存档 → null', () => {
    expect(readSave()).toBeNull();
  });
});
