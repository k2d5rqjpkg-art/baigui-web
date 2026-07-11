/**
 * Barrel export for the LLM content layer.
 *
 * Provides two resilient generators that prefer DeepSeek but always succeed by
 * falling back to static tables when the API is unavailable or failing:
 *
 *   - generateQuest(level, biome)  → QuestJson
 *   - generateDialogue(name, personality, ctx) → DialogueJson
 *
 * Lower-level pieces (generateText, fallbackQuest, fallbackDialogue) are also
 * exported for tests and for callers that want explicit control.
 *
 * The cache layer is transparent: identical prompts within a session are
 * served from memory instead of re-queried.
 */

import { generateText, DeepSeekError, isLlmAvailable } from "./client.js";
import { llmCache, hashKey } from "./cache.js";
import { fallbackQuest, fallbackDialogue } from "./fallback.js";
import { buildQuestPrompt, type QuestJson } from "./prompts/quest.js";
import { buildDialoguePrompt, type DialogueJson } from "./prompts/dialogue.js";

export { generateText, DeepSeekError, isLlmAvailable } from "./client.js";
export { llmCache, hashKey, LRU } from "./cache.js";
export { fallbackQuest, fallbackDialogue } from "./fallback.js";
export { buildQuestPrompt, buildDialoguePrompt } from "./prompts/index.js";
export type { QuestJson, DialogueJson } from "./prompts/index.js";

interface GenerateMeta {
  /** Which path produced the result. */
  source: "llm" | "cache" | "fallback";
  /** If fallback, why we fell back. */
  reason?: string;
}

/**
 * Parse a JSON string from the model. Strips markdown fences if the model
 * leaked them despite json_mode. Throws DeepSeekError on failure.
 */
function parseJsonField<T>(raw: string, label: string): T {
  let text = raw.trim();
  // Strip leading/trailing ```json ... ``` fences if present.
  if (text.startsWith("```")) {
    text = text.replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/, "").trim();
  }
  try {
    return JSON.parse(text) as T;
  } catch (err) {
    throw new DeepSeekError(
      `Failed to parse ${label} JSON from LLM: ${(err as Error).message}; head=${text.slice(0, 80)}`,
    );
  }
}

/**
 * Generate a quest for the given level + biome.
 *
 * On LLM failure (no key, network error, malformed JSON), returns the static
 * fallback quest for that level — never throws.
 */
export async function generateQuest(
  level: number,
  biome: string,
): Promise<{ quest: QuestJson; meta: GenerateMeta }> {
  const { system, user } = buildQuestPrompt(level, biome);
  // Cache key includes model + level + biome so different inputs don't collide.
  const cacheKey = hashKey(`quest::${level}::${biome}::${system.slice(0, 64)}`);

  const cached = llmCache.get(cacheKey);
  if (cached) {
    return { quest: parseJsonField<QuestJson>(cached, "quest"), meta: { source: "cache" } };
  }

  if (!isLlmAvailable()) {
    return {
      quest: fallbackQuest(level),
      meta: { source: "fallback", reason: "DEEPSEEK_API_KEY not set" },
    };
  }

  try {
    const raw = await generateText(user, {
      systemPrompt: system,
      temperature: 0.8,
      maxTokens: 400,
      jsonMode: true,
    });
    const quest = parseJsonField<QuestJson>(raw, "quest");
    // Only cache successful parses.
    llmCache.set(cacheKey, raw);
    return { quest, meta: { source: "llm" } };
  } catch (err) {
    return {
      quest: fallbackQuest(level),
      meta: {
        source: "fallback",
        reason: err instanceof Error ? err.message : String(err),
      },
    };
  }
}

/**
 * Generate NPC dialogue (greeting / hint / farewell).
 *
 * Same fallback policy as generateQuest: never throws, always returns a
 * DialogueJson object with a `meta.source` indicating where it came from.
 */
export async function generateDialogue(
  npcName: string,
  npcPersonality: string,
  playerContext: string,
): Promise<{ dialogue: DialogueJson; meta: GenerateMeta }> {
  const { system, user } = buildDialoguePrompt(npcName, npcPersonality, playerContext);
  const cacheKey = hashKey(`dialogue::${npcName}::${npcPersonality}::${playerContext}::${system.slice(0, 64)}`);

  const cached = llmCache.get(cacheKey);
  if (cached) {
    return {
      dialogue: parseJsonField<DialogueJson>(cached, "dialogue"),
      meta: { source: "cache" },
    };
  }

  if (!isLlmAvailable()) {
    return {
      dialogue: fallbackDialogue(npcName),
      meta: { source: "fallback", reason: "DEEPSEEK_API_KEY not set" },
    };
  }

  try {
    const raw = await generateText(user, {
      systemPrompt: system,
      temperature: 0.9,
      maxTokens: 300,
      jsonMode: true,
    });
    const dialogue = parseJsonField<DialogueJson>(raw, "dialogue");
    llmCache.set(cacheKey, raw);
    return { dialogue, meta: { source: "llm" } };
  } catch (err) {
    return {
      dialogue: fallbackDialogue(npcName),
      meta: {
        source: "fallback",
        reason: err instanceof Error ? err.message : String(err),
      },
    };
  }
}