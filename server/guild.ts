/**
 * server/guild.ts
 *
 * Day9: 工会 (Guild) 系统
 *
 * 设计:
 *   - 纯服务端模块, 不污染 sim
 *   - Guild: { id, name, leader, members[], createdAt, level, xp }
 *   - 职位: leader / officer / member
 *   - 工会升级: 全员贡献 xp
 *   - 借鉴 WoC: 30+ 贡献者社区 → 工会是天然结构
 *
 * 注: 不连 sim entities, 用独立的 playerId 字符串
 */
import { log } from '../src/core/log.js';

export type GuildRole = 'leader' | 'officer' | 'member';

export interface GuildMember {
  playerId: string;
  role: GuildRole;
  joinedAt: number;
  /** 贡献给工会的 xp */
  contribution: number;
}

export interface Guild {
  id: string;
  name: string;
  leader: string; // playerId
  members: Map<string, GuildMember>;
  createdAt: number;
  /** 工会等级 (全员贡献累计到阈值升 1 级) */
  level: number;
  /** 工会当前经验 */
  xp: number;
}

export const GUILD_LEVEL_THRESHOLDS = [0, 1000, 3000, 6000, 10000, 15000];

/** 工会管理: 创建/加入/退出/踢人/贡献 */
export class GuildManager {
  private guilds = new Map<string, Guild>(); // by guildId
  private playerToGuild = new Map<string, string>(); // playerId → guildId

  /** 创建工会 */
  createGuild(id: string, name: string, leaderId: string): Guild {
    if (this.playerToGuild.has(leaderId)) {
      throw new Error(`${leaderId} already in a guild`);
    }
    if (Array.from(this.guilds.values()).some((g) => g.name === name)) {
      throw new Error(`Guild name "${name}" taken`);
    }
    const guild: Guild = {
      id,
      name,
      leader: leaderId,
      members: new Map([
        [leaderId, { playerId: leaderId, role: 'leader', joinedAt: Date.now(), contribution: 0 }],
      ]),
      createdAt: Date.now(),
      level: 1,
      xp: 0,
    };
    this.guilds.set(id, guild);
    this.playerToGuild.set(leaderId, id);
    log.info(`[guild] created "${name}" by ${leaderId}`);
    return guild;
  }

  /** 加入 (open) 工会 */
  joinGuild(guildId: string, playerId: string): void {
    if (this.playerToGuild.has(playerId)) {
      throw new Error(`${playerId} already in guild`);
    }
    const guild = this.guilds.get(guildId);
    if (!guild) throw new Error(`Guild ${guildId} not found`);
    guild.members.set(playerId, {
      playerId,
      role: 'member',
      joinedAt: Date.now(),
      contribution: 0,
    });
    this.playerToGuild.set(playerId, guildId);
    log.info(`[guild] ${playerId} joined ${guild.name}`);
  }

  /** 离开工会 */
  leaveGuild(playerId: string): void {
    const guildId = this.playerToGuild.get(playerId);
    if (!guildId) throw new Error(`${playerId} not in any guild`);
    const guild = this.guilds.get(guildId);
    if (!guild) return;
    if (guild.leader === playerId) {
      throw new Error(`Leader ${playerId} cannot leave (must transfer or disband)`);
    }
    guild.members.delete(playerId);
    this.playerToGuild.delete(playerId);
    log.info(`[guild] ${playerId} left ${guild.name}`);
  }

  /** 踢人 (仅 leader/officer) */
  kick(kickerId: string, targetId: string): void {
    const guildId = this.playerToGuild.get(kickerId);
    if (!guildId) throw new Error(`Kicker ${kickerId} not in guild`);
    const guild = this.guilds.get(guildId);
    if (!guild) throw new Error('Guild not found');
    const kicker = guild.members.get(kickerId);
    if (!kicker || (kicker.role !== 'leader' && kicker.role !== 'officer')) {
      throw new Error(`${kickerId} not authorized to kick`);
    }
    if (targetId === guild.leader) {
      throw new Error('Cannot kick leader');
    }
    if (!guild.members.has(targetId)) {
      throw new Error(`${targetId} not in guild`);
    }
    guild.members.delete(targetId);
    this.playerToGuild.delete(targetId);
    log.info(`[guild] ${targetId} kicked by ${kickerId} from ${guild.name}`);
  }

  /** 任命 (仅 leader) */
  promote(leaderId: string, targetId: string, newRole: GuildRole): void {
    const guildId = this.playerToGuild.get(leaderId);
    if (!guildId) throw new Error(`${leaderId} not in guild`);
    const guild = this.guilds.get(guildId);
    if (!guild) throw new Error('Guild not found');
    if (guild.leader !== leaderId) {
      throw new Error(`Only leader can promote`);
    }
    if (newRole === 'leader') {
      guild.leader = targetId;
      // 旧 leader 降为 officer
      const oldLeader = guild.members.get(leaderId);
      if (oldLeader) oldLeader.role = 'officer';
    }
    const target = guild.members.get(targetId);
    if (!target) throw new Error(`${targetId} not in guild`);
    target.role = newRole;
    log.info(`[guild] ${targetId} promoted to ${newRole} in ${guild.name}`);
  }

  /** 贡献 xp (全员累计, 推动工会升级) */
  contribute(
    playerId: string,
    amount: number,
  ): { guild: Guild; leveledUp: boolean; newLevel: number } {
    const guildId = this.playerToGuild.get(playerId);
    if (!guildId) throw new Error(`${playerId} not in any guild`);
    const guild = this.guilds.get(guildId);
    if (!guild) throw new Error('Guild not found');
    const member = guild.members.get(playerId);
    if (!member) throw new Error(`${playerId} not in guild members`);

    member.contribution += amount;
    guild.xp += amount;
    let leveledUp = false;
    while (
      guild.level < GUILD_LEVEL_THRESHOLDS.length &&
      guild.xp >= GUILD_LEVEL_THRESHOLDS[guild.level]!
    ) {
      guild.level++;
      leveledUp = true;
    }
    return { guild, leveledUp, newLevel: guild.level };
  }

  /** 查询 */
  getGuild(id: string): Guild | undefined {
    return this.guilds.get(id);
  }
  getPlayerGuild(playerId: string): Guild | undefined {
    const id = this.playerToGuild.get(playerId);
    return id ? this.guilds.get(id) : undefined;
  }
  listGuilds(): Guild[] {
    return Array.from(this.guilds.values());
  }
  getGuildSize(guildId: string): number {
    return this.guilds.get(guildId)?.members.size ?? 0;
  }
}
