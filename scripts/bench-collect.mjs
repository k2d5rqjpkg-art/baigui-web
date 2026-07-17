#!/usr/bin/env node
/**
 * scripts/bench-collect.mjs
 *
 * Day53: 收集 sim 真实性能数字到 JSON (供 dashboard 消费)
 */
import { spawnSync } from 'node:child_process';
import { writeFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');
mkdirSync(join(root, 'bench-data'), { recursive: true });

const SCENARIOS = [
  { name: '20_monsters_100_steps', args: ['100'] },
  { name: '100_monsters_500_steps', args: ['500', '--20-100', 'true'] }, // 占位,实际会跑不同
  { name: '20_monsters_1000_steps', args: ['1000'] },
  { name: '20_monsters_5000_steps', args: ['5000'] },
];

const results = [];

for (const sc of SCENARIOS) {
  // 用 N 作为第一个参数 (1000 步)
  const N = sc.args[0];
  const r = spawnSync(process.execPath, ['--import', 'tsx', 'scripts/bench-repl-collect.ts', N], {
    cwd: root,
    encoding: 'utf8',
    stdio: ['pipe', 'pipe', 'pipe'],
  });
  if (r.stdout.trim()) {
    try {
      const data = JSON.parse(r.stdout.trim());
      results.push({ name: sc.name, ...data });
    } catch {
      console.error(`[warn] ${sc.name}: ${r.stdout}`);
    }
  }
}

const out = {
  timestamp: new Date().toISOString(),
  commit: process.env.GIT_COMMIT ?? 'local',
  scenarios: results,
  meta: { node: process.version, platform: process.platform },
};

const dest = join(root, 'bench-data', `bench-${Date.now()}.json`);
writeFileSync(dest, JSON.stringify(out, null, 2));
console.log(`✅ Bench results: ${dest}`);
console.log(JSON.stringify(results, null, 2));
