/**
 * src/hosts/browser/__tests__/day25-28.test.ts
 * Day25-28: 读档回调 / 复活 / 静音 / 设置面板源码
 */
// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import { sfx } from '../../../render/sfx-gen';

describe('Day27: sfx 静音', () => {
  it('setEnabled false 后 isEnabled false', () => {
    sfx.setEnabled(false);
    expect(sfx.isEnabled()).toBe(false);
    sfx.setEnabled(true);
    expect(sfx.isEnabled()).toBe(true);
  });
});

describe('Day25-28 源码集成', () => {
  it('save-load 含 onAfterLoad', () => {
    const src = fs.readFileSync(path.resolve(__dirname, '../save-load.ts'), 'utf-8');
    expect(src).toMatch(/onAfterLoad/);
  });
  it('game 含 respawnPlayer', () => {
    const src = fs.readFileSync(path.resolve(__dirname, '../game.ts'), 'utf-8');
    expect(src).toMatch(/respawnPlayer/);
  });
  it('hud 含复活按钮', () => {
    const src = fs.readFileSync(path.resolve(__dirname, '../hud.ts'), 'utf-8');
    expect(src).toMatch(/__go_respawn/);
    expect(src).toMatch(/respawnPlayer/);
  });
  it('settings-panel Esc + 静音', () => {
    const src = fs.readFileSync(path.resolve(__dirname, '../settings-panel.ts'), 'utf-8');
    expect(src).toMatch(/Escape/);
    expect(src).toMatch(/setEnabled/);
    expect(src).toMatch(/baigui_sfx_muted/);
  });
  it('main 挂载 SettingsPanel + 读档刷 HUD', () => {
    const src = fs.readFileSync(path.resolve(__dirname, '../main.ts'), 'utf-8');
    expect(src).toMatch(/SettingsPanel/);
    expect(src).toMatch(/this\.hud\.refresh/);
  });
});
