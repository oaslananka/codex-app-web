import { afterEach, describe, expect, it } from 'vitest';
import {
  clearBrowserLogs,
  createBrowserLogger,
  getBrowserLogSettings,
  getRecentBrowserLogs,
  updateBrowserLogSettings,
} from '../../src/lib/logging/browser-logger';
import { formatLogTimestamp, normalizeLogLevel, shouldLog } from '../../src/lib/logging/shared';

const originalSettings = getBrowserLogSettings();

describe('logging helpers', () => {
  afterEach(() => {
    updateBrowserLogSettings(originalSettings);
    clearBrowserLogs();
  });

  it('normalizes unknown log levels safely', () => {
    expect(normalizeLogLevel('trace')).toBe('trace');
    expect(normalizeLogLevel('nonsense', 'warn')).toBe('warn');
  });

  it('filters messages according to configured level priority', () => {
    expect(shouldLog('error', 'info')).toBe(true);
    expect(shouldLog('debug', 'info')).toBe(false);
    expect(shouldLog('trace', 'trace')).toBe(true);
  });

  it('updates browser log settings in memory', () => {
    const next = updateBrowserLogSettings({ level: 'trace', timestamps: false });
    expect(next).toEqual({
      level: 'trace',
      timestamps: false,
    });
    expect(getBrowserLogSettings()).toEqual(next);
  });

  it('formats compact timestamps for console prefixes', () => {
    expect(formatLogTimestamp(new Date('2026-03-28T12:34:56.789Z'))).toBe('12:34:56.789');
  });

  it('stores browser log entries for the runtime viewer', () => {
    const logger = createBrowserLogger('test:viewer');

    logger.info('First message', { step: 1 });
    logger.error('Second message', new Error('boom'));

    const entries = getRecentBrowserLogs();
    expect(entries).toHaveLength(2);
    const firstEntry = entries[0]!;
    const secondEntry = entries[1]!;
    expect(firstEntry).toMatchObject({
      level: 'info',
      scope: 'test:viewer',
      message: 'First message',
    });
    expect(firstEntry.details[0]).toContain('"step": 1');
    expect(secondEntry).toMatchObject({
      level: 'error',
      scope: 'test:viewer',
      message: 'Second message',
    });
    expect(secondEntry.details[0]).toContain('boom');
  });

  it('clears buffered browser log entries', () => {
    const logger = createBrowserLogger('test:clear');
    logger.warn('Will be cleared');

    expect(getRecentBrowserLogs()).toHaveLength(1);
    clearBrowserLogs();
    expect(getRecentBrowserLogs()).toHaveLength(0);
  });

  it('sanitizes control characters before storing browser log text', () => {
    const logger = createBrowserLogger('test:viewer\r\nspoofed');

    logger.warn('First line\nsecond line');

    expect(getRecentBrowserLogs()[0]).toMatchObject({
      scope: 'test:viewer spoofed',
      message: 'First line second line',
    });
  });
});
