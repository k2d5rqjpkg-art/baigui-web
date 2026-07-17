/**
 * src/hosts/browser/__tests__/room-query.test.ts
 * Day20: defaultRoomId 解析
 */
// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach } from 'vitest';

// 动态 import 以便 mock location 后加载? 直接复制逻辑测太脆, 用 re-import
// 改为测函数实现: 从 network 导入

describe('Day20: defaultRoomId', () => {
  const original = window.location;

  afterEach(() => {
    // jsdom 不允许直接重写 location, 用 history
  });

  it('无参数 → room-0', async () => {
    const { defaultRoomId } = await import('../network');
    // 默认 jsdom location 无 room 参数
    expect(defaultRoomId()).toBe('room-0');
  });

  it('?room=lobby_1 → lobby_1', async () => {
    // 通过 mock URLSearchParams 路径: 改 history
    window.history.pushState({}, '', '?room=lobby_1');
    // re-evaluate: function reads live location
    const { defaultRoomId } = await import('../network');
    expect(defaultRoomId()).toBe('lobby_1');
    window.history.pushState({}, '', '/');
  });

  it('非法 room 回落 room-0', async () => {
    window.history.pushState({}, '', '?room=../etc');
    const { defaultRoomId } = await import('../network');
    expect(defaultRoomId()).toBe('room-0');
    window.history.pushState({}, '', '/');
  });
});
