/**
 * server/__tests__/guild.test.ts
 *
 * Day9: 工会系统测试
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { GuildManager, GUILD_LEVEL_THRESHOLDS } from '../guild.js';

describe('GuildManager 基础', () => {
  let m: GuildManager;
  beforeEach(() => {
    m = new GuildManager();
  });

  it('createGuild: 创建 + 玩家加入', () => {
    const g = m.createGuild('g1', '百鬼堂', 'p1');
    expect(g.id).toBe('g1');
    expect(g.name).toBe('百鬼堂');
    expect(g.leader).toBe('p1');
    expect(g.members.size).toBe(1);
    expect(g.level).toBe(1);
  });

  it('createGuild: 名字重复 → throw', () => {
    m.createGuild('g1', '百鬼堂', 'p1');
    expect(() => m.createGuild('g2', '百鬼堂', 'p2')).toThrow();
  });

  it('createGuild: 玩家已在工会 → throw', () => {
    m.createGuild('g1', 'A', 'p1');
    expect(() => m.createGuild('g2', 'B', 'p1')).toThrow();
  });

  it('joinGuild: 加入现有工会', () => {
    m.createGuild('g1', 'A', 'p1');
    m.joinGuild('g1', 'p2');
    expect(m.getGuildSize('g1')).toBe(2);
    expect(m.getPlayerGuild('p2')?.id).toBe('g1');
  });

  it('joinGuild: 玩家已在另一工会 → throw', () => {
    m.createGuild('g1', 'A', 'p1');
    m.createGuild('g2', 'B', 'p2');
    expect(() => m.joinGuild('g1', 'p2')).toThrow();
  });

  it('leaveGuild: 成员离开', () => {
    m.createGuild('g1', 'A', 'p1');
    m.joinGuild('g1', 'p2');
    m.leaveGuild('p2');
    expect(m.getGuildSize('g1')).toBe(1);
    expect(m.getPlayerGuild('p2')).toBeUndefined();
  });

  it('leaveGuild: leader 不能直接离开 (需 transfer)', () => {
    m.createGuild('g1', 'A', 'p1');
    expect(() => m.leaveGuild('p1')).toThrow();
  });
});

describe('踢人 / 任命 (借鉴 WoC 工会管理)', () => {
  let m: GuildManager;
  beforeEach(() => {
    m = new GuildManager();
    m.createGuild('g1', 'A', 'p1');  // leader
    m.joinGuild('g1', 'p2');
    m.joinGuild('g1', 'p3');
  });

  it('leader 踢 p2', () => {
    m.kick('p1', 'p2');
    expect(m.getGuildSize('g1')).toBe(2);
    expect(m.getPlayerGuild('p2')).toBeUndefined();
  });

  it('普通成员踢人 → throw', () => {
    expect(() => m.kick('p2', 'p3')).toThrow();
  });

  it('不能踢 leader', () => {
    expect(() => m.kick('p2', 'p1')).toThrow();
  });

  it('promote: p2 升 officer', () => {
    m.promote('p1', 'p2', 'officer');
    expect(m.getPlayerGuild('p2')?.members.get('p2')?.role).toBe('officer');
  });

  it('promote 转移 leader: p1 → p2', () => {
    m.promote('p1', 'p2', 'leader');
    expect(m.getPlayerGuild('p1')?.leader).toBe('p2');
    expect(m.getPlayerGuild('p1')?.members.get('p1')?.role).toBe('officer');
  });

  it('非 leader 不能 promote', () => {
    expect(() => m.promote('p2', 'p3', 'officer')).toThrow();
  });
});

describe('贡献 + 升级 (Day9 工会升级机制)', () => {
  let m: GuildManager;
  beforeEach(() => {
    m = new GuildManager();
    m.createGuild('g1', 'A', 'p1');
    m.joinGuild('g1', 'p2');
  });

  it('contribute: 单次贡献, 个人 + 工会都加', () => {
    const r = m.contribute('p1', 100);
    expect(r.guild.xp).toBe(100);
    expect(r.guild.members.get('p1')?.contribution).toBe(100);
    expect(r.leveledUp).toBe(false);
  });

  it('contribute: 累计达阈值 → 升级', () => {
    // lv1→2 需 1000
    m.contribute('p1', 500);
    const r = m.contribute('p1', 500);
    expect(r.leveledUp).toBe(true);
    expect(r.newLevel).toBe(2);
  });

  it('contribute: 多成员累计, 任一成员贡献都算', () => {
    m.contribute('p1', 600);
    m.contribute('p2', 400); // 累计 1000
    const g = m.getGuild('g1')!;
    expect(g.xp).toBe(1000);
    expect(g.level).toBe(2);
  });

  it('contribute: 无工会的玩家 → throw', () => {
    expect(() => m.contribute('p_no_guild', 100)).toThrow();
  });

  it('阈值表: 5 个等级 (借鉴 WoC 工会升级)', () => {
    expect(GUILD_LEVEL_THRESHOLDS.length).toBeGreaterThanOrEqual(5);
    for (let i = 1; i < GUILD_LEVEL_THRESHOLDS.length; i++) {
      expect(GUILD_LEVEL_THRESHOLDS[i]!).toBeGreaterThan(GUILD_LEVEL_THRESHOLDS[i - 1]!);
    }
  });
});

describe('listGuilds / 状态查询', () => {
  it('listGuilds 返所有', () => {
    const m = new GuildManager();
    m.createGuild('g1', 'A', 'p1');
    m.createGuild('g2', 'B', 'p2');
    m.createGuild('g3', 'C', 'p3');
    expect(m.listGuilds().length).toBe(3);
  });

  it('getPlayerGuild: 无工会 → undefined', () => {
    const m = new GuildManager();
    expect(m.getPlayerGuild('p1')).toBeUndefined();
  });
});