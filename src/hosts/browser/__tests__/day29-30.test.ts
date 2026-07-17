/**
 * src/hosts/browser/__tests__/day29-30.test.ts
 */
// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';

describe('Day29-30 源码', () => {
  it('hud 升级自动 writeSave', () => {
    const src = fs.readFileSync(path.resolve(__dirname, '../hud.ts'), 'utf-8');
    expect(src).toMatch(/level_up/);
    expect(src).toMatch(/writeSave/);
    expect(src).toMatch(/exportPlayerSave/);
  });
  it('status-bar 存在 room/tick/fps', () => {
    const src = fs.readFileSync(path.resolve(__dirname, '../status-bar.ts'), 'utf-8');
    expect(src).toMatch(/fps/i);
    expect(src).toMatch(/defaultRoomId/);
    expect(src).toMatch(/getState/);
  });
  it('main 挂载 StatusBar', () => {
    const src = fs.readFileSync(path.resolve(__dirname, '../main.ts'), 'utf-8');
    expect(src).toMatch(/StatusBar/);
    expect(src).toMatch(/statusBar/);
  });
});
