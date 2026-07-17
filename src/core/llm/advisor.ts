/**
 * src/core/llm/advisor.ts
 *
 * v1.1: AI 玩家决策层 (LLM 慢路径)
 *
 * 借鉴 WoC (World-of-ClaudeCraft) 多模型分层架构:
 *   - 快路径: sim 20Hz tick 跑 sim (已有)
 *   - 慢路径: AIAdvisor 1Hz 调 LLM 生成建议 (新)
 *   - 表达: HUD 提示面板 (新)
 */
import type { GameState, SimEntity, Action, EntityId } from '../sim/index.js';
import { log } from '../log.js';
import { llmCache } from './cache.js';
import { fallbackAdvisor } from './fallback.js';
import type { AdvisorSuggestion, AdvisorRawResponse } from './advisor-types.js';

export type { AdvisorGoal, AdvisorSuggestion } from './advisor-types.js';
export { fallbackAdvisor } from './fallback.js';

const SYSTEM_PROMPT = `你是百鬼夜行录的 AI 玩家顾问。基于当前 player 状态和周围环境，给出下一步建议。

输出 JSON:
{
  "goal": "attack" | "retreat" | "heal" | "explore" | "quest" | "talk" | "idle",
  "reason": "一句话原因",
  "nextAction": { "type": "move", "dx": -1|0|1, "dy": -1|0|1 } | { "type": "attack", "targetId": "e_xxx" } | { "type": "idle" }
}

决策规则:
- HP < 30%: retreat 或 heal
- 周围有怪物: attack (除非 HP < 30%)
- 有邻接 NPC: talk
- 无事可做: explore
- 默认: idle`;

/** 序列化 player 附近 5x5 grid 给 LLM */
export function buildAdvisorContext(player: SimEntity, state: GameState): string {
  const px = player.pos.x;
  const py = player.pos.y;
  const nearby = Object.values(state.entities)
    .filter((e) => Math.abs(e.pos.x - px) <= 5 && Math.abs(e.pos.y - py) <= 5)
    .map((e) => ({
      kind: e.kind,
      id: e.id,
      dist: Math.abs(e.pos.x - px) + Math.abs(e.pos.y - py),
      hp: e.hp,
      maxHp: e.maxHp,
      level: e.level,
      pos: e.pos,
    }));
  return JSON.stringify({
    player: {
      id: player.id,
      pos: player.pos,
      hp: player.hp,
      maxHp: player.maxHp,
      level: player.level,
      atk: player.atk,
      def: player.def,
    },
    nearby,
  });
}

/**
 * 调 LLM 拿建议 (1Hz, 主入口)
 */
export async function suggestNextAction(
  player: SimEntity,
  state: GameState,
  apiKey?: string,
): Promise<AdvisorSuggestion> {
  const playerId = player.id;
  const ctx = buildAdvisorContext(player, state);

  const cacheKey = `advisor:${playerId}:${ctx.length}:${ctx.slice(0, 200)}`;
  const cached = llmCache.get(cacheKey);
  if (cached) {
    try {
      return { ...JSON.parse(cached), source: 'cache' };
    } catch {
      /* ignore */
    }
  }

  if (!apiKey) {
    return fallbackAdvisor(player, state);
  }

  try {
    const r = await callLLMAdvisor(ctx, apiKey, playerId);
    llmCache.set(cacheKey, JSON.stringify(r));
    return r;
  } catch (err) {
    log.warn('[advisor] LLM failed, fallback:', err);
    return fallbackAdvisor(player, state);
  }
}

async function callLLMAdvisor(
  ctx: string,
  apiKey: string,
  playerId: EntityId,
): Promise<AdvisorSuggestion> {
  const baseUrl = process.env.DEEPSEEK_BASE_URL || 'https://api.deepseek.com/v1';
  const model = process.env.DEEPSEEK_MODEL || 'deepseek-chat';

  const res = await fetch(`${baseUrl}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: ctx },
      ],
      max_tokens: 200,
      temperature: 0.7,
    }),
  });

  if (!res.ok) {
    throw new Error(`LLM ${res.status}: ${await res.text()}`);
  }
  const data = await res.json();
  const content = data.choices?.[0]?.message?.content;
  if (!content) throw new Error('LLM empty content');

  const parsed = JSON.parse(content) as AdvisorRawResponse;

  let action: Action;
  if (parsed.nextAction.type === 'move') {
    const dx = Math.max(-1, Math.min(1, parsed.nextAction.dx));
    const dy = Math.max(-1, Math.min(1, parsed.nextAction.dy));
    action = { type: 'move', entityId: playerId, payload: { dx, dy } };
  } else if (parsed.nextAction.type === 'attack' && parsed.nextAction.targetId) {
    action = {
      type: 'attack',
      entityId: playerId,
      payload: { targetId: parsed.nextAction.targetId as EntityId },
    };
  } else {
    // idle: 不发 action, sim 不动
    action = { type: 'idle' as any, entityId: playerId, payload: {} as any };
  }

  return { goal: parsed.goal, nextAction: action, reason: parsed.reason, source: 'llm' };
}
