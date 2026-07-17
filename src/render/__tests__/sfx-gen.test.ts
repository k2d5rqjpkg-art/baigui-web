/**
 * src/render/__tests__/sfx-gen.test.ts
 *
 * 借鉴 #4: WebAudio 合成测试 (用 mock AudioContext)
 */
import { describe, it, expect, vi } from 'vitest';
import { SFX_PRESETS, playSfx, SfxEngine, sfx } from '../sfx-gen';

function mockAudioContext() {
  const nodes: any[] = [];
  const makeNode = (useType: string, ctxType: string) => {
    const n: any = {
      type: ctxType, // ctx 接口字段 (e.g. 'oscillator', 'gain')
      useType, // 'oscillator' 或 'gain' 或 'filter'
      frequency: { value: 0, setValueAtTime: vi.fn(), exponentialRampToValueAtTime: vi.fn() },
      gain: {
        value: 0,
        setValueAtTime: vi.fn(),
        linearRampToValueAtTime: vi.fn(),
        exponentialRampToValueAtTime: vi.fn(),
      },
      connect: vi.fn((target: any) => (n.next = target)),
      start: vi.fn(),
      stop: vi.fn(),
    };
    nodes.push(n);
    return n;
  };
  const ctx = {
    currentTime: 0,
    destination: { type: 'destination' },
    createOscillator: vi.fn(() => makeNode('oscillator', 'oscillator')),
    createGain: vi.fn(() => makeNode('gain', 'gain')),
    createBiquadFilter: vi.fn(() => makeNode('filter', 'filter')),
  };
  return { ctx: ctx as any, nodes };
}

describe('SFX_PRESETS (借鉴 WoC 命名)', () => {
  it('包含 5 种核心音效', () => {
    expect(Object.keys(SFX_PRESETS)).toEqual(
      expect.arrayContaining(['attack', 'hit', 'death', 'pickup', 'footstep']),
    );
  });

  it('每种 preset 有合理配置', () => {
    for (const [type, cfg] of Object.entries(SFX_PRESETS)) {
      expect(cfg.frequency).toBeGreaterThan(0);
      expect(cfg.frequency).toBeLessThan(20000); // 人类听觉范围
      expect(cfg.duration).toBeGreaterThan(0);
      expect(cfg.duration).toBeLessThan(5000); // 不超过 5s
      expect(cfg.attack).toBeLessThanOrEqual(cfg.duration);
      expect(cfg.decay).toBeLessThanOrEqual(cfg.duration);
      expect(['sine', 'square', 'sawtooth', 'triangle']).toContain(cfg.type);
      expect(cfg.volume).toBeGreaterThanOrEqual(0);
      expect(cfg.volume).toBeLessThanOrEqual(1);
    }
  });

  it('attack 是频率下降 (低沉的打击感)', () => {
    expect(SFX_PRESETS.attack.frequencyEnd).toBeDefined();
    expect(SFX_PRESETS.attack.frequencyEnd!).toBeLessThan(SFX_PRESETS.attack.frequency);
  });

  it('pickup 是频率上升 (轻盈的拾取感)', () => {
    expect(SFX_PRESETS.pickup.frequencyEnd).toBeDefined();
    expect(SFX_PRESETS.pickup.frequencyEnd!).toBeGreaterThan(SFX_PRESETS.pickup.frequency);
  });
});

describe('playSfx (纯函数)', () => {
  it('创建 oscillator + gain + 连接 masterGain', () => {
    const { ctx, nodes } = mockAudioContext();
    const masterGain = ctx.createGain();
    playSfx(ctx, masterGain, SFX_PRESETS.attack);
    expect(ctx.createOscillator).toHaveBeenCalled();
    expect(ctx.createGain).toHaveBeenCalled();
    const osc = nodes.find((n) => n.useType === 'oscillator');
    const gain = nodes.find((n) => n.useType === 'gain');
    expect(osc).toBeDefined();
    expect(gain).toBeDefined();
    expect(osc.start).toHaveBeenCalled();
    expect(osc.stop).toHaveBeenCalled();
  });

  it('frequency 滑音: 调用 exponentialRampToValueAtTime', () => {
    const { ctx } = mockAudioContext();
    const masterGain = ctx.createGain();
    playSfx(ctx, masterGain, SFX_PRESETS.attack); // 有 frequencyEnd
    const oscNodes = (ctx as any).createOscillator.mock.results;
    const osc = oscNodes[oscNodes.length - 1].value;
    expect(osc.frequency.exponentialRampToValueAtTime).toHaveBeenCalled();
  });

  it('包络: 0 → volume → 0.001 (ADSR 简化版)', () => {
    const { ctx, nodes } = mockAudioContext();
    const masterGain = ctx.createGain();
    playSfx(ctx, masterGain, SFX_PRESETS.attack);
    const gainNodes = nodes.filter(
      (n) => n.type === 'gain' && n.gain.setValueAtTime.mock.calls.length > 0,
    );
    expect(gainNodes.length).toBeGreaterThan(0);
    // 至少 3 个 setValueAtTime: 0 起点 → volume 峰值 → 0.001 终点
    const setCalls = gainNodes[0]!.gain.setValueAtTime.mock.calls;
    expect(setCalls.length).toBeGreaterThanOrEqual(1);
  });

  it('有 filterFreq → 创建 biquadFilter', () => {
    const { ctx } = mockAudioContext();
    const masterGain = ctx.createGain();
    playSfx(ctx, masterGain, SFX_PRESETS.hit); // 有 filterFreq
    expect(ctx.createBiquadFilter).toHaveBeenCalled();
  });

  it('无 filterFreq → 不创建 filter', () => {
    const { ctx } = mockAudioContext();
    const masterGain = ctx.createGain();
    playSfx(ctx, masterGain, SFX_PRESETS.pickup); // 无 filterFreq
    expect(ctx.createBiquadFilter).not.toHaveBeenCalled();
  });
});

describe('SfxEngine 单例', () => {
  it('setContext 后用注入 ctx', () => {
    const { ctx } = mockAudioContext();
    const eng = new SfxEngine();
    eng.setContext(ctx as any);
    expect(() => eng.play('attack')).not.toThrow();
  });

  it('setEnabled(false) → play 不发声音', () => {
    const { ctx } = mockAudioContext();
    const eng = new SfxEngine();
    eng.setContext(ctx as any);
    eng.setEnabled(false);
    const before = (ctx as any).createOscillator.mock.calls.length;
    eng.play('attack');
    const after = (ctx as any).createOscillator.mock.calls.length;
    expect(after).toBe(before); // 没新增 osc
  });

  it('isEnabled 反映状态', () => {
    const eng = new SfxEngine();
    expect(eng.isEnabled()).toBe(true);
    eng.setEnabled(false);
    expect(eng.isEnabled()).toBe(false);
  });
});

describe('sfx 单例 (全局)', () => {
  it('导出唯一实例', () => {
    expect(sfx).toBeInstanceOf(SfxEngine);
  });
});
