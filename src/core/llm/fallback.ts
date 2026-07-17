/**
 * Offline fallback tables for quests and NPC dialogue.
 *
 * Used when:
 *   - DEEPSEEK_API_KEY is not configured (dev / playtest without keys), or
 *   - the LLM call fails after retries (network down, quota, 5xx, etc.)
 *
 * Hardcoded, deterministic, hand-tuned. Designed to feel "okay" rather than
 * generic — at minimum a player should not see duplicate quests back-to-back
 * during a single session.
 *
 * Coverage:
 *   - 5 quests, one per level 1-5
 *   - 3 NPCs, each with 3 dialogue beats (greeting / hint / farewell)
 */

import type { QuestJson } from './prompts/quest.js';
import type { DialogueJson } from './prompts/dialogue.js';
import type { SimEntity, GameState } from '../sim/types.js';
import type { AdvisorSuggestion, AdvisorGoal } from './advisor-types.js';

const QUESTS_BY_LEVEL: Record<number, QuestJson> = {
  1: {
    title: "The Fox's Lost Bell",
    description:
      'A paper charm nailed to a cedar tree trembles faintly; the bell it once held is missing.',
    objective: 'Find the small bronze bell hidden somewhere within 200 paces of the marked tree.',
    reward: '30 spirit jade, 1 fox-tail charm',
  },
  2: {
    title: 'Lanterns Across the Mire',
    description:
      'Five paper lanterns drift across the swamp at dusk; the villagers claim they lead travelers astray on purpose.',
    objective: "Light the shrine at the mire's centre before the sixth lantern surfaces.",
    reward: '120 spirit jade, a watertight talisman',
  },
  3: {
    title: 'The Shrine Without a Name',
    description:
      'An abandoned wayside shrine has begun whispering to anyone who lingers near it past dusk.',
    objective:
      'Investigate the shrine, recover the sealed name-scroll, and bring it to the village elder.',
    reward: '200 spirit jade, 1 inked name-scroll',
  },
  4: {
    title: 'Wisp-Worn Path',
    description:
      'A trail of pale wisps has appeared along the mountain pass. They mark the road to something older than the pass itself.',
    objective:
      'Follow the wisps to their source and bind what you find there without breaking the seal.',
    reward: '260 spirit jade, 1 wisp-thread rope',
  },
  5: {
    title: 'The Frozen Threshold',
    description:
      'An old yōkai-ward at the mountain pass has cracked; the ice it held back begins to whisper in a voice like cracking glass.',
    objective:
      'Re-seal the threshold with three shards of black ice gathered from the upper ridge.',
    reward: '300 spirit jade, one sealed yōkai fang',
  },
};

const NPCS: Record<string, DialogueJson> = {
  'Old Hag Kiku': {
    greeting: "Don't touch the belladonna unless you fancy seeing spirits today.",
    hint: 'Where three crows roost, a root worth more than gold hides in plain earth.',
    farewell: 'Off with you. And wash your hands before you touch my kettle.',
  },
  'Lantern-Bearer Shō': {
    greeting: 'Forgive me — have you seen a flicker of blue along the tree-line?',
    hint: 'The shrine path forks at the mossy stone; the left fork remembers what the right forgets.',
    farewell: "Stay close to the lantern's reach. The dark has a long memory.",
  },
  'Driftwood Taro': {
    greeting: 'The river brought you, did it? It brings everything, eventually.',
    hint: 'Three stones mark a ford that the map forgets. Look for the one with the chipped eye.',
    farewell: "When the water stills, listen. That's when the river tells the truth.",
  },
};

/**
 * Pick a quest for the given level. Levels outside 1-5 clamp to the nearest bucket.
 * Deterministic — no Math.random — so test-llm output is reproducible.
 */
export function fallbackQuest(level: number): QuestJson {
  const clamped = Math.max(1, Math.min(5, Math.floor(level) || 1));
  const quest = QUESTS_BY_LEVEL[clamped];
  if (!quest) {
    // Defensive fallback: shouldn't happen given the clamp above.
    return QUESTS_BY_LEVEL[1]!;
  }
  return quest;
}

/**
 * Pick dialogue for an NPC. Unknown names get a generic "wanderer" voice so
 * nothing crashes if the game spawns an NPC not in the table.
 */
export function fallbackDialogue(npcName: string): DialogueJson {
  const known = NPCS[npcName];
  if (known) return known;
  return {
    greeting: 'You look like someone the road has chewed on for a while.',
    hint: 'Trust the small sounds. The big ones are usually lying.',
    farewell: 'Walk light. The shadows here remember footsteps longer than names.',
  };
}

/** Expose the raw tables for testing / inspection. */
export const _fallbackTables = {
  quests: QUESTS_BY_LEVEL,
  npcs: NPCS,
} as const;

// ============ AI Advisor fallback (v1.1) ============

/**
 * 启发式建议 — 无 LLM key 时使用
 * 规则:
 *   - HP < 30%: retreat (后退)
 *   - HP < 70% 且邻接有 monster: 先 attack (再考虑 retreat)
 *   - 邻接 monster: attack
 *   - 邻接 NPC: talk
 *   - 周围有 item: 走过去捡 (move toward nearest)
 *   - 默认: 随机 explore 方向
 */
export function fallbackAdvisor(player: SimEntity, state: GameState): AdvisorSuggestion {
  const hpRatio = player.hp / Math.max(1, player.maxHp);
  const playerPos = player.pos;

  // 找最近 monster
  const monsters = Object.values(state.entities).filter((e) => e.kind === 'monster');
  const adjacentMonster = monsters.find(
    (m) => Math.abs(m.pos.x - playerPos.x) <= 1 && Math.abs(m.pos.y - playerPos.y) <= 1,
  );

  // 找最近 NPC (10 步内)
  const npcs = (state as any).content?.npcs || [];
  const nearbyNpc = npcs.find(
    (n: any) => Math.abs(n.pos.x - playerPos.x) <= 1 && Math.abs(n.pos.y - playerPos.y) <= 1,
  );

  // 找最近 item
  const items = Object.values(state.entities).filter((e) => e.kind === 'item');
  const nearestItem = items
    .map((i) => ({ i, d: Math.abs(i.pos.x - playerPos.x) + Math.abs(i.pos.y - playerPos.y) }))
    .sort((a, b) => a.d - b.d)[0];

  let goal: AdvisorGoal;
  let action: AdvisorSuggestion['nextAction'];
  let reason: string;

  if (hpRatio < 0.3 && adjacentMonster) {
    // 撤退: 远离最近的怪
    goal = 'retreat';
    const dx = playerPos.x - adjacentMonster.pos.x;
    const dy = playerPos.y - adjacentMonster.pos.y;
    action = {
      type: 'move',
      entityId: player.id,
      payload: {
        dx: dx > 0 ? 1 : dx < 0 ? -1 : 0,
        dy: dy > 0 ? 1 : dy < 0 ? -1 : 0,
      },
    };
    reason = `HP ${(hpRatio * 100).toFixed(0)}%, 撤退`;
  } else if (adjacentMonster) {
    goal = 'attack';
    action = {
      type: 'attack',
      entityId: player.id,
      payload: { targetId: adjacentMonster.id },
    };
    reason = `邻接怪物 ${adjacentMonster.id}, 攻击`;
  } else if (nearbyNpc) {
    goal = 'talk';
    action = {
      type: 'move',
      entityId: player.id,
      payload: { dx: 0, dy: 0 }, // 当前已邻接, 触发对话是 J 键
    };
    reason = `邻接 NPC ${nearbyNpc.name}, 对话`;
  } else if (monsters.length > 0) {
    // 朝最近 monster 走
    const nearest = monsters
      .map((m) => ({ m, d: Math.abs(m.pos.x - playerPos.x) + Math.abs(m.pos.y - playerPos.y) }))
      .sort((a, b) => a.d - b.d)[0];
    if (nearest) {
      goal = 'attack';
      const dx = nearest.m.pos.x - playerPos.x;
      const dy = nearest.m.pos.y - playerPos.y;
      action = {
        type: 'move',
        entityId: player.id,
        payload: {
          dx: dx > 0 ? 1 : dx < 0 ? -1 : 0,
          dy: dy > 0 ? 1 : dy < 0 ? -1 : 0,
        },
      };
      reason = `向最近怪 ${nearest.m.id} 移动`;
    } else {
      goal = 'idle';
      action = { type: 'move', entityId: player.id, payload: { dx: 0, dy: 0 } };
      reason = '无事可做';
    }
  } else if (nearestItem && nearestItem.d > 0) {
    goal = 'explore';
    const dx = nearestItem.i.pos.x - playerPos.x;
    const dy = nearestItem.i.pos.y - playerPos.y;
    action = {
      type: 'move',
      entityId: player.id,
      payload: {
        dx: dx > 0 ? 1 : dx < 0 ? -1 : 0,
        dy: dy > 0 ? 1 : dy < 0 ? -1 : 0,
      },
    };
    reason = `捡物品 ${nearestItem.i.id}`;
  } else {
    goal = 'idle';
    action = { type: 'move', entityId: player.id, payload: { dx: 0, dy: 0 } };
    reason = '等待玩家操作';
  }

  return {
    goal,
    nextAction: action,
    reason,
    source: 'fallback',
  };
}
