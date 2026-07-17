/**
 * src/core/llm/advisor-types.ts
 *
 * v1.1: AI Advisor 类型定义 (独立文件, 避免循环 import)
 */
import type { Action, EntityId } from '../sim/index.js';

export type AdvisorGoal = 'attack' | 'retreat' | 'heal' | 'explore' | 'quest' | 'talk' | 'idle';

export interface AdvisorSuggestion {
  goal: AdvisorGoal;
  nextAction: Action;
  reason: string;
  source: 'llm' | 'cache' | 'fallback';
}

/** LLM 输出的原始 JSON schema (parse 后映射到 AdvisorSuggestion) */
export interface AdvisorRawResponse {
  goal: AdvisorGoal;
  reason: string;
  nextAction:
    | { type: 'move'; dx: number; dy: number }
    | { type: 'attack'; targetId: string }
    | { type: 'idle' };
}
