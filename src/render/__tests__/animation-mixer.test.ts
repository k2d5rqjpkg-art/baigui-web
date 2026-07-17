/**
 * src/render/__tests__/animation-mixer.test.ts
 *
 * 借鉴 #5: 骨骼动画测试
 */
import { describe, it, expect } from 'vitest';
import {
  ANIMATION_PRESETS,
  sampleAnimation,
  AnimationMixer,
  AnimationAction,
} from '../animation-mixer';

describe('ANIMATION_PRESETS (借鉴 WoC 12 族生物动画)', () => {
  it('包含 5 种核心动画', () => {
    expect(Object.keys(ANIMATION_PRESETS)).toEqual(
      expect.arrayContaining(['idle', 'walk', 'attack', 'death', 'sit']),
    );
  });

  it('每种动画有 duration + tracks', () => {
    for (const [name, clip] of Object.entries(ANIMATION_PRESETS)) {
      expect(clip.name).toBe(name);
      expect(clip.duration).toBeGreaterThan(0);
      expect(clip.tracks.length).toBeGreaterThan(0);
    }
  });

  it('walk 动画有左右腿 (12 族生物特征)', () => {
    const walk = ANIMATION_PRESETS.walk!;
    const legTracks = walk.tracks.filter((t) => t.boneName.startsWith('leg_'));
    expect(legTracks.length).toBeGreaterThanOrEqual(2);
  });
});

describe('sampleAnimation (帧采样)', () => {
  it('t=0 → 第一帧', () => {
    const idle = ANIMATION_PRESETS.idle!;
    const frames = sampleAnimation(idle, 0);
    expect(frames.length).toBe(idle.tracks.length);
    // body track at t=0 = [0, 0, 0]
    const bodyTrack = frames.find((f) => f.boneName === 'body')!;
    expect(bodyTrack.value).toEqual([0, 0, 0]);
  });

  it('t=duration/2 → 中间帧 (interpolation)', () => {
    const idle = ANIMATION_PRESETS.idle!; // duration=2, body 在 t=1 升到 0.1
    const frames = sampleAnimation(idle, 1.0);
    const bodyTrack = frames.find((f) => f.boneName === 'body')!;
    expect((bodyTrack.value as number[])[1]).toBeCloseTo(0.1, 5);
  });

  it('t > duration → 自动循环', () => {
    const idle = ANIMATION_PRESETS.idle!; // duration=2
    const frames = sampleAnimation(idle, 2.5);
    // 2.5 % 2 = 0.5, 介于 0 和 1 之间, y 应该 ≈ 0.05
    const bodyTrack = frames.find((f) => f.boneName === 'body')!;
    expect((bodyTrack.value as number[])[1]).toBeCloseTo(0.05, 5);
  });

  it('attack 挥砍: t=0.25 → x=0.5', () => {
    const atk = ANIMATION_PRESETS.attack!;
    const frames = sampleAnimation(atk, 0.25);
    const arm = frames.find((f) => f.boneName === 'arm_right')!;
    expect((arm.value as number[])[0]).toBeCloseTo(0.5, 3);
  });

  it('rotation track → value 是 4 元组 (xyzw)', () => {
    const walk = ANIMATION_PRESETS.walk!;
    const frames = sampleAnimation(walk, 0.4);
    const leg = frames.find((f) => f.boneName === 'leg_left')!;
    expect(leg.value.length).toBe(4);
  });

  it('translation track → value 是 3 元组 (xyz)', () => {
    const idle = ANIMATION_PRESETS.idle!;
    const frames = sampleAnimation(idle, 0);
    const body = frames.find((f) => f.boneName === 'body')!;
    expect(body.value.length).toBe(3);
  });
});

describe('AnimationMixer', () => {
  it('register + play + getBoneTransforms', () => {
    const m = new AnimationMixer();
    m.register(ANIMATION_PRESETS.idle!);
    m.play('idle');
    expect(m.getBoneTransforms().length).toBe(0); // 没 update 还是空
    m.update(0.5);
    expect(m.getBoneTransforms().length).toBeGreaterThan(0);
  });

  it('stop 后不再贡献 transforms', () => {
    const m = new AnimationMixer();
    m.register(ANIMATION_PRESETS.idle!);
    m.register(ANIMATION_PRESETS.walk!);
    m.play('idle');
    m.play('walk');
    m.update(0.1);
    const beforeStop = m.getBoneTransforms().length;
    m.stop('walk');
    m.update(0.1);
    const afterStop = m.getBoneTransforms().length;
    expect(afterStop).toBeLessThan(beforeStop);
  });

  it('update(dt) 时间累加', () => {
    const m = new AnimationMixer();
    m.register(ANIMATION_PRESETS.idle!);
    m.play('idle');
    m.update(1.0);
    const t1 = m.getBoneTransforms().find((t) => t.boneName === 'body')!;
    m.update(1.0);
    const t2 = m.getBoneTransforms().find((t) => t.boneName === 'body')!;
    // 1.0 + 1.0 = 2.0 → 循环回 0 → [0,0,0]
    expect(t1.value).not.toEqual(t2.value);
  });

  it('未注册动画 → play 抛错', () => {
    const m = new AnimationMixer();
    expect(() => m.play('unknown')).toThrow();
  });

  it('blendTo 不崩', () => {
    const m = new AnimationMixer();
    m.register(ANIMATION_PRESETS.attack!);
    m.register(ANIMATION_PRESETS.idle!);
    m.play('attack', false);
    expect(() => m.blendTo('idle', 0.5)).not.toThrow();
  });
});

describe('AnimationAction', () => {
  it('play/stop 状态切换', () => {
    const a = new AnimationAction(ANIMATION_PRESETS.idle!);
    expect(a.isPlaying()).toBe(false);
    a.play();
    expect(a.isPlaying()).toBe(true);
    a.stop();
    expect(a.isPlaying()).toBe(false);
  });

  it('play(loop=false) 设置单次', () => {
    const a = new AnimationAction(ANIMATION_PRESETS.attack!);
    a.play(false);
    expect(a.loop).toBe(false);
  });
});