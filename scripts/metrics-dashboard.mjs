#!/usr/bin/env node
/**
 * scripts/metrics-dashboard.mjs
 *
 * Day54: 生成 metrics 仪表板 (从 git log + bench JSON 汇总)
 */
import { execSync } from 'node:child_process';
import { readFileSync, writeFileSync, existsSync, readdirSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');
const out = join(root, 'METRICS.md');

function sh(cmd) {
  return execSync(cmd, { cwd: root, encoding: 'utf8' }).trim();
}

const log = sh(
  'git log --pretty=format:"%h|%ai|%s" main 2>/dev/null || git log --pretty=format:"%h|%ai|%s" -50',
);
const lines = log.split('\n').filter(Boolean);

let byDay = new Map();
for (const ln of lines) {
  const [hash, date, ...rest] = ln.split('|');
  const msg = rest.join('|');
  const m = msg.match(/^(Day\d+(-\d+)?):/);
  if (m) {
    const tag = m[1];
    if (!byDay.has(tag)) byDay.set(tag, []);
    byDay.get(tag).push({ hash, date, msg });
  }
}

// bench 数据
const benchDir = join(root, 'bench-data');
let latestBench = null;
if (existsSync(benchDir)) {
  const files = readdirSync(benchDir)
    .filter((f) => f.endsWith('.json'))
    .sort()
    .reverse();
  if (files[0]) {
    try {
      latestBench = JSON.parse(readFileSync(join(benchDir, files[0]), 'utf8'));
    } catch {
      /* ignore */
    }
  }
}

// 生成 markdown
let md = `# Project Metrics Dashboard

> 自动生成 · 最近 commit + bench 数据

## 📊 概况

| 指标 | 数值 |
|---|---|
| 总 commits | ${lines.length} |
| 有 Day 标签的 commits | ${[...byDay.values()].reduce((s, v) => s + v.length, 0)} |
| 开发周期 | ${byDay.size} 个 Day 组 (Day1-52+) |

## 🏃 性能基准 (sim ticks/s)

`;

if (latestBench?.scenarios?.length) {
  md += '| 场景 | 步数 | ms | ticks/s | μs/tick |\n|---|---|---|---|---|\n';
  for (const s of latestBench.scenarios) {
    md += `| ${s.name} | ${s.N} | ${s.ms} | ${s.ticksPerSec} | ${s.perTickUs} |\n`;
  }
  md += `\n_Generated: ${latestBench.timestamp}_\n`;
} else {
  md += '_未跑过 bench (跑 \`npm run bench:collect\` 收集)_\n';
}

md += '\n## 📅 Day 进度\n\n| Day | Commits | 主要改动 |\n|---|---|---|\n';
const dayKeys = [...byDay.keys()];
for (const k of dayKeys.slice(0, 60)) {
  const items = byDay.get(k);
  const first = items[0];
  md += `| ${k} | ${items.length} | ${first.msg.slice(0, 60)} |\n`;
}

md += '\n## 📁 仓库统计\n\n';
try {
  const cloc = sh('git ls-files | wc -l').trim();
  md += `- 跟踪文件数: ${cloc}\n`;
} catch {
  /* ignore */
}

writeFileSync(out, md);
console.log(`✅ Metrics dashboard: ${out}`);
