/**
 * src/core/log.ts
 *
 * 统一日志工具 (Day5+)
 *
 * 设计:
 *   - 4 个级别: debug / info / warn / error
 *   - 通过 LOG_LEVEL 环境变量控制 (默认 'info')
 *     - Vite: import.meta.env.DEV / PROD 自动切换
 *   - 用 console 但统一前缀 ([baigui])
 *   - 浏览器和 Node 通用
 *
 * 用法:
 *   import { log } from '../../core/log';
 *   log.debug('foo bar');  // 仅 LOG_LEVEL=debug 时输出
 *   log.info('started');
 *   log.warn('something');
 *   log.error('crash', err);
 */

export type LogLevel = 'debug' | 'info' | 'warn' | 'error' | 'silent';

const LEVEL_ORDER: Record<LogLevel, number> = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40,
  silent: 100,
};

function detectEnvLevel(): LogLevel {
  // 浏览器: Vite 用 import.meta.env.MODE
  if (typeof import.meta !== 'undefined' && (import.meta as any).env?.MODE) {
    const mode = (import.meta as any).env.MODE as string;
    if (mode === 'development') return 'debug';
    if (mode === 'production') return 'warn';
  }
  // Node: 显式环境变量优先
  if (typeof process !== 'undefined' && process.env?.LOG_LEVEL) {
    const v = process.env.LOG_LEVEL as LogLevel;
    if (v in LEVEL_ORDER) return v;
  }
  return 'info';
}

let currentLevel: LogLevel = detectEnvLevel();

export function setLogLevel(level: LogLevel): void {
  currentLevel = level;
}

export function getLogLevel(): LogLevel {
  return currentLevel;
}

function shouldLog(level: LogLevel): boolean {
  return LEVEL_ORDER[level] >= LEVEL_ORDER[currentLevel];
}

function fmt(level: LogLevel, args: unknown[]): unknown[] {
  const prefix = `[baigui:${level}]`;
  return [prefix, ...args];
}

export const log = {
  debug(...args: unknown[]): void {
    if (shouldLog('debug')) {
      // eslint-disable-next-line no-console
      console.debug(...fmt('debug', args));
    }
  },
  info(...args: unknown[]): void {
    if (shouldLog('info')) {
      // eslint-disable-next-line no-console
      console.log(...fmt('info', args));
    }
  },
  warn(...args: unknown[]): void {
    if (shouldLog('warn')) {
      console.warn(...fmt('warn', args));
    }
  },
  error(...args: unknown[]): void {
    if (shouldLog('error')) {
      console.error(...fmt('error', args));
    }
  },
};