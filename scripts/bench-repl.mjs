#!/usr/bin/env node
/**
 * scripts/bench-repl.mjs
 *
 * Day47: benchmark REPL — 跑 N 步 sim 计时
 */
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');

const N = process.argv[2] ?? '1000';
const r = spawnSync(process.execPath, ['--import', 'tsx', 'scripts/state-inspect.ts', 'bench', N], {
  cwd: root,
  encoding: 'utf8',
  stdio: ['inherit', 'inherit', 'inherit'],
});
process.exit(r.status ?? 1);
