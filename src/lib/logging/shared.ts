export const LOG_LEVELS = ['trace', 'debug', 'info', 'warn', 'error', 'silent'] as const;

export type LogLevel = (typeof LOG_LEVELS)[number];

export type BrowserLogSettings = {
  level: LogLevel;
  timestamps: boolean;
};

export const LOG_LEVEL_PRIORITY: Record<LogLevel, number> = {
  trace: 10,
  debug: 20,
  info: 30,
  warn: 40,
  error: 50,
  silent: 99,
};

export function normalizeLogLevel(value: unknown, fallback: LogLevel = 'info'): LogLevel {
  return typeof value === 'string' && (LOG_LEVELS as readonly string[]).includes(value)
    ? (value as LogLevel)
    : fallback;
}

export function shouldLog(level: LogLevel, configuredLevel: LogLevel) {
  return LOG_LEVEL_PRIORITY[level] >= LOG_LEVEL_PRIORITY[configuredLevel];
}

export function getDefaultBrowserLogSettings(): BrowserLogSettings {
  return {
    level: process.env.NODE_ENV === 'development' ? 'debug' : 'info',
    timestamps: true,
  };
}

export function formatLogTimestamp(date = new Date()) {
  return date.toISOString().slice(11, 23);
}
