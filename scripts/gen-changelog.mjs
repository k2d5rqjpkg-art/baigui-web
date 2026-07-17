#!/usr/bin/env node
/**
 * scripts/gen-changelog.mjs
 *
 * Day46: 从 git log 自动生成 CHANGELOG.md
 * 按 "Day" / "v" 前缀分组, 提取 commit 列表
 */
import { execSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');

function sh(cmd) {
  return execSync(cmd, { cwd: root, encoding: 'utf8' }).trim();
}

const log = sh('git log --pretty=format:"%h|%s" -50');
const lines = log.split('\n').filter(Boolean);

const groups = new Map();
for (const ln of lines) {
  const [hash, ...rest] = ln.split('|');
  const msg = rest.join('|');
  // 匹配 "Day N:" / "vN.M" / 其他
  const m = msg.match(/^(Day\d+(-\d+)?|v\d+\.\d+):\s*(.+)$/);
  if (m) {
    const tag = m[1];
    const body = m[3].trim();
    if (!groups.has(tag)) groups.set(tag, []);
    groups.get(tag).push({ hash, body });
  }
}

let out = `# Changelog\n\nAll notable changes are auto-generated from git history.\n\n`;
const tags = [...groups.keys()];
for (const tag of tags) {
  out += `## ${tag}\n\n`;
  for (const { hash, body } of groups.get(tag)) {
    out += `- \`${hash}\` ${body}\n`;
  }
  out += '\n';
}

const dest = join(root, 'CHANGELOG.md');
writeFileSync(dest, out);
console.log(
  `✅ Changelog written: ${dest} (${groups.size} groups, ${groups && [...groups.values()].reduce((s, v) => s + v.length, 0)} commits)`,
);
