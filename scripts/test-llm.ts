/**
 * Smoke test for the LLM layer.
 *
 * Run with:  npx tsx scripts/test-llm.ts
 *
 * Behaviour:
 *   - With DEEPSEEK_API_KEY set: hits the real API, prints the quest JSON
 *     and a "[LLM MODE]" tag. Second call hits the in-memory cache.
 *   - Without DEEPSEEK_API_KEY: prints "[FALLBACK MODE]" and the static quest.
 *   - On any LLM error mid-flight, also falls back and tags the reason.
 *
 * Exits 0 on success (including fallback), 1 only on programmer error.
 */

import {
  generateQuest,
  generateDialogue,
  isLlmAvailable,
  fallbackQuest,
  fallbackDialogue,
} from '../src/core/llm/index.js';

function banner(tag: string): void {
  const bar = '═'.repeat(60);
  console.log(`\n${bar}\n  ${tag}\n${bar}`);
}

async function main(): Promise<void> {
  const llmAvailable = isLlmAvailable();
  banner(
    llmAvailable
      ? '[LLM MODE] DEEPSEEK_API_KEY detected'
      : '[FALLBACK MODE] no DEEPSEEK_API_KEY — using static tables',
  );

  // ─── Quest test ───────────────────────────────────────────────
  console.log("\n→ generateQuest(3, 'forest')  [first call]");
  const r1 = await generateQuest(3, 'forest');
  console.log(JSON.stringify(r1.quest, null, 2));
  console.log('source:', r1.meta.source, r1.meta.reason ? `(${r1.meta.reason})` : '');

  console.log("\n→ generateQuest(3, 'forest')  [second call, should be cache hit]");
  const r2 = await generateQuest(3, 'forest');
  console.log('source:', r2.meta.source);

  // ─── Dialogue test ────────────────────────────────────────────
  console.log(
    "\n→ generateDialogue('Old Hag Kiku', 'cranky herbalist', 'first visit to swamp shrine')",
  );
  const d = await generateDialogue(
    'Old Hag Kiku',
    'cranky herbalist who speaks in proverbs',
    'first visit to the swamp shrine at dusk',
  );
  console.log(JSON.stringify(d.dialogue, null, 2));
  console.log('source:', d.meta.source, d.meta.reason ? `(${d.meta.reason})` : '');

  // ─── Pure-fallback spot checks ────────────────────────────────
  banner('[FALLBACK TABLES] static content snapshot');
  for (const lvl of [1, 2, 3, 4, 5] as const) {
    const q = fallbackQuest(lvl);
    console.log(`L${lvl}: ${q.title} — ${q.objective}`);
  }
  for (const name of [
    'Old Hag Kiku',
    'Lantern-Bearer Shō',
    'Driftwood Taro',
    'Unknown Wanderer',
  ] as const) {
    const dlg = fallbackDialogue(name);
    console.log(`\n${name}:`);
    console.log(`  G: ${dlg.greeting}`);
    console.log(`  H: ${dlg.hint}`);
    console.log(`  F: ${dlg.farewell}`);
  }

  banner('DONE');
}

main().catch((err) => {
  console.error('test-llm crashed:', err);
  process.exit(1);
});
