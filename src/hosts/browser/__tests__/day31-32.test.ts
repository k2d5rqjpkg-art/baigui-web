/**
 * src/hosts/browser/__tests__/day31-32.test.ts
 */
// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';

describe('Day31-32', () => {
  it('main 启动 auto readSave', () => {
    const src = fs.readFileSync(path.resolve(__dirname, '../main.ts'), 'utf-8');
    expect(src).toMatch(/readSave/);
    expect(src).toMatch(/applySaveToGame/);
    expect(src).toMatch(/auto-loaded save/);
  });
  it('level_up 日志含自动存档', () => {
    const src = fs.readFileSync(path.resolve(__dirname, '../hud.ts'), 'utf-8');
    expect(src).toMatch(/已自动存档/);
  });
});
