#!/usr/bin/env node
/**
 * scripts/state-dump.mjs
 *
 * Day47: sim state inspector CLI
 *
 * 用法:
 *   node scripts/state-dump.mjs                  # dump default GameRoom seed=1
 *   node scripts/state-dump.mjs 42               # seed=42
 *   node scripts/state-dump.mjs 42 e_m_1        # seed=42, 单 entity 详情
 */
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');

const args = process.argv.slice(2);
const seed = args[0] ?? '1';
const entityId = args[1] ?? '';

const args_ = ['dump', seed];
if (entityId) args_.push(entityId);

// 直接调用 ts 入口 (避免 npx 中间层)
const r = spawnSync(
  process.execPath,
  ['--import', 'tsx', 'scripts/state-inspect.ts', ...args_],
  { cwd: root, encoding: 'utf8', stdio: ['inherit', 'inherit', 'inherit'] },
);
process.exit(r.status ?? 1);