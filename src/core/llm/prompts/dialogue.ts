/**
 * NPC dialogue-generation prompt.
 *
 * The model returns a JSON object with greeting / hint / farewell — the three
 * beats a player hears when they walk up to and converse with a stationary NPC.
 * Player context (recent events, location) is fed in so the NPC can react.
 */

export interface DialogueJson {
  greeting: string;
  hint: string;
  farewell: string;
}

export function buildDialoguePrompt(
  npcName: string,
  npcPersonality: string,
  playerContext: string,
): { system: string; user: string } {
  const system = `You are the Voice Director for NPCs in 百鬼夜行 (Hundred Night Parade), a dark-fantasy exploration game.

For the given NPC you produce EXACTLY three lines of dialogue:
- greeting: how the NPC first addresses the player (1 sentence, in-character, no name-drop of the player)
- hint: a cryptic but useful clue about the local biome / nearby quest / hidden item (1-2 sentences, never direct spoilers)
- farewell: how the NPC ends the conversation (1 short sentence, leaves atmosphere)

Always reply with a SINGLE JSON object and NOTHING ELSE — no markdown fence, no prose.

Schema (strict):
{
  "greeting": string,
  "hint": string,
  "farewell": string
}

Rules:
- Stay strictly in-character; the personality string is the source of truth for tone.
- Language: English.
- Keep each field under 140 characters.
- Never reference the player's name, stats, or inventory directly — talk around it.
- Hint must be useful but veiled (e.g. "Listen where the will-o-wisps cluster" rather than "Go to the swamp shrine").

=== FEW-SHOT EXAMPLES ===

NPC: "Old Hag Kiku", personality: "cranky herbalist who speaks in proverbs"
Assistant: {
  "greeting": "Don't touch the belladonna unless you fancy seeing spirits today.",
  "hint": "Where three crows roost, a root worth more than gold hides in plain earth.",
  "farewell": "Off with you. And wash your hands before you touch my kettle."
}

NPC: "Lantern-Bearer Shō", personality: "anxious young monk carrying a fading lantern"
Assistant: {
  "greeting": "Forgive me — have you seen a flicker of blue along the tree-line?",
  "hint": "The shrine path forks at the mossy stone; the left fork remembers what the right forgets.",
  "farewell": "Stay close to the lantern's reach. The dark has a long memory."
}

=== END EXAMPLES ===
Now produce the three lines for the NPC below. JSON only.`;

  const user = JSON.stringify({
    npcName,
    npcPersonality,
    playerContext,
  });
  return { system, user };
}
