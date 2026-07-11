/**
 * server/quest.ts
 *
 * Day6.1: 任务 + NPC 系统 (服务器端权威)
 *
 * 设计:
 *   - 不污染 sim (SimEntity.kind 不含 'npc', quest 不属于 entity)
 *   - quest 和 npc 是 GameRoom 上的字段, 由 GameRoom 构造时生成
 *   - NPC 是有 pos 字段的"虚拟实体", 不进 sim state.entities, 只在 GameRoom.npcs[]
 *   - quest 是结构化 JSON, 来自 LLM (有 fallback)
 *
 * 数据流:
 *   server 启动 → GameRoom.reset(seed) → GameRoom 生成 quest + npcs[]
 *   客户端 /state 收到 entities + quest + npcs → HUD 显示
 *   玩家走到 NPC 邻接 (≤1) → 按 J → server 返 dialogue (LLM/fallback)
 *
 * 边界:
 *   - quest level 与 GameRoom level 同步 (Day1 固定 1)
 *   - NPC 数量固定 2 (避免地图太挤)
 *   - NPC 名字从固定池选 (Day6 不让 LLM 生成名字,Day7+ 可扩展)
 */

import { generateQuest, generateDialogue, type QuestJson } from '../src/core/llm/index.js';
import type { EntityId, SimEntity } from '../src/core/sim/types.js';

export interface NpcData {
  /** 唯一 id (不是 EntityId, NPC 不进 sim state) */
  id: string;
  /** 名字 (用于对话生成 prompt 和 HUD 显示) */
  name: string;
  /** 性格描述 (传入 LLM prompt) */
  personality: string;
  /** NPC 所在格坐标 (用于邻接检测) */
  pos: { x: number; y: number };
  /**
   * 上次与该 NPC 对话生成的 dialogue (缓存, 同一玩家不重复生成)
   * key 是 player EntityId
   */
  cachedDialogue: Map<EntityId, { greeting: string; hint: string; farewell: string }>;
}

export interface RoomContent {
  quest: QuestJson | null;
  npcs: NpcData[];
  /** 内容生成时间戳 (debug 用) */
  generatedAt: number;
}

const NPC_NAMES = [
  { name: 'Lantern Bearer', personality: 'cranky old keeper of village gates' },
  { name: 'Driftwood Taro', personality: 'philosophical river merchant' },
  { name: 'Wandering Sage', personality: 'mysterious traveler who speaks in riddles' },
  { name: 'Moss-Covered Elder', personality: 'gentle hermit living in the forest' },
] as const;

const BIOMES = ['forest', 'swamp', 'mountain', 'shrine', 'coast'] as const;

/**
 * 在给定 spawn points 里挑 NPC 位置 (避开已占用的)
 *
 * @param spawnPoints 全部 spawn points (含玩家/怪物/未占用)
 * @param occupied 已占用的位置 (玩家 + 怪物 spawn)
 * @param count 要选几个
 */
function pickNpcSpawns(
  spawnPoints: { x: number; y: number }[],
  occupied: { x: number; y: number }[],
  count: number,
): { x: number; y: number }[] {
  const occSet = new Set(occupied.map((p) => `${p.x},${p.y}`));
  const candidates = spawnPoints.filter((p) => !occSet.has(`${p.x},${p.y}`));
  if (candidates.length >= count) {
    return candidates.slice(0, count);
  }
  // 候选不够 (小地图), 退而求其次: 全部 spawn 复用 + 偏移
  return spawnPoints.slice(0, count);
}

/**
 * 生成房间内容: quest + npcs
 *
 * - quest: 走 LLM (有 fallback),与房间 level 同步
 * - npcs: 固定名字 + 性格池,位置从 spawn points 选
 */
export async function generateRoomContent(
  level: number,
  spawnPoints: { x: number; y: number }[],
  monsterSpawns: { x: number; y: number }[],
): Promise<RoomContent> {
  const biome = BIOMES[Math.abs(level - 1) % BIOMES.length] ?? 'forest';

  // quest: 调 LLM,失败 fallback
  const { quest } = await generateQuest(level, biome);

  // npcs: 2 个,固定池
  const npcCount = 2;
  // 玩家 + 怪物的 spawn 都视为已占用
  const playerSpawn = spawnPoints[0];
  const occupied = [
    ...(playerSpawn ? [playerSpawn] : []),
    ...monsterSpawns,
  ];
  const npcSpawns = pickNpcSpawns(spawnPoints, occupied, npcCount);
  const npcs: NpcData[] = [];
  for (let i = 0; i < npcCount; i++) {
    const tpl = NPC_NAMES[i % NPC_NAMES.length]!;
    const spawn = npcSpawns[i] ?? spawnPoints[i] ?? { x: 1, y: 1 };
    npcs.push({
      id: `npc_${i + 1}`,
      name: tpl.name,
      personality: tpl.personality,
      pos: { x: spawn.x, y: spawn.y },
      cachedDialogue: new Map(),
    });
  }

  return {
    quest,
    npcs,
    generatedAt: Date.now(),
  };
}

/**
 * 找离玩家最近且 ≤1 格 (曼哈顿) 的 NPC
 * 返回 NPC id 或 null
 */
export function findAdjacentNpc(
  npcs: NpcData[],
  playerPos: { x: number; y: number },
): NpcData | null {
  let best: NpcData | null = null;
  let bestDist = Infinity;
  for (const npc of npcs) {
    const d = Math.abs(npc.pos.x - playerPos.x) + Math.abs(npc.pos.y - playerPos.y);
    if (d <= 1 && d < bestDist) {
      bestDist = d;
      best = npc;
    }
  }
  return best;
}

/**
 * 玩家与 NPC 对话 (有缓存)
 *
 * - 同玩家 (EntityId) 第二次对话返缓存
 * - 不同玩家对话重新生成 (各玩家独立)
 */
export async function talkToNpc(
  npc: NpcData,
  playerId: EntityId,
  playerContext: string,
): Promise<{ greeting: string; hint: string; farewell: string; source: 'cache' | 'llm' | 'fallback' }> {
  const cached = npc.cachedDialogue.get(playerId);
  if (cached) {
    return { ...cached, source: 'cache' };
  }
  const { dialogue, meta } = await generateDialogue(npc.name, npc.personality, playerContext);
  const result = { greeting: dialogue.greeting, hint: dialogue.hint, farewell: dialogue.farewell };
  npc.cachedDialogue.set(playerId, result);
  return { ...result, source: meta.source };
}
