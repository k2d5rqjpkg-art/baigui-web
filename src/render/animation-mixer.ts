/**
 * src/render/animation-mixer.ts
 *
 * 借鉴 #5: 骨骼动画 (GLTFAnimationMixer 简化版)
 *
 * WoC: Sonnet 玩家 + Opus 反射 → 我们 AI Advisor 1Hz
 * WoC: 12 生物族 walk/attack/cast/sit/death 骨骼动画
 * 我们: AnimationMixer + AnimationClip + Skeleton (简化版)
 *
 * 设计:
 *   - AnimationMixer: 管理多个 AnimationAction
 *   - AnimationClip: { duration, tracks[] }
 *   - SkeletonTrack: { boneName, times[], values[] } (position/rotation/scale)
 *   - play(name) / stop(name) / mix(name, duration) / update(dt)
 *
 * 不依赖 three.js (纯函数动画数据), 由 renderer 在 update 时采样
 */

export interface Vector3Keyframe {
  /** 时间 (秒) */
  time: number;
  /** [x, y, z] */
  value: [number, number, number];
}

export interface QuaternionKeyframe {
  time: number;
  /** [x, y, z, w] */
  value: [number, number, number, number];
}

export interface SkeletonTrack {
  boneName: string;
  /** 'translation' (位置) / 'rotation' (四元数) / 'scale' (缩放) */
  type: 'translation' | 'rotation' | 'scale';
  keyframes: Array<Vector3Keyframe | QuaternionKeyframe>;
}

export interface AnimationClip {
  name: string;
  duration: number; // 秒
  tracks: SkeletonTrack[];
}

/** 预置动画 (借鉴 WoC 12 族生物动画, 我们用最常用 5 个) */
export const ANIMATION_PRESETS: Record<string, AnimationClip> = {
  idle: {
    name: 'idle',
    duration: 2.0,
    tracks: [
      {
        boneName: 'body',
        type: 'translation',
        keyframes: [
          { time: 0, value: [0, 0, 0] },
          { time: 1.0, value: [0, 0.1, 0] },
          { time: 2.0, value: [0, 0, 0] },
        ],
      },
    ],
  },
  walk: {
    name: 'walk',
    duration: 0.8,
    tracks: [
      {
        boneName: 'leg_left',
        type: 'rotation',
        keyframes: [
          { time: 0, value: [0, 0, 0, 1] },
          { time: 0.4, value: [0, 0, 0.707, 0.707] },
          { time: 0.8, value: [0, 0, 0, 1] },
        ],
      },
      {
        boneName: 'leg_right',
        type: 'rotation',
        keyframes: [
          { time: 0, value: [0, 0, 0.707, 0.707] },
          { time: 0.4, value: [0, 0, 0, 1] },
          { time: 0.8, value: [0, 0, 0.707, 0.707] },
        ],
      },
    ],
  },
  attack: {
    name: 'attack',
    duration: 0.5,
    tracks: [
      {
        boneName: 'arm_right',
        type: 'rotation',
        keyframes: [
          { time: 0, value: [0, 0, 0, 1] },
          { time: 0.25, value: [0.5, 0, 0, 0.866] }, // 挥砍
          { time: 0.5, value: [0, 0, 0, 1] },
        ],
      },
    ],
  },
  death: {
    name: 'death',
    duration: 1.0,
    tracks: [
      {
        boneName: 'body',
        type: 'rotation',
        keyframes: [
          { time: 0, value: [0, 0, 0, 1] },
          { time: 1.0, value: [0.707, 0, 0, 0.707] }, // 倒下 90°
        ],
      },
      {
        boneName: 'body',
        type: 'translation',
        keyframes: [
          { time: 0, value: [0, 0, 0] },
          { time: 1.0, value: [0, -0.5, 0] }, // 下沉
        ],
      },
    ],
  },
  sit: {
    name: 'sit',
    duration: 1.0,
    tracks: [
      {
        boneName: 'body',
        type: 'translation',
        keyframes: [
          { time: 0, value: [0, 0, 0] },
          { time: 1.0, value: [0, -0.5, 0] },
        ],
      },
    ],
  },
};

/** 当前帧的 bone transform */
export interface BoneTransform {
  boneName: string;
  type: 'translation' | 'rotation' | 'scale';
  value: [number, number, number] | [number, number, number, number];
}

/**
 * 在 clip 中给定 time, 采样所有 tracks
 * (linear interpolation between keyframes)
 */
export function sampleAnimation(
  clip: AnimationClip,
  time: number,
): BoneTransform[] {
  const loopedTime = time % clip.duration; // 自动循环
  const result: BoneTransform[] = [];
  for (const track of clip.tracks) {
    const sampled = sampleTrack(track, loopedTime);
    result.push({
      boneName: track.boneName,
      type: track.type,
      value: sampled,
    });
  }
  return result;
}

function sampleTrack(
  track: SkeletonTrack,
  time: number,
): [number, number, number] | [number, number, number, number] {
  if (track.keyframes.length === 0) {
    // 默认: translation=[0,0,0], rotation=[0,0,0,1]
    return track.type === 'rotation' ? [0, 0, 0, 1] : [0, 0, 0];
  }
  if (track.keyframes.length === 1) {
    return (track.keyframes[0] as any).value;
  }
  // 找到 time 落在哪两帧之间
  let prev = track.keyframes[0]!;
  let next = track.keyframes[track.keyframes.length - 1]!;
  for (let i = 0; i < track.keyframes.length - 1; i++) {
    const k0 = track.keyframes[i]!;
    const k1 = track.keyframes[i + 1]!;
    if (time >= k0.time && time <= k1.time) {
      prev = k0;
      next = k1;
      break;
    }
  }
  // linear interp
  const span = next.time - prev.time;
  const t = span > 0 ? (time - prev.time) / span : 0;
  return lerpValue((prev as any).value, (next as any).value, t);
}

function lerpValue(
  a: any,
  b: any,
  t: number,
): [number, number, number] | [number, number, number, number] {
  const out = [];
  for (let i = 0; i < a.length; i++) {
    out.push(a[i] + (b[i] - a[i]) * t);
  }
  return out as any;
}

/**
 * AnimationMixer: 管理多个 AnimationAction
 * (与 Three.js AnimationMixer API 兼容, 但纯数据版)
 */
export class AnimationMixer {
  private actions = new Map<string, AnimationAction>();
  private currentTime = 0;
  private rootBones = new Map<string, BoneTransform>();

  /** 注册一个动画 (可被触发播放) */
  register(clip: AnimationClip): void {
    this.actions.set(clip.name, new AnimationAction(clip));
  }

  /** 播放动画 (默认循环) */
  play(name: string, loop: boolean = true): void {
    const a = this.actions.get(name);
    if (!a) throw new Error(`Animation not registered: ${name}`);
    a.play(loop);
  }

  /** 停止动画 */
  stop(name: string): void {
    const a = this.actions.get(name);
    if (a) a.stop();
  }

  /** 在两个动画间混合 (用于 attack 完成后回 idle) */
  blendTo(name: string, durationSec: number): void {
    // 简化版: 立即切 (没真做 blend)
    this.stop(name);
    this.play(name);
  }

  /** 推进时间, 重新计算 bones */
  update(dt: number): void {
    this.currentTime += dt;
    this.rootBones.clear();
    for (const action of this.actions.values()) {
      if (!action.isPlaying()) continue;
      const transforms = sampleAnimation(action.clip, this.currentTime);
      for (const t of transforms) {
        this.rootBones.set(`${t.boneName}:${t.type}`, t);
      }
    }
  }

  /** 获取当前所有 bone transforms */
  getBoneTransforms(): BoneTransform[] {
    return Array.from(this.rootBones.values());
  }
}

/** 单一动画 action (类似 Three.js AnimationAction) */
export class AnimationAction {
  playing = false;
  loop = true;
  constructor(public clip: AnimationClip) {}
  play(loop: boolean = true): void {
    this.playing = true;
    this.loop = loop;
  }
  stop(): void {
    this.playing = false;
  }
  isPlaying(): boolean {
    return this.playing;
  }
}