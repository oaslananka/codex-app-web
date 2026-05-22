#!/usr/bin/env node
'use strict';

const net = require('node:net');
const { spawn } = require('child_process');
const { createNodeLogger } = require('./src/lib/logging/node-logger.cjs');

const CODEX_LISTEN = process.env.CODEX_LISTEN || 'ws://127.0.0.1:40000';
const CODEX_REUSE_EXISTING = process.env.CODEX_REUSE_EXISTING === '1';
const UI_REUSE_EXISTING = process.env.UI_REUSE_EXISTING === '1';
const UI_COMMAND = process.env.UI_COMMAND || 'node server.cjs';
const children = [];
let shuttingDown = false;
const logger = createNodeLogger('launcher');

const parsePort = (value, fallback) => {
  const parsed = Number.parseInt(value ?? '', 10);
  return Number.isInteger(parsed) && parsed > 0 && parsed < 65536 ? parsed : fallback;
};

const normalizeProbeHost = (host) => {
  if (!host || host === '0.0.0.0' || host === '::') return '127.0.0.1';
  return host;
};

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const parseListenUrl = (value) => {
  try {
    return new URL(value);
  } catch {
    return new URL('ws://127.0.0.1:40000');
  }
};

const formatListenUrl = (parsed, port) => {
  const protocol = parsed.protocol === 'wss:' ? 'wss:' : 'ws:';
  const normalizedHostname = parsed.hostname.replace(/^\[|\]$/g, '');
  const hostname = net.isIPv6(normalizedHostname) ? `[${normalizedHostname}]` : normalizedHostname;
  return `${protocol}//${hostname}:${port}`;
};

const isPortOpen = (host, port, timeoutMs = 350) =>
  new Promise((resolve) => {
    const socket = new net.Socket();
    let settled = false;

    const finalize = (value) => {
      if (settled) return;
      settled = true;
      socket.destroy();
      resolve(value);
    };

    socket.setTimeout(timeoutMs);
    socket.once('connect', () => finalize(true));
    socket.once('timeout', () => finalize(false));
    socket.once('error', () => finalize(false));
    socket.connect(port, host);
  });

const waitForPort = async (host, port, attempts = 10, delayMs = 200) => {
  for (let index = 0; index < attempts; index += 1) {
    if (await isPortOpen(host, port)) {
      return true;
    }
    await wait(delayMs);
  }
  return false;
};

const findAvailablePort = async (host, startPort, maxAttempts = 20) => {
  for (let offset = 1; offset <= maxAttempts; offset += 1) {
    const candidate = startPort + offset;
    if (candidate >= 65536) {
      break;
    }

    if (!(await isPortOpen(host, candidate))) {
      return candidate;
    }
  }

  return null;
};

const getCodexEndpoint = () => {
  const parsed = parseListenUrl(CODEX_LISTEN);
  return {
    host: normalizeProbeHost(parsed.hostname),
    port: parsePort(parsed.port, parsed.protocol === 'wss:' ? 443 : 80),
    displayUrl: `ws://${normalizeProbeHost(parsed.hostname)}:${parsePort(parsed.port, 40000)}`,
    parsed,
  };
};

const getUiEndpoint = () => {
  const port = parsePort(process.env.PORT, 1989);
  const host = normalizeProbeHost(process.env.UI_HOST || '127.0.0.1');
  return {
    host,
    port,
    displayUrl: `http://${host}:${port}`,
  };
};

const stopAll = (signal = 'SIGTERM') => {
  if (shuttingDown) return;
  shuttingDown = true;

  for (const child of children) {
    if (child && !child.killed) {
      child.kill(signal);
    }
  }
};

const startProcess = (name, command, envOverrides = {}) => {
  const child = spawn(command, {
    stdio: 'inherit',
    shell: true,
    env: {
      ...process.env,
      ...envOverrides,
    },
  });

  children.push(child);

  child.on('error', (err) => {
    logger.error(`${name} failed to start`, err);
    stopAll();
    process.exit(1);
  });

  child.on('exit', (code, signal) => {
    if (shuttingDown) {
      return;
    }

    const detail = signal ? `signal=${signal}` : `code=${code}`;
    logger.error(`${name} exited. Stopping remaining processes`, { detail });
    stopAll();
    process.exit(code ?? 1);
  });

  return child;
};

const resolveCodexLaunchPlan = async () => {
  const endpoint = getCodexEndpoint();
  const desiredPortOpen = await isPortOpen(endpoint.host, endpoint.port);

  if (desiredPortOpen && CODEX_REUSE_EXISTING) {
    return {
      endpoint,
      listenUrl: CODEX_LISTEN,
      spawnCodex: false,
      reusedExisting: true,
      reusedPort: endpoint.port,
      uiEnv: {
        CODEX_BACKEND_URL: endpoint.displayUrl,
      },
    };
  }

  if (!desiredPortOpen) {
    return {
      endpoint,
      listenUrl: CODEX_LISTEN,
      spawnCodex: true,
      reusedExisting: false,
      uiEnv: {
        CODEX_BACKEND_URL: endpoint.displayUrl,
      },
    };
  }

  const alternatePort = await findAvailablePort(endpoint.host, endpoint.port);
  if (!alternatePort) {
    throw new Error(
      `Port ${endpoint.port} is already in use and no alternate Codex port could be found.`,
    );
  }

  const alternateListenUrl = formatListenUrl(endpoint.parsed, alternatePort);
  return {
    endpoint: {
      ...endpoint,
      port: alternatePort,
      displayUrl: `ws://${endpoint.host}:${alternatePort}`,
    },
    listenUrl: alternateListenUrl,
    spawnCodex: true,
    reusedExisting: false,
    reusedPort: endpoint.port,
    uiEnv: {
      CODEX_BACKEND_URL: `ws://${endpoint.host}:${alternatePort}`,
    },
  };
};

async function main() {
  const codexPlan = await resolveCodexLaunchPlan();
  const codexEndpoint = codexPlan.endpoint;
  const uiEndpoint = getUiEndpoint();
  const uiAlreadyRunning = await isPortOpen(uiEndpoint.host, uiEndpoint.port);

  if (codexPlan.reusedExisting) {
    logger.info('Reusing existing Codex app-server', { target: codexEndpoint.displayUrl });
  } else {
    if (codexPlan.reusedPort) {
      logger.warn('Existing Codex app-server detected; starting a dedicated backend instead', {
        occupiedPort: codexPlan.reusedPort,
        dedicatedTarget: codexEndpoint.displayUrl,
        hint: 'Set CODEX_REUSE_EXISTING=1 to keep the old reuse behavior.',
      });
    } else {
      logger.info('Starting Codex app-server', { listen: codexPlan.listenUrl });
    }

    startProcess('codex', `codex app-server --listen ${codexPlan.listenUrl}`, codexPlan.uiEnv);
    const ready = await waitForPort(codexEndpoint.host, codexEndpoint.port);
    if (!ready) {
      logger.warn('Codex app-server did not open in time', { target: codexEndpoint.displayUrl });
    }
  }

  const shouldReuseUi = uiAlreadyRunning && (codexPlan.reusedExisting || UI_REUSE_EXISTING);

  if (shouldReuseUi) {
    logger.info('Reusing existing UI server', { target: uiEndpoint.displayUrl });
  } else {
    if (uiAlreadyRunning && !codexPlan.reusedExisting) {
      logger.warn(
        'Existing UI server detected; starting a fresh UI instance for the dedicated backend',
        {
          preferredTarget: uiEndpoint.displayUrl,
          hint: 'The new UI may use the fallback port if 1989 is occupied.',
        },
      );
    } else {
      logger.info('Starting UI server', { command: UI_COMMAND });
    }

    startProcess('ui', UI_COMMAND, codexPlan.uiEnv);
  }

  if (children.length === 0) {
    logger.info('Nothing new to start. Existing Codex and UI servers are already running.');
    process.exit(0);
  }
}

if (require.main === module) {
  process.on('SIGINT', () => {
    stopAll('SIGINT');
    process.exit(0);
  });

  process.on('SIGTERM', () => {
    stopAll('SIGTERM');
    process.exit(0);
  });

  void main().catch((error) => {
    logger.error(
      `Failed to start services: ${error instanceof Error ? error.message : String(error)}`,
    );
    stopAll();
    process.exit(1);
  });
}

module.exports = {
  findAvailablePort,
  formatListenUrl,
  getCodexEndpoint,
  getUiEndpoint,
  isPortOpen,
  normalizeProbeHost,
  parseListenUrl,
  parsePort,
  resolveCodexLaunchPlan,
  waitForPort,
};
