/**
 * Barrel export for prompt builders.
 * Re-exports types and functions so callers can import from a single path.
 */

export { buildQuestPrompt, type QuestJson } from './quest.js';
export { buildDialoguePrompt, type DialogueJson } from './dialogue.js';
