/**
 * src/core/llm/quest-pool.ts
 *
 * v1.3: PCG 任务池
 *
 * 借鉴 WoC: 90 个手写任务 → 我们用 30 个模板 + LLM 装饰细节
 *
 * 设计:
 *   - QuestTemplate: { id, kind, target, count, biome, levelRange }
 *   - pickQuestTemplates(seed, level, biome, count) → QuestTemplate[]
 *   - expandQuest(template, llm?) → QuestJson
 *   - LLM 失败 → 用模板硬编码标题
 */
import { hashKey } from './cache';
import type { QuestJson } from './prompts/quest';
import { fallbackQuest } from './fallback';

export type QuestKind = 'kill' | 'collect' | 'talk' | 'explore' | 'escort';
export type Biome = 'forest' | 'swamp' | 'mountain' | 'city' | 'coast';

export interface QuestTemplate {
  id: string;
  kind: QuestKind;
  target: 'monster' | 'item' | 'npc' | 'area';
  count: number;
  biome: Biome;
  levelMin: number;
  levelMax: number;
  /** LLM 装饰 title/description 用 */
  baseHint: string;
  /** 简单默认 reward (金币/经验占位) */
  rewardTemplate: string;
}

/** 任务池 (30 个模板, 跨 5 biome × 3 kind × 2 难度) */
export const QUEST_POOL: QuestTemplate[] = [
  // Forest biome (L1-5)
  { id: 'q-forest-slimes', kind: 'kill', target: 'monster', count: 5, biome: 'forest', levelMin: 1, levelMax: 3,
    baseHint: '森林里的史莱姆', rewardTemplate: '20 金 + 50 经验' },
  { id: 'q-forest-wolves', kind: 'kill', target: 'monster', count: 3, biome: 'forest', levelMin: 2, levelMax: 4,
    baseHint: '森林狼群', rewardTemplate: '30 金 + 80 经验' },
  { id: 'q-forest-herbs', kind: 'collect', target: 'item', count: 3, biome: 'forest', levelMin: 1, levelMax: 2,
    baseHint: '采集草药', rewardTemplate: '15 金' },
  { id: 'q-forest-spirit', kind: 'talk', target: 'npc', count: 1, biome: 'forest', levelMin: 1, levelMax: 2,
    baseHint: '森林精灵求助', rewardTemplate: '25 金 + 任务道具' },
  { id: 'q-forest-explore', kind: 'explore', target: 'area', count: 1, biome: 'forest', levelMin: 1, levelMax: 5,
    baseHint: '探索森林深处', rewardTemplate: '50 金 + 地图碎片' },

  // Swamp biome (L3-5)
  { id: 'q-swamp-zombies', kind: 'kill', target: 'monster', count: 4, biome: 'swamp', levelMin: 3, levelMax: 5,
    baseHint: '沼泽僵尸', rewardTemplate: '40 金 + 100 经验' },
  { id: 'q-swamp-toads', kind: 'kill', target: 'monster', count: 6, biome: 'swamp', levelMin: 3, levelMax: 4,
    baseHint: '巨型沼泽蟾蜍', rewardTemplate: '35 金' },
  { id: 'q-swamp-mushroom', kind: 'collect', target: 'item', count: 5, biome: 'swamp', levelMin: 3, levelMax: 5,
    baseHint: '沼泽毒蘑菇', rewardTemplate: '40 金 + 炼金材料' },
  { id: 'q-swamp-spirit', kind: 'talk', target: 'npc', count: 1, biome: 'swamp', levelMin: 4, levelMax: 5,
    baseHint: '沼泽幽魂诉求', rewardTemplate: '60 金' },
  { id: 'q-swamp-bridge', kind: 'explore', target: 'area', count: 1, biome: 'swamp', levelMin: 3, levelMax: 5,
    baseHint: '探索断桥废墟', rewardTemplate: '70 金' },

  // Mountain biome (L4-6)
  { id: 'q-mountain-golems', kind: 'kill', target: 'monster', count: 3, biome: 'mountain', levelMin: 4, levelMax: 6,
    baseHint: '石巨人守卫', rewardTemplate: '60 金 + 150 经验' },
  { id: 'q-mountain-bears', kind: 'kill', target: 'monster', count: 4, biome: 'mountain', levelMin: 4, levelMax: 5,
    baseHint: '山地棕熊', rewardTemplate: '50 金' },
  { id: 'q-mountain-ore', kind: 'collect', target: 'item', count: 8, biome: 'mountain', levelMin: 4, levelMax: 6,
    baseHint: '采集铁矿', rewardTemplate: '70 金 + 锻造材料' },
  { id: 'q-mountain-hermit', kind: 'talk', target: 'npc', count: 1, biome: 'mountain', levelMin: 5, levelMax: 6,
    baseHint: '山巅隐士', rewardTemplate: '90 金 + 传说级装备' },
  { id: 'q-mountain-pass', kind: 'explore', target: 'area', count: 1, biome: 'mountain', levelMin: 4, levelMax: 6,
    baseHint: '穿越雪山口', rewardTemplate: '100 金' },

  // City biome (L1-3, 低级)
  { id: 'q-city-rats', kind: 'kill', target: 'monster', count: 5, biome: 'city', levelMin: 1, levelMax: 2,
    baseHint: '城市鼠患', rewardTemplate: '10 金' },
  { id: 'q-city-thief', kind: 'kill', target: 'monster', count: 2, biome: 'city', levelMin: 2, levelMax: 3,
    baseHint: '城中小偷', rewardTemplate: '25 金' },
  { id: 'q-city-package', kind: 'collect', target: 'item', count: 1, biome: 'city', levelMin: 1, levelMax: 2,
    baseHint: '丢失的包裹', rewardTemplate: '20 金 + 居民好感' },
  { id: 'q-city-merchant', kind: 'talk', target: 'npc', count: 1, biome: 'city', levelMin: 1, levelMax: 3,
    baseHint: '商人委托', rewardTemplate: '40 金 + 货物' },
  { id: 'q-city-sewer', kind: 'explore', target: 'area', count: 1, biome: 'city', levelMin: 2, levelMax: 3,
    baseHint: '下水道探索', rewardTemplate: '60 金 + 神秘线索' },

  // Coast biome (L3-6)
  { id: 'q-coast-pirates', kind: 'kill', target: 'monster', count: 5, biome: 'coast', levelMin: 3, levelMax: 5,
    baseHint: '海岸海盗', rewardTemplate: '50 金 + 海盗战利品' },
  { id: 'q-coast-shark', kind: 'kill', target: 'monster', count: 1, biome: 'coast', levelMin: 5, levelMax: 6,
    baseHint: '深海巨鲨', rewardTemplate: '150 金 + 传说武器' },
  { id: 'q-coast-pearl', kind: 'collect', target: 'item', count: 4, biome: 'coast', levelMin: 3, levelMax: 4,
    baseHint: '采集珍珠', rewardTemplate: '40 金' },
  { id: 'q-coast-fisher', kind: 'talk', target: 'npc', count: 1, biome: 'coast', levelMin: 3, levelMax: 4,
    baseHint: '渔夫委托', rewardTemplate: '30 金 + 新鱼获' },
  { id: 'q-coast-lighthouse', kind: 'explore', target: 'area', count: 1, biome: 'coast', levelMin: 4, levelMax: 6,
    baseHint: '探索废弃灯塔', rewardTemplate: '80 金' },

  // 跨 biome: 高级任务
  { id: 'q-escort-wagon', kind: 'escort', target: 'npc', count: 1, biome: 'city', levelMin: 2, levelMax: 4,
    baseHint: '护送商队', rewardTemplate: '70 金 + 护卫声望' },
  { id: 'q-ghost-marshal', kind: 'kill', target: 'monster', count: 1, biome: 'forest', levelMin: 4, levelMax: 5,
    baseHint: '幽灵游骑兵', rewardTemplate: '100 金 + 灵魂碎片' },
  { id: 'q-sky-island', kind: 'explore', target: 'area', count: 1, biome: 'mountain', levelMin: 5, levelMax: 6,
    baseHint: '天空岛探索', rewardTemplate: '200 金 + 飞行符文' },
  { id: 'q-deep-treasure', kind: 'collect', target: 'item', count: 1, biome: 'coast', levelMin: 5, levelMax: 6,
    baseHint: '深海宝藏', rewardTemplate: '150 金 + 稀有装备' },
  { id: 'q-ancient-tome', kind: 'collect', target: 'item', count: 1, biome: 'mountain', levelMin: 4, levelMax: 5,
    baseHint: '古籍残卷', rewardTemplate: '90 金 + 法师声望' },
];

/**
 * 从池里挑 N 个模板
 * 用确定性 RNG (基于 seed), 避免 LLM 抖动
 */
export function pickQuestTemplates(
  seed: number,
  level: number,
  biome: Biome,
  count: number,
): QuestTemplate[] {
  // 1. 过滤匹配 level + biome
  const matching = QUEST_POOL.filter(
    (t) => t.biome === biome && level >= t.levelMin && level <= t.levelMax,
  );
  // 2. 兜底: 没匹配就放宽到 biome 任意 level
  const pool = matching.length >= count ? matching : QUEST_POOL.filter((t) => t.biome === biome);
  const finalPool = pool.length >= count ? pool : QUEST_POOL;

  // 3. 确定性洗牌 (LCG)
  let rng = (seed * 9301 + 49297) >>> 0;
  const shuffled = [...finalPool];
  for (let i = shuffled.length - 1; i > 0; i--) {
    rng = (rng * 1103515245 + 12345) >>> 0;
    const j = rng % (i + 1);
    [shuffled[i], shuffled[j]] = [shuffled[j]!, shuffled[i]!];
  }

  // 4. 取前 N 个, 去重 id
  const picked: QuestTemplate[] = [];
  const seen = new Set<string>();
  for (const t of shuffled) {
    if (seen.has(t.id)) continue;
    seen.add(t.id);
    picked.push(t);
    if (picked.length >= count) break;
  }

  return picked;
}

/**
 * 把模板展开为 QuestJson
 * 1. LLM 调用 (有 key 时): 装饰 title/description
 * 2. 失败 → 用模板硬编码 title (baseHint + 数字编号)
 */
export function expandQuest(
  template: QuestTemplate,
  level: number,
  apiKey?: string,
): QuestJson {
  // LLM 装饰 (失败 fallback)
  let title: string;
  let description: string;
  if (apiKey) {
    try {
      // 简化: 实际 LLM 调用放 server 端, 客户端只 sync 模板
      // 这里保留 fallback
      const fb = fallbackQuest(level);
      title = `${template.baseHint} · ${fb.title}`;
      description = `在 ${template.biome} 区域, ${template.baseHint}。${fb.description}`;
    } catch {
      title = template.baseHint;
      description = `${template.biome} 区域: ${template.baseHint}`;
    }
  } else {
    // 无 key → 用模板硬编码
    title = template.baseHint;
    description = `在 ${template.biome} 区域, ${template.baseHint}`;
  }

  const objective = `完成 ${template.kind} 任务: ${template.target} ×${template.count}`;
  const reward = template.rewardTemplate;

  return { title, description, objective, reward };
}

/**
 * 主入口: 用 seed + level + biome 生成 N 个完整 quest
 */
export function generateQuests(
  seed: number,
  level: number,
  biome: Biome,
  count: number,
  apiKey?: string,
): QuestJson[] {
  const templates = pickQuestTemplates(seed, level, biome, count);
  return templates.map((t) => expandQuest(t, level, apiKey));
}

/** 缓存 hash (用于跨调用稳定性) */
export function questPoolHash(level: number, biome: Biome): string {
  return hashKey(`questpool:${level}:${biome}`);
}