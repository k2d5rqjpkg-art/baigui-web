/**
 * src/render/sfx-gen.ts
 *
 * 借鉴 #4: WebAudio 合成音效 (无音频文件)
 *
 * WoC: WebAudio 合成全部音效 (attack/footstep/death)
 * 我们: 程序化合成 5 种核心音效 (attack/hit/death/pickup/footstep)
 *
 * 设计:
 *   - 用 OscillatorNode + GainNode 合成 (无需音频文件)
 *   - 5 种预设: attack/hit/death/pickup/footstep
 *   - 浏览器端 AudioContext (lazy init)
 */

export type SfxType = 'attack' | 'hit' | 'death' | 'pickup' | 'footstep';

/** 音效配置 (频率 / 时长 / 包络) */
export interface SfxConfig {
  frequency: number; // Hz, 主音高
  duration: number; // ms
  attack: number; // ms, 上升到最大
  decay: number; // ms, 衰减
  type: OscillatorType; // sine/square/sawtooth/triangle
  volume: number; // 0-1
  /** 频率滑音 (Hz 起始 → 结束) */
  frequencyEnd?: number;
  /** 包络: lowpass filter (Hz) */
  filterFreq?: number;
}

/** 5 种预设 (借鉴 WoC 命名约定) */
export const SFX_PRESETS: Record<SfxType, SfxConfig> = {
  attack: {
    frequency: 220,
    frequencyEnd: 110,
    duration: 150,
    attack: 5,
    decay: 145,
    type: 'sawtooth',
    volume: 0.3,
  },
  hit: {
    frequency: 440,
    frequencyEnd: 80,
    duration: 100,
    attack: 2,
    decay: 98,
    type: 'square',
    volume: 0.25,
    filterFreq: 1500,
  },
  death: {
    frequency: 220,
    frequencyEnd: 55,
    duration: 600,
    attack: 10,
    decay: 590,
    type: 'sawtooth',
    volume: 0.4,
  },
  pickup: {
    frequency: 660,
    frequencyEnd: 1320,
    duration: 120,
    attack: 5,
    decay: 115,
    type: 'sine',
    volume: 0.2,
  },
  footstep: {
    frequency: 100,
    duration: 60,
    attack: 2,
    decay: 58,
    type: 'triangle',
    volume: 0.1,
  },
};

/** SFX 引擎 (单例 AudioContext, 浏览器端) */
export class SfxEngine {
  private ctx: AudioContext | null = null;
  private masterGain: GainNode | null = null;
  private enabled = true;
  /** 测试用: AudioContext mock 注入 */
  public setContext(ctx: AudioContext): void {
    this.ctx = ctx;
    this.masterGain = ctx.createGain();
    this.masterGain.gain.value = 0.8;
    this.masterGain.connect(ctx.destination);
  }

  /** 懒初始化 (浏览器端) */
  private ensureContext(): AudioContext {
    if (this.ctx) return this.ctx;
    const AudioContextCtor = (typeof window !== 'undefined' ? window.AudioContext : null) as any;
    if (!AudioContextCtor) {
      throw new Error('AudioContext not available (not browser?)');
    }
    const ctx = new AudioContextCtor();
    const masterGain = ctx.createGain();
    masterGain.gain.value = 0.8;
    masterGain.connect(ctx.destination);
    this.ctx = ctx;
    this.masterGain = masterGain;
    return ctx;
  }

  /** 播放一个 SFX */
  play(type: SfxType): void {
    if (!this.enabled) return;
    try {
      const ctx = this.ensureContext();
      const masterGain = this.masterGain;
      if (!masterGain) return;
      const cfg = SFX_PRESETS[type];
      playSfx(ctx, masterGain, cfg);
    } catch (err) {
      // SFX 失败不阻塞游戏
      if ((globalThis as any).__SFX_DEBUG__) {
        console.warn('[sfx] play failed:', err);
      }
    }
  }

  /** 静音 / 解除 */
  setEnabled(v: boolean): void {
    this.enabled = v;
  }
  isEnabled(): boolean {
    return this.enabled;
  }
}

/**
 * 纯函数: 给定 ctx + masterGain + config, 合成一段音效
 * 可独立测试 (mock AudioContext)
 */
export function playSfx(ctx: AudioContext, masterGain: GainNode, cfg: SfxConfig): void {
  const now = ctx.currentTime;
  const startTime = now;
  const endTime = now + cfg.duration / 1000;

  // 1. Oscillator (主声源)
  const osc = ctx.createOscillator();
  osc.type = cfg.type;
  osc.frequency.setValueAtTime(cfg.frequency, startTime);
  if (cfg.frequencyEnd !== undefined) {
    osc.frequency.exponentialRampToValueAtTime(Math.max(1, cfg.frequencyEnd), endTime);
  }

  // 2. 包络 (Gain)
  const gain = ctx.createGain();
  gain.gain.setValueAtTime(0, startTime);
  gain.gain.linearRampToValueAtTime(cfg.volume, startTime + cfg.attack / 1000);
  gain.gain.exponentialRampToValueAtTime(0.001, endTime);

  // 3. Filter (optional)
  let lastNode: AudioNode = osc;
  if (cfg.filterFreq !== undefined) {
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = cfg.filterFreq;
    lastNode.connect(filter);
    lastNode = filter;
  }

  // 4. 接线
  osc.connect(gain);
  gain.connect(lastNode);
  lastNode.connect(masterGain);

  // 5. 播放
  osc.start(startTime);
  osc.stop(endTime + 0.01);
}

/** 全局单例 */
export const sfx = new SfxEngine();
