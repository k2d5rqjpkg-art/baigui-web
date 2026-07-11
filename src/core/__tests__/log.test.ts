/**
 * src/core/__tests__/log.test.ts
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { log, setLogLevel, getLogLevel } from '../log';

describe('log', () => {
  let debugSpy: ReturnType<typeof vi.spyOn>;
  let logSpy: ReturnType<typeof vi.spyOn>;
  let warnSpy: ReturnType<typeof vi.spyOn>;
  let errorSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    debugSpy = vi.spyOn(console, 'debug').mockImplementation(() => {});
    logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    debugSpy.mockRestore();
    logSpy.mockRestore();
    warnSpy.mockRestore();
    errorSpy.mockRestore();
  });

  it('info 级别只输出 info/warn/error', () => {
    setLogLevel('info');
    log.debug('d');
    log.info('i');
    log.warn('w');
    log.error('e');
    expect(debugSpy).not.toHaveBeenCalled();
    expect(logSpy).toHaveBeenCalledWith('[baigui:info]', 'i');
    expect(warnSpy).toHaveBeenCalledWith('[baigui:warn]', 'w');
    expect(errorSpy).toHaveBeenCalledWith('[baigui:error]', 'e');
  });

  it('debug 级别输出全部', () => {
    setLogLevel('debug');
    log.debug('d');
    log.info('i');
    log.warn('w');
    log.error('e');
    expect(debugSpy).toHaveBeenCalledOnce();
    expect(logSpy).toHaveBeenCalledOnce();
    expect(warnSpy).toHaveBeenCalledOnce();
    expect(errorSpy).toHaveBeenCalledOnce();
  });

  it('silent 级别全部静默', () => {
    setLogLevel('silent');
    log.debug('d');
    log.info('i');
    log.warn('w');
    log.error('e');
    expect(debugSpy).not.toHaveBeenCalled();
    expect(logSpy).not.toHaveBeenCalled();
    expect(warnSpy).not.toHaveBeenCalled();
    expect(errorSpy).not.toHaveBeenCalled();
  });

  it('getLogLevel/setLogLevel 双向工作', () => {
    setLogLevel('warn');
    expect(getLogLevel()).toBe('warn');
    setLogLevel('debug');
    expect(getLogLevel()).toBe('debug');
  });

  it('额外参数原样透传', () => {
    setLogLevel('info');
    log.info('msg', { foo: 1 }, [2, 3]);
    expect(logSpy).toHaveBeenCalledWith('[baigui:info]', 'msg', { foo: 1 }, [2, 3]);
  });
});