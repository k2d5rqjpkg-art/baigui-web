/**
 * src/core/llm/__tests__/quest-pool.test.ts
 *
 * v1.3: PCG 任务池单元测试
 */
import { describe, it, expect } from 'vitest';
import {
  QUEST_POOL,
  pickQuestTemplates,
  expandQuest,
  generateQuests,
} from '../quest-pool';

describe('QUEST_POOL (模板池)', () => {
  it('包含至少 25 个模板', () => {
    expect(QUEST_POOL.length).toBeGreaterThanOrEqual(25);
  });

  it('每个模板有 id/kind/biome/levelRange', () => {
    for (const t of QUEST_POOL) {
      expect(t.id).toBeTruthy();
      expect(['kill', 'collect', 'talk', 'explore', 'escort']).toContain(t.kind);
      expect(['forest', 'swamp', 'mountain', 'city', 'coast']).toContain(t.biome);
      expect(t.levelMin).toBeLessThanOrEqual(t.levelMax);
      expect(t.count).toBeGreaterThan(0);
    }
  });

  it('id 唯一', () => {
    const ids = QUEST_POOL.map((t) => t.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});

describe('pickQuestTemplates', () => {
  it('filter by level + biome', () => {
    const r = pickQuestTemplates(42, 2, 'forest', 3);
    expect(r.length).toBeGreaterThanOrEqual(1);
    for (const t of r) {
      expect(t.biome).toBe('forest');
      expect(t.levelMin).toBeLessThanOrEqual(2);
      expect(t.levelMax).toBeGreaterThanOrEqual(2);
    }
  });

  it('请求比可用多 → fallback 到 biome 全 level', () => {
    // level 10 在 forest 没匹配
    const r = pickQuestTemplates(42, 10, 'forest', 3);
    expect(r.length).toBeGreaterThanOrEqual(1);
  });

  it('请求比可用多 → biome 全无 → fallback 到全池', () => {
    const r = pickQuestTemplates(42, 10, 'nonexistent' as any, 3);
    expect(r.length).toBeGreaterThanOrEqual(3);
  });

  it('同 seed 同结果 (deterministic)', () => {
    const r1 = pickQuestTemplates(42, 3, 'swamp', 3);
    const r2 = pickQuestTemplates(42, 3, 'swamp', 3);
    expect(r1.map((t) => t.id)).toEqual(r2.map((t) => t.id));
  });

  it('不同 seed → 不同结果 (至少大部分不同)', () => {
    const r1 = pickQuestTemplates(1, 3, 'mountain', 4);
    const r2 = pickQuestTemplates(2, 3, 'mountain', 4);
    expect(r1.map((t) => t.id)).not.toEqual(r2.map((t) => t.id));
  });

  it('返回不重复 id', () => {
    const r = pickQuestTemplates(42, 5, 'coast', 5);
    const ids = r.map((t) => t.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});

describe('expandQuest', () => {
  it('无 key → 用模板硬编码', () => {
    const template = QUEST_POOL[0]!;
    const q = expandQuest(template, 2);
    expect(q.title).toBe(template.baseHint);
    expect(q.objective).toContain(template.kind);
    expect(q.reward).toBe(template.rewardTemplate);
  });

  it('有 key → 仍返回完整 QuestJson', () => {
    const template = QUEST_POOL[0]!;
    const q = expandQuest(template, 2, 'sk-test');
    expect(q.title).toBeTruthy();
    expect(q.description).toBeTruthy();
    expect(q.objective).toBeTruthy();
    expect(q.reward).toBeTruthy();
  });
});

describe('generateQuests (主入口)', () => {
  it('返回 N 个 QuestJson', () => {
    const quests = generateQuests(42, 3, 'forest', 3);
    expect(quests.length).toBe(3);
    for (const q of quests) {
      expect(q.title).toBeTruthy();
      expect(q.description).toBeTruthy();
      expect(q.objective).toBeTruthy();
      expect(q.reward).toBeTruthy();
    }
  });

  it('同 seed 同结果', () => {
    const a = generateQuests(42, 3, 'forest', 3);
    const b = generateQuests(42, 3, 'forest', 3);
    expect(a.map((q) => q.title)).toEqual(b.map((q) => q.title));
  });
});