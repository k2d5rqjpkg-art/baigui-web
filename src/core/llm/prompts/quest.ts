/**
 * Quest-generation prompt for Day1 procedural quests.
 *
 * The model returns a JSON object with title / description / objective / reward.
 * Few-shot examples pin the schema so DeepSeek's chat completion can be coerced
 * into valid JSON via response_format=json_object (configured by the caller).
 */

export interface QuestJson {
  title: string;
  description: string;
  objective: string;
  reward: string;
}

export function buildQuestPrompt(level: number, biome: string): { system: string; user: string } {
  const system = `You are the Quest Designer for a dark-fantasy exploration game called 百鬼夜行 (Hundred Night Parade).

You produce short, atmospheric side-quests that fit a given player level and biome.
Always reply with a SINGLE JSON object and NOTHING ELSE — no prose, no markdown fence.

Schema (strict):
{
  "title": string,            // ≤ 24 chars, evocative, no emoji
  "description": string,      // 1-2 sentences, sets the mood, mentions biome
  "objective": string,        // 1 sentence, an actionable goal a player can complete
  "reward": string            // short, e.g. "80 spirit jade" / "a frayed talisman"
}

Constraints:
- Difficulty must scale with level (1 = trivial fetch, 5 = elite hunt, multi-step).
- Biome vocabulary: forest → mist, fox-spirit, paper charm;
  swamp → lantern, will-o-wisp, drowned shrine;
  mountain → shrine, yōkai, frozen path;
  village → rumor, oni, missing person;
  ruins → seal, ghost, broken ward.
- Language: English. Tone: eerie, sparse, never goofy.

=== FEW-SHOT EXAMPLES ===

User: { "level": 1, "biome": "forest" }
Assistant: {
  "title": "The Fox's Lost Bell",
  "description": "A paper charm nailed to a cedar tree trembles faintly; the bell it once held is missing.",
  "objective": "Find the small bronze bell hidden somewhere within 200 paces of the marked tree.",
  "reward": "30 spirit jade, 1 fox-tail charm"
}

User: { "level": 3, "biome": "swamp" }
Assistant: {
  "title": "Lanterns Across the Mire",
  "description": "Five paper lanterns drift across the swamp at dusk; the villagers claim they lead travelers astray on purpose.",
  "objective": "Light the shrine at the mire's centre before the sixth lantern surfaces.",
  "reward": "120 spirit jade, a watertight talisman"
}

User: { "level": 5, "biome": "mountain" }
Assistant: {
  "title": "The Frozen Threshold",
  "description": "An old yōkai-ward at the mountain pass has cracked; the ice it held back begins to whisper.",
  "objective": "Re-seal the threshold with three shards of black ice gathered from the upper ridge.",
  "reward": "300 spirit jade, one sealed yōkai fang"
}

=== END EXAMPLES ===
Now produce ONE quest for the user input below. Output JSON only.`;

  const user = JSON.stringify({ level, biome });
  return { system, user };
}
