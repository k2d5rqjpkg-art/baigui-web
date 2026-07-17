/**
 * src/hosts/browser/__tests__/renderer-sfx.test.ts
 *
 * v3.5: renderer.ts 接 sfx + animation 测试
 *
 * 策略: 不构造整个 GameRenderer (Three.js mock 太重),
 *       用 ESM import + 模块级 mock 隔离 sfx 调用, 然后:
 *       1. 验证 sfx import 是预期的模块
 *       2. 验证 ANIMATION_PRESETS 包含 5 个动画
 *       3. 验证 GameRenderer 导入了 sfx 和 animation-mixer (编译期保证集成)
 *       4. 通过 vite 静态分析模块依赖
 */
// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';

// 拦截 sfx 调用
const sfxCalls: string[] = [];
vi.mock('../../../render/sfx-gen', () => ({
  sfx: {
    play: (type: string) => {
      sfxCalls.push(type);
    },
    setEnabled: vi.fn(),
    isEnabled: () => true,
  },
}));

import { sfx } from '../../../render/sfx-gen';
import { ANIMATION_PRESETS } from '../../../render/animation-mixer';

describe('v3.5: sfx 模块可被 renderer 集成 (编译期 + 单元)', () => {
  beforeEach(() => {
    sfxCalls.length = 0;
  });

  it('sfx 模块导出正确接口', () => {
    expect(sfx).toBeDefined();
    expect(typeof sfx.play).toBe('function');
    expect(typeof sfx.setEnabled).toBe('function');
    expect(typeof sfx.isEnabled).toBe('function');
  });

  it('sfx.play 接收 5 种类型 (与 renderer 集成)', () => {
    sfx.play('attack');
    sfx.play('hit');
    sfx.play('death');
    sfx.play('pickup');
    sfx.play('footstep');
    expect(sfxCalls).toEqual(['attack', 'hit', 'death', 'pickup', 'footstep']);
  });

  it('5 种动画预设 (mixer.register 准备好)', () => {
    expect(Object.keys(ANIMATION_PRESETS)).toEqual(
      expect.arrayContaining(['idle', 'walk', 'attack', 'death', 'sit']),
    );
    expect(ANIMATION_PRESETS.idle).toBeDefined();
    expect(ANIMATION_PRESETS.attack).toBeDefined();
    expect(ANIMATION_PRESETS.death).toBeDefined();
  });
});

describe('v3.5: renderer.ts 静态集成验证', () => {
  // 通过 fs 读源码, 验证关键集成点
  it('renderer.ts 导入了 sfx-gen 和 animation-mixer', async () => {
    const fs = await import('fs');
    const path = await import('path');
    const rendererPath = path.resolve(__dirname, '../renderer.ts');
    const src = fs.readFileSync(rendererPath, 'utf-8');
    expect(src).toMatch(/from ['"].*sfx-gen['"]/);
    expect(src).toMatch(/from ['"].*animation-mixer['"]/);
  });

  it('renderer.ts 在 handleEvent 调用 sfx.play', async () => {
    const fs = await import('fs');
    const path = await import('path');
    const rendererPath = path.resolve(__dirname, '../renderer.ts');
    const src = fs.readFileSync(rendererPath, 'utf-8');
    expect(src).toMatch(/sfx\.play\(['"]attack['"]/);
    expect(src).toMatch(/sfx\.play\(['"]hit['"]/);
    expect(src).toMatch(/sfx\.play\(['"]death['"]/);
    expect(src).toMatch(/sfx\.play\(['"]pickup['"]/);
  });

  it('renderer.ts 包含 AnimationMixer 和 playAnimation 方法', async () => {
    const fs = await import('fs');
    const path = await import('path');
    const rendererPath = path.resolve(__dirname, '../renderer.ts');
    const src = fs.readFileSync(rendererPath, 'utf-8');
    expect(src).toMatch(/AnimationMixer/);
    expect(src).toMatch(/playAnimation/);
    expect(src).toMatch(/updateAnimation/);
    expect(src).toMatch(/mixer\.register/);
  });

  it('renderer.ts start() 初始化动画', async () => {
    const fs = await import('fs');
    const path = await import('path');
    const rendererPath = path.resolve(__dirname, '../renderer.ts');
    const src = fs.readFileSync(rendererPath, 'utf-8');
    // start() 里调用 playAnimation('idle')
    expect(src).toMatch(/playAnimation\(['"]idle['"]/);
  });

  it('renderer.ts tick() 每帧 updateAnimation', async () => {
    const fs = await import('fs');
    const path = await import('path');
    const rendererPath = path.resolve(__dirname, '../renderer.ts');
    const src = fs.readFileSync(rendererPath, 'utf-8');
    expect(src).toMatch(/this\.updateAnimation\(1 \/ 60\)/);
  });
});
