'use client';

import {
  type BrowserLogSettings,
  type LogLevel,
  formatLogTimestamp,
  getDefaultBrowserLogSettings,
  normalizeLogLevel,
  shouldLog,
} from './shared';

const LOG_SETTINGS_STORAGE_KEY = 'codex-control-center.logging';
const MAX_LOG_ENTRIES = 300;

const listeners = new Set<(settings: BrowserLogSettings) => void>();
const logListeners = new Set<(entries: BrowserLogEntry[]) => void>();

let currentSettings = readPersistedLogSettings();
let logEntries: BrowserLogEntry[] = [];

export type BrowserLogEntry = {
  id: string;
  timestamp: string;
  level: LogLevel;
  scope: string;
  message: string;
  details: string[];
};

function readPersistedLogSettings(): BrowserLogSettings {
  const fallback = getDefaultBrowserLogSettings();
  if (typeof window === 'undefined') {
    return fallback;
  }

  try {
    const raw = window.localStorage.getItem(LOG_SETTINGS_STORAGE_KEY);
    if (!raw) return fallback;
    const parsed = JSON.parse(raw) as Partial<BrowserLogSettings>;
    return {
      level: normalizeLogLevel(parsed.level, fallback.level),
      timestamps: typeof parsed.timestamps === 'boolean' ? parsed.timestamps : fallback.timestamps,
    };
  } catch {
    return fallback;
  }
}

function persistLogSettings(settings: BrowserLogSettings) {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(LOG_SETTINGS_STORAGE_KEY, JSON.stringify(settings));
  } catch {
    // Ignore storage failures.
  }
}

function emitSettingsChanged() {
  listeners.forEach((listener) => listener(currentSettings));
}

function emitLogEntriesChanged() {
  const snapshot = [...logEntries];
  logListeners.forEach((listener) => listener(snapshot));
}

function sanitizeConsoleText(value: string) {
  return value.replace(/[\u0000-\u001f\u007f-\u009f\u2028\u2029]+/g, ' ').trim();
}

function formatLogDetail(arg: unknown) {
  if (arg instanceof Error) {
    return arg.stack || arg.message;
  }
  if (typeof arg === 'string') {
    return arg;
  }
  try {
    return JSON.stringify(arg, null, 2);
  } catch {
    return String(arg);
  }
}

function getLevelStyles(level: LogLevel) {
  switch (level) {
    case 'trace':
      return 'color:#94a3b8;font-weight:700';
    case 'debug':
      return 'color:#60a5fa;font-weight:700';
    case 'info':
      return 'color:#2dd4bf;font-weight:700';
    case 'warn':
      return 'color:#f59e0b;font-weight:700';
    case 'error':
      return 'color:#f87171;font-weight:700';
    default:
      return 'color:#cbd5e1;font-weight:700';
  }
}

function getScopeStyle() {
  return 'color:#cbd5e1;font-weight:600';
}

function getConsoleMethod(level: LogLevel) {
  switch (level) {
    case 'trace':
      return console.debug;
    case 'debug':
      return console.debug;
    case 'info':
      return console.info;
    case 'warn':
      return console.warn;
    case 'error':
      return console.error;
    default:
      return console.log;
  }
}

function writeLog(level: LogLevel, scope: string, message: string, args: unknown[]) {
  const timestamp = formatLogTimestamp();
  const safeScope = sanitizeConsoleText(scope);
  const safeMessage = sanitizeConsoleText(message);
  const safeDetails = args.map((arg) => sanitizeConsoleText(formatLogDetail(arg)));
  const nextEntry: BrowserLogEntry = {
    id: `${timestamp}-${Math.random().toString(16).slice(2)}`,
    timestamp,
    level,
    scope: safeScope,
    message: safeMessage,
    details: safeDetails,
  };
  logEntries = [...logEntries.slice(-(MAX_LOG_ENTRIES - 1)), nextEntry];
  emitLogEntriesChanged();

  if (!shouldLog(level, currentSettings.level)) return;

  const prefixParts = currentSettings.timestamps
    ? [timestamp, level.toUpperCase(), safeScope]
    : [level.toUpperCase(), safeScope];
  const prefix = prefixParts.join(' · ');
  getConsoleMethod(level)(
    `%c${prefix}%c ${safeMessage}`,
    getLevelStyles(level),
    getScopeStyle(),
    ...safeDetails,
  );
}

export function getBrowserLogSettings() {
  return currentSettings;
}

export function updateBrowserLogSettings(patch: Partial<BrowserLogSettings>): BrowserLogSettings {
  currentSettings = {
    level: normalizeLogLevel(patch.level, currentSettings.level),
    timestamps:
      typeof patch.timestamps === 'boolean' ? patch.timestamps : currentSettings.timestamps,
  };
  persistLogSettings(currentSettings);
  emitSettingsChanged();
  return currentSettings;
}

export function subscribeToBrowserLogSettings(listener: (settings: BrowserLogSettings) => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function getRecentBrowserLogs() {
  return [...logEntries];
}

export function clearBrowserLogs() {
  logEntries = [];
  emitLogEntriesChanged();
}

export function subscribeToBrowserLogs(listener: (entries: BrowserLogEntry[]) => void) {
  logListeners.add(listener);
  return () => {
    logListeners.delete(listener);
  };
}

export function createBrowserLogger(scope: string) {
  const normalizedScope = scope.trim() || 'app';

  return {
    trace(message: string, ...args: unknown[]) {
      writeLog('trace', normalizedScope, message, args);
    },
    debug(message: string, ...args: unknown[]) {
      writeLog('debug', normalizedScope, message, args);
    },
    info(message: string, ...args: unknown[]) {
      writeLog('info', normalizedScope, message, args);
    },
    warn(message: string, ...args: unknown[]) {
      writeLog('warn', normalizedScope, message, args);
    },
    error(message: string, ...args: unknown[]) {
      writeLog('error', normalizedScope, message, args);
    },
    child(childScope: string) {
      return createBrowserLogger(`${normalizedScope}:${childScope}`);
    },
  };
}
