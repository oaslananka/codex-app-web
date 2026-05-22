'use strict';

const util = require('node:util');

const LOG_LEVELS = ['trace', 'debug', 'info', 'warn', 'error', 'silent'];

const LOG_LEVEL_PRIORITY = {
  trace: 10,
  debug: 20,
  info: 30,
  warn: 40,
  error: 50,
  silent: 99,
};

const ANSI_RESET = '\x1b[0m';
const ANSI_DIM = '\x1b[2m';
const ANSI_BLUE = '\x1b[34m';
const ANSI_CYAN = '\x1b[36m';
const ANSI_YELLOW = '\x1b[33m';
const ANSI_RED = '\x1b[31m';
const ANSI_MAGENTA = '\x1b[35m';

function normalizeLogLevel(value, fallback = 'info') {
  return typeof value === 'string' && LOG_LEVELS.includes(value) ? value : fallback;
}

function shouldLog(level, configuredLevel) {
  return LOG_LEVEL_PRIORITY[level] >= LOG_LEVEL_PRIORITY[configuredLevel];
}

function getDefaultNodeLogLevel() {
  return process.env.NODE_ENV === 'development' ? 'debug' : 'info';
}

function getNodeLogSettings(env = process.env) {
  return {
    level: normalizeLogLevel(env.CODEX_LOG_LEVEL, getDefaultNodeLogLevel()),
    timestamps: env.CODEX_LOG_TIMESTAMPS !== '0',
    colors:
      env.NO_COLOR !== '1' &&
      env.CODEX_LOG_COLORS !== '0' &&
      Boolean(process.stdout.isTTY || process.stderr.isTTY),
  };
}

function formatTimestamp(date = new Date()) {
  return date.toISOString().slice(11, 23);
}

function colorize(text, color, settings) {
  return settings.colors ? `${color}${text}${ANSI_RESET}` : text;
}

function getLevelColor(level) {
  switch (level) {
    case 'trace':
      return ANSI_DIM;
    case 'debug':
      return ANSI_BLUE;
    case 'info':
      return ANSI_CYAN;
    case 'warn':
      return ANSI_YELLOW;
    case 'error':
      return ANSI_RED;
    default:
      return '';
  }
}

function formatArg(arg) {
  if (arg instanceof Error) {
    return arg.stack || arg.message;
  }
  if (typeof arg === 'string') {
    return arg;
  }
  return util.inspect(arg, {
    colors: false,
    depth: 6,
    breakLength: 120,
    compact: false,
  });
}

function createNodeLogger(scope, inheritedSettings) {
  const normalizedScope = (scope || 'app').trim();
  const settings = inheritedSettings || getNodeLogSettings();

  function write(level, message, args) {
    if (!shouldLog(level, settings.level)) return;

    const prefixParts = [];
    if (settings.timestamps) {
      prefixParts.push(formatTimestamp());
    }
    prefixParts.push(level.toUpperCase());
    prefixParts.push(normalizedScope);

    const renderedPrefix = [
      settings.timestamps ? colorize(prefixParts[0], ANSI_DIM, settings) : null,
      colorize(
        settings.timestamps ? prefixParts[1] : prefixParts[0],
        getLevelColor(level),
        settings,
      ),
      colorize(settings.timestamps ? prefixParts[2] : prefixParts[1], ANSI_MAGENTA, settings),
    ]
      .filter(Boolean)
      .join(' ');

    const renderedMessage = [message, ...args.map(formatArg)].join(' ');
    const stream = level === 'warn' || level === 'error' ? process.stderr : process.stdout;
    stream.write(`${renderedPrefix} ${renderedMessage}\n`);
  }

  return {
    trace(message, ...args) {
      write('trace', message, args);
    },
    debug(message, ...args) {
      write('debug', message, args);
    },
    info(message, ...args) {
      write('info', message, args);
    },
    warn(message, ...args) {
      write('warn', message, args);
    },
    error(message, ...args) {
      write('error', message, args);
    },
    child(childScope) {
      return createNodeLogger(`${normalizedScope}:${childScope}`, settings);
    },
    settings,
  };
}

module.exports = {
  LOG_LEVELS,
  normalizeLogLevel,
  shouldLog,
  getNodeLogSettings,
  createNodeLogger,
};
