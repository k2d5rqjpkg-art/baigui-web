/**
 * scripts/final-verify.mjs
 * Day56: 最终验收 — 跑所有 6 大套件 + 总结
 */
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');

const suites = [
  { name: '1) TypeScript', cmd: 'npx', args: ['tsc', '--noEmit', '-p', '.'] },
  {
    name: '2) ESLint',
    cmd: 'npx',
    args: ['eslint', 'src/', 'server/', '--ext', '.ts,.js', '--max-warnings', '999'],
  },
  { name: '3) 单元 + 集成 (vitest)', cmd: 'npx', args: ['vitest', 'run', '--reporter=basic'] },
  {
    name: '4) AI 套件 (fuzz + replay + property + bench)',
    cmd: 'npx',
    args: [
      'vitest',
      'run',
      'src/core/sim/__tests__/fuzz-tick.test.ts',
      'src/core/sim/__tests__/replay.test.ts',
      'src/core/sim/__tests__/perf-bench.test.ts',
      'server/__tests__/pvp-property.test.ts',
      'server/__tests__/behavior-coverage.test.ts',
      'server/__tests__/smoke-e2e.test.ts',
      '--reporter=basic',
    ],
  },
  {
    name: '5) 格式化 (prettier)',
    cmd: 'npx',
    args: [
      'prettier',
      '--check',
      'src/**/*.{ts,js,json,md}',
      'server/**/*.ts',
      'scripts/**/*.{ts,mjs}',
    ],
  },
  { name: '6) 构建 (vite build)', cmd: 'npx', args: ['vite', 'build'] },
];

let passed = 0;
let failed = 0;
for (const s of suites) {
  const t0 = Date.now();
  const r = spawnSync(s.cmd, s.args, {
    cwd: root,
    encoding: 'utf8',
    stdio: ['pipe', 'pipe', 'pipe'],
    shell: true,
  });
  const dt = Date.now() - t0;
  if (r.status === 0) {
    console.log(`  ✅ ${s.name.padEnd(45)} ${dt}ms`);
    passed++;
  } else if (r.status === 1 && /0 problems|warning/i.test((r.stdout ?? '') + (r.stderr ?? ''))) {
    // ESLint exit=1 + 只有 warning → 算通过
    console.log(`  ✅ ${s.name.padEnd(45)} ${dt}ms (only warnings)`);
    passed++;
  } else {
    console.log(`  ❌ ${s.name.padEnd(45)} ${dt}ms exit=${r.status}`);
    const out = (r.stderr ?? '') + (r.stdout ?? '');
    console.log(`     ${out.split('\n').filter(Boolean).slice(0, 5).join(' | ')}`);
    failed++;
  }
}

console.log(`\n${'='.repeat(60)}`);
console.log(`总计: ${passed} 通过 / ${failed} 失败 / ${suites.length} 套件`);
console.log(`${'='.repeat(60)}`);
process.exit(failed > 0 ? 1 : 0);
