#!/usr/bin/env node
/**
 * codex-app-web server
 * - Fastify: API endpoints + security/rate limit
 * - Next.js: frontend rendering (App Router)
 * - WebSocket proxy: browser <-> Codex app server
 *
 * Environment variables:
 *   UI_HOST     — UI listen host (default: 127.0.0.1)
 *   CODEX_BACKEND_URL — Codex app server WebSocket URL (default: ws://127.0.0.1:40000)
 *   PORT        — Preferred port to listen on (default: 1989)
 *   PORT_FALLBACK — Fallback port if preferred port is unavailable (default: 1990)
 *   RATE_LIMIT_MAX — Max requests per window for each IP (default: 120)
 *   RATE_LIMIT_TIME_WINDOW_MS — Rate limit window in milliseconds (default: 60000)
 */

'use strict';

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');
const Fastify = require('fastify');
const fastifyHelmet = require('@fastify/helmet');
const fastifyRateLimit = require('@fastify/rate-limit');
const next = require('next');
const { WebSocketServer, WebSocket } = require('ws');
const { createRateLimiter } = require('./src/lib/rate-limit.cjs');
const {
  hasStaleNextBuildArtifacts,
  resolveNextRuntimeMode,
} = require('./src/lib/next-runtime.cjs');
const { createNodeLogger } = require('./src/lib/logging/node-logger.cjs');
const {
  ALLOWED_IMAGE_EXTENSIONS,
  buildAuthCookie,
  buildCspDirectives,
  buildUpgradeRejection,
  createLocalAccessConfig,
  createUploadFileName,
  decodeBase64Payload,
  isAllowedHost,
  isAllowedOrigin,
  isAuthenticatedRequest,
  isImagePayloadForExtension,
  isSecureRequest,
  parseNonNegativeInt,
  parsePort,
  parsePositiveInt,
  pathFromRequestUrl,
  shouldReconnectBackend,
  validateBackendWsPayload,
  validateBrowserWsPayload,
  validateUpgradeRequest,
} = require('./src/lib/server/security.cjs');
const {
  cleanupStaleUploadChildren,
  cleanupStaleUploadDirs,
  createUploadRuntime,
  ensureUploadDir,
  removePathInsideRoot,
} = require('./src/lib/server/uploads.cjs');

const logger = createNodeLogger('server');
const connectionLogger = logger.child('connection');

// ── Configuration ────────────────────────────────────────────────────────────
const accessConfig = createLocalAccessConfig(process.env);
const UI_HOST = accessConfig.uiHost;
const CODEX_BACKEND_URL = accessConfig.codexBackendUrl;
const SERVER_PORT = accessConfig.serverPort;
const FALLBACK_PORT = accessConfig.fallbackPort;
const RATE_LIMIT_MAX = parsePositiveInt(process.env.RATE_LIMIT_MAX, 120);
const RATE_LIMIT_TIME_WINDOW_MS = parsePositiveInt(process.env.RATE_LIMIT_TIME_WINDOW_MS, 60_000);
const UPLOAD_BODY_LIMIT_BYTES = accessConfig.maxUploadBytes;
const NODE_ENV = process.env.NODE_ENV || 'production';
const MAX_BROWSER_BUFFER_BYTES = accessConfig.maxWsBufferedBytes;
const UPLOAD_MAX_AGE_MS = 60 * 60 * 1000; // 1 hour
const MAX_CODEX_RECONNECT_DELAY_MS = 30_000;
const WS_HEARTBEAT_INTERVAL_MS = parseNonNegativeInt(process.env.WS_HEARTBEAT_INTERVAL_MS, 30_000);
const uploadRuntime = createUploadRuntime();
const UPLOADS_DIR = uploadRuntime.uploadDir;
const UPLOADS_ROOT = uploadRuntime.rootDir;
const RESOLVED_UPLOADS_DIR = uploadRuntime.resolvedUploadDir;
const requiredNextBuildArtifacts = [
  path.join(__dirname, '.next', 'BUILD_ID'),
  path.join(__dirname, '.next', 'prerender-manifest.json'),
];
const buildMarkerPath = requiredNextBuildArtifacts[0];
const hasBuildArtifacts = requiredNextBuildArtifacts.every((artifactPath) =>
  fs.existsSync(artifactPath),
);
const hasStaleBuildArtifacts =
  hasBuildArtifacts &&
  hasStaleNextBuildArtifacts({
    rootDir: __dirname,
    buildMarkerPath,
  });
const runtimeMode = resolveNextRuntimeMode({
  nodeEnv: NODE_ENV,
  hasBuildArtifacts,
  hasStaleBuildArtifacts,
  allowDevFallback: process.env.ALLOW_NEXT_DEV_FALLBACK === '1',
});
const IS_DEV = runtimeMode.dev;
let activeServerPort = SERVER_PORT;
const isRecoverableListenError = (err) => err.code === 'EADDRINUSE' || err.code === 'EACCES';
const isWebSocketRateLimited = createRateLimiter({
  max: RATE_LIMIT_MAX,
  windowMs: RATE_LIMIT_TIME_WINDOW_MS,
});

const isPrivateIpv4 = (address) =>
  /^10\./.test(address) ||
  /^192\.168\./.test(address) ||
  /^172\.(1[6-9]|2\d|3[0-1])\./.test(address);

const getLanAddresses = () => {
  const excludedPrefixes = ['br-', 'docker', 'veth', 'tailscale', 'virbr', 'cni', 'flannel'];
  const addresses = new Set();

  for (const [name, entries] of Object.entries(os.networkInterfaces())) {
    if (excludedPrefixes.some((prefix) => name.startsWith(prefix))) {
      continue;
    }

    for (const entry of entries ?? []) {
      if (entry.family !== 'IPv4' || entry.internal || !isPrivateIpv4(entry.address)) {
        continue;
      }

      addresses.add(entry.address);
    }
  }

  return [...addresses];
};

if (runtimeMode.fatal) {
  logger.error(runtimeMode.message);
  process.exit(1);
}

if (runtimeMode.reason === 'missing-build-artifacts-dev-fallback') {
  logger.warn(
    '[!] Next build artifacts not found. ALLOW_NEXT_DEV_FALLBACK=1 enabled development mode.',
  );
}

if (runtimeMode.reason === 'stale-build-artifacts-dev-fallback') {
  logger.warn(
    '[!] Next build artifacts are stale compared to source files. ALLOW_NEXT_DEV_FALLBACK=1 enabled development mode.',
  );
}

const cspDirectives = buildCspDirectives(accessConfig, IS_DEV);

// ── Fastify app ──────────────────────────────────────────────────────────────
const app = Fastify({
  logger: false,
  disableRequestLogging: true,
  bodyLimit: UPLOAD_BODY_LIMIT_BYTES,
});
const webApp = next({
  dev: IS_DEV,
  dir: __dirname,
  hostname: UI_HOST,
  port: SERVER_PORT,
  httpServer: app.server,
});
const handleNext = webApp.getRequestHandler();

app.register(fastifyHelmet, {
  global: true,
  contentSecurityPolicy: {
    directives: cspDirectives,
  },
  crossOriginOpenerPolicy: IS_DEV ? false : undefined,
  crossOriginEmbedderPolicy: false,
  originAgentCluster: IS_DEV ? false : undefined,
  xFrameOptions: { action: 'deny' },
});

const rateLimitConfig = {
  max: RATE_LIMIT_MAX,
  timeWindow: RATE_LIMIT_TIME_WINDOW_MS,
};

app.register(fastifyRateLimit, {
  global: true,
  ...rateLimitConfig,
  keyGenerator: (req) => req.ip || 'unknown',
});

const validateAllowedHttpHost = async (req, reply) => {
  if (!isAllowedHost(req.headers.host, accessConfig)) {
    return reply.code(403).send({ error: 'Forbidden host' });
  }
};

const requirePrivilegedApiAccess = async (req, reply) => {
  const hostResult = await validateAllowedHttpHost(req, reply);
  if (hostResult) {
    return hostResult;
  }

  const pathname = pathFromRequestUrl(req.raw.url);
  if (pathname === '/api/health') {
    return;
  }

  if (req.headers.origin && !isAllowedOrigin(req.headers.origin, accessConfig)) {
    return reply.code(403).send({ error: 'Forbidden origin' });
  }

  if (!isAuthenticatedRequest(req.raw, accessConfig)) {
    return reply.code(401).send({ error: 'Authentication required' });
  }
};

const registerApiRoutes = async () => {
  await cleanupStaleUploadDirs(UPLOADS_ROOT, UPLOAD_MAX_AGE_MS);
  ensureUploadDir(UPLOADS_DIR, uploadRuntime);

  app.register(
    async function apiRoutes(api) {
      api.get(
        '/health',
        {
          config: {
            rateLimit: rateLimitConfig,
          },
          preHandler: validateAllowedHttpHost,
        },
        async () => {
          return {
            status: 'ok',
          };
        },
      );

      api.get(
        '/config',
        {
          config: {
            rateLimit: rateLimitConfig,
          },
          preHandler: requirePrivilegedApiAccess,
        },
        async () => {
          return {
            auth: { type: 'same-site-cookie' },
            server: {
              host: UI_HOST,
              port: activeServerPort,
            },
            limits: {
              maxUploadBytes: UPLOAD_BODY_LIMIT_BYTES,
              maxWebSocketPayloadBytes: accessConfig.maxWsPayloadBytes,
            },
          };
        },
      );

      api.post(
        '/uploads',
        {
          bodyLimit: UPLOAD_BODY_LIMIT_BYTES,
          config: {
            rateLimit: {
              max: Math.max(1, Math.min(RATE_LIMIT_MAX, 30)),
              timeWindow: RATE_LIMIT_TIME_WINDOW_MS,
            },
          },
          preHandler: requirePrivilegedApiAccess,
        },
        // The route is protected by @fastify/rate-limit via the route config above.
        // lgtm[js/missing-rate-limiting]
        async (req, reply) => {
          const body = req.body && typeof req.body === 'object' ? req.body : null;
          const { safeName, extension: ext } = createUploadFileName(body?.name || 'upload.bin');
          const mimeType = String(body?.mimeType || '');
          const dataBase64 = typeof body?.dataBase64 === 'string' ? body.dataBase64 : '';

          if (!safeName || !dataBase64) {
            reply.code(400);
            return { error: 'name and dataBase64 are required' };
          }

          if (!mimeType.startsWith('image/')) {
            reply.code(400);
            return { error: 'Only image uploads are supported' };
          }

          const buffer = decodeBase64Payload(dataBase64, UPLOAD_BODY_LIMIT_BYTES);
          if (!buffer) {
            reply.code(400);
            return { error: 'Invalid base64 payload or upload size' };
          }

          if (!ALLOWED_IMAGE_EXTENSIONS.has(ext)) {
            reply.code(400);
            return { error: `Unsupported image extension: ${ext}` };
          }
          if (!isImagePayloadForExtension(ext, mimeType, buffer)) {
            reply.code(400);
            return { error: 'Image payload does not match declared type' };
          }
          const uploadPath = path.resolve(
            UPLOADS_DIR,
            `${Date.now()}-${crypto.randomUUID()}${ext}`,
          );
          if (!uploadPath.startsWith(`${RESOLVED_UPLOADS_DIR}${path.sep}`)) {
            reply.code(400);
            return { error: 'Invalid upload path' };
          }
          // codeql[js/http-to-file-access]
          fs.writeFileSync(uploadPath, buffer, { mode: 0o600, flag: 'wx' });

          return {
            ok: true,
            name: safeName,
            mimeType,
            size: buffer.byteLength,
            path: uploadPath,
          };
        },
      );
    },
    { prefix: '/api' },
  );
};

// ── WebSocket proxy server ────────────────────────────────────────────────────
const wss = new WebSocketServer({
  noServer: true,
  maxPayload: accessConfig.maxWsPayloadBytes,
});

wss.on('error', (err) => {
  if (isRecoverableListenError(err)) {
    return;
  }
  logger.error('WebSocket server error', err);
});

app.server.on('upgrade', (req, socket, head) => {
  if (IS_DEV && pathFromRequestUrl(req.url) === '/_next/webpack-hmr') {
    return;
  }

  const validation = validateUpgradeRequest(req, accessConfig, isWebSocketRateLimited);
  if (!validation.ok) {
    socket.write(buildUpgradeRejection(validation.statusCode, validation.statusText));
    socket.destroy();
    return;
  }

  wss.handleUpgrade(req, socket, head, (ws) => {
    wss.emit('connection', ws, req);
  });
});

wss.on('connection', (browserWs, req) => {
  const clientIp = req.socket.remoteAddress;
  connectionLogger.info('Browser connected', { clientIp });

  let codexWs = null;
  let reconnectTimer = null;
  let browserBuffer = []; // messages queued before codex is ready
  let browserBufferBytes = 0;
  let codexConnectionId = 0;
  let reconnectAttempt = 0;
  let browserClosing = false;
  let browserAlive = true;
  let backendAlive = true;
  let backendPingPending = false;
  let heartbeatTimer = null;

  // Helper: send JSON to browser
  const sendBrowser = (obj) => {
    if (browserWs.readyState === WebSocket.OPEN) {
      browserWs.send(typeof obj === 'string' ? obj : JSON.stringify(obj));
    }
  };

  // Internal control messages (not JSON-RPC)
  const ctrl = (type, data = {}) => sendBrowser({ __ctrl: true, type, ...data });

  const clearReconnectTimer = () => {
    if (reconnectTimer) {
      clearTimeout(reconnectTimer);
      reconnectTimer = null;
    }
  };

  const closeBothSockets = (code, reason) => {
    if (codexWs && codexWs.readyState !== WebSocket.CLOSED) {
      codexWs.close(code, reason);
    }
    if (browserWs.readyState === WebSocket.OPEN || browserWs.readyState === WebSocket.CONNECTING) {
      browserWs.close(code, reason);
    }
  };

  const stopHeartbeat = () => {
    if (heartbeatTimer) {
      globalThis.clearInterval(heartbeatTimer);
      heartbeatTimer = null;
    }
  };

  browserWs.on('pong', () => {
    browserAlive = true;
  });

  const startHeartbeat = () => {
    if (heartbeatTimer || WS_HEARTBEAT_INTERVAL_MS <= 0) {
      return;
    }
    heartbeatTimer = setInterval(() => {
      if (!browserAlive) {
        connectionLogger.warn('Browser websocket heartbeat failed; terminating session');
        stopHeartbeat();
        if (codexWs) codexWs.terminate();
        browserWs.terminate();
        return;
      }

      if (codexWs && codexWs.readyState === WebSocket.OPEN && backendPingPending && !backendAlive) {
        connectionLogger.warn('Codex backend heartbeat failed; closing session');
        stopHeartbeat();
        closeBothSockets(1011, 'Backend heartbeat failed');
        return;
      }

      browserAlive = false;
      if (browserWs.readyState === WebSocket.OPEN) {
        browserWs.ping();
      }

      if (codexWs && codexWs.readyState === WebSocket.OPEN) {
        backendAlive = false;
        backendPingPending = true;
        codexWs.ping();
      }
    }, WS_HEARTBEAT_INTERVAL_MS);
  };

  const scheduleReconnect = () => {
    if (reconnectTimer || browserWs.readyState !== WebSocket.OPEN) {
      return;
    }

    const baseDelay = Math.min(
      1500 * Math.pow(1.5, reconnectAttempt),
      MAX_CODEX_RECONNECT_DELAY_MS,
    );
    const jitter = Math.random() * 500;
    const delay = baseDelay + jitter;
    reconnectAttempt++;

    reconnectTimer = setTimeout(() => {
      reconnectTimer = null;
      if (browserWs.readyState === WebSocket.OPEN && !codexWs) {
        connectCodex();
      }
    }, delay);
  };

  // ── Connect to Codex ────────────────────────────────────────────────────
  const connectCodex = () => {
    if (
      codexWs &&
      (codexWs.readyState === WebSocket.CONNECTING || codexWs.readyState === WebSocket.OPEN)
    ) {
      return;
    }

    clearReconnectTimer();

    const wsUrl = CODEX_BACKEND_URL;
    const connectionId = ++codexConnectionId;

    connectionLogger.info('Connecting to Codex backend', { wsUrl });
    ctrl('connecting', { url: wsUrl });

    try {
      codexWs = new WebSocket(wsUrl, {
        handshakeTimeout: 5000,
        maxPayload: accessConfig.maxBackendWsPayloadBytes,
        perMessageDeflate: false,
      });
    } catch (err) {
      ctrl('error', { message: `Failed to create connection: ${err.message}` });
      return;
    }

    const currentCodexWs = codexWs;

    currentCodexWs.on('open', () => {
      if (codexWs !== currentCodexWs || connectionId !== codexConnectionId) {
        return;
      }
      connectionLogger.info('Codex backend connected');
      backendAlive = true;
      backendPingPending = false;
      reconnectAttempt = 0;
      clearReconnectTimer();
      ctrl('connected', { url: wsUrl });

      // Flush buffered messages
      for (const msg of browserBuffer) {
        currentCodexWs.send(msg);
      }
      browserBuffer = [];
      browserBufferBytes = 0;
    });

    currentCodexWs.on('pong', () => {
      if (codexWs === currentCodexWs && connectionId === codexConnectionId) {
        backendAlive = true;
        backendPingPending = false;
      }
    });

    currentCodexWs.on('message', (data, isBinary) => {
      if (codexWs !== currentCodexWs || connectionId !== codexConnectionId) {
        return;
      }
      const validation = validateBackendWsPayload(data, isBinary, accessConfig);
      if (!validation.ok) {
        connectionLogger.warn('Rejected backend websocket payload', {
          closeCode: validation.closeCode,
          reason: validation.reason,
          bytes: validation.bytes,
        });
        currentCodexWs.close(validation.closeCode, validation.reason);
        browserWs.close(validation.closeCode, validation.reason);
        return;
      }
      sendBrowser(validation.text);
    });

    currentCodexWs.on('error', (err) => {
      if (codexWs !== currentCodexWs || connectionId !== codexConnectionId) {
        return;
      }
      connectionLogger.error('Codex websocket error', err);
      ctrl('error', { message: err.message });
    });

    currentCodexWs.on('close', (code, reason) => {
      if (codexWs !== currentCodexWs || connectionId !== codexConnectionId) {
        return;
      }
      const closeDetails = {
        code,
        reason: reason.toString(),
      };
      const browserSessionEnded = browserClosing || browserWs.readyState !== WebSocket.OPEN;
      if (browserSessionEnded) {
        connectionLogger.info(
          'Codex backend disconnected after browser session ended',
          closeDetails,
        );
      } else {
        connectionLogger.warn('Codex backend disconnected', closeDetails);
      }
      codexWs = null;
      backendAlive = true;
      backendPingPending = false;
      if (shouldReconnectBackend(code, browserSessionEnded)) {
        ctrl('disconnected', { code, reason: reason.toString() });
        scheduleReconnect();
      }
    });
  };

  connectCodex();
  startHeartbeat();

  // ── Browser → Codex ──────────────────────────────────────────────────────
  browserWs.on('message', (rawData, isBinary) => {
    const validation = validateBrowserWsPayload(rawData, isBinary, accessConfig);
    if (!validation.ok) {
      browserWs.close(validation.closeCode, validation.reason);
      return;
    }

    const data = validation.text;
    const parsed = validation.parsed;

    // Intercept internal control commands from the UI
    if (parsed.__ctrl) {
      if (parsed.type === 'reconnect') {
        clearReconnectTimer();
        reconnectAttempt = 0;
        const previousCodexWs = codexWs;
        codexWs = null;
        if (previousCodexWs && previousCodexWs.readyState !== WebSocket.CLOSED) {
          previousCodexWs.close(4001, 'manual-reconnect');
        }
        connectCodex();
      }
      return;
    }

    if (codexWs && codexWs.readyState === WebSocket.OPEN) {
      codexWs.send(data);
    } else {
      const nextBufferedBytes = browserBufferBytes + validation.bytes;
      if (nextBufferedBytes > MAX_BROWSER_BUFFER_BYTES) {
        connectionLogger.warn('Browser buffer byte limit exceeded; closing connection');
        browserWs.close(1009, 'Buffered payload too large');
        return;
      }
      browserBuffer.push(data);
      browserBufferBytes = nextBufferedBytes;
    }
  });

  browserWs.on('close', () => {
    connectionLogger.info('Browser disconnected');
    browserClosing = true;
    clearReconnectTimer();
    stopHeartbeat();
    reconnectAttempt = 0;
    if (codexWs) codexWs.close();
  });

  browserWs.on('error', (err) => {
    connectionLogger.error('Browser websocket error', err);
  });
});

const renderBanner = (port) => {
  const lanAddresses = process.env.SHOW_LAN_URLS === '1' ? getLanAddresses() : [];
  const displayHost = UI_HOST === '0.0.0.0' || UI_HOST === '::' ? '127.0.0.1' : UI_HOST;
  logger.info('codex-app-web ready', { url: `http://${displayHost}:${port}` });
  for (const lanAddress of lanAddresses) {
    logger.info('LAN address available', { url: `http://${lanAddress}:${port}` });
  }
  logger.info('Codex backend target configured');
};

const startListening = async (port) => {
  try {
    const address = await app.listen({ port, host: UI_HOST });
    const maybePort = Number.parseInt(address.split(':').at(-1), 10);
    activeServerPort = Number.isFinite(maybePort) ? maybePort : port;
    renderBanner(activeServerPort);
  } catch (err) {
    if (port !== FALLBACK_PORT && isRecoverableListenError(err)) {
      logger.warn(
        `\n[!] Port ${port} kullanilamadi (${err.code}). ${FALLBACK_PORT} deneniyor...\n`,
      );
      return startListening(FALLBACK_PORT);
    }

    if (err.code === 'EADDRINUSE') {
      logger.error(`Port ${port} zaten kullanimda.`);
    } else {
      logger.error('Server error', err);
    }
    process.exit(1);
  }
};

const registerNextRoutes = () => {
  app.all(
    '/*',
    {
      config: {
        rateLimit: {
          max: RATE_LIMIT_MAX,
          timeWindow: RATE_LIMIT_TIME_WINDOW_MS,
        },
      },
      preHandler: validateAllowedHttpHost,
    },
    // Rate limiting is enforced globally and repeated in this route config.
    // lgtm[js/missing-rate-limiting]
    async (req, reply) => {
      reply.raw.setHeader(
        'Set-Cookie',
        buildAuthCookie(accessConfig.authToken, {
          secure: isSecureRequest(req.raw, accessConfig),
        }),
      );
      await handleNext(req.raw, reply.raw);
      reply.hijack();
    },
  );
};

const bootstrap = async () => {
  await webApp.prepare();
  await registerApiRoutes();
  registerNextRoutes();
  await startListening(SERVER_PORT);
};

bootstrap().catch((err) => {
  logger.error('Startup error', err);
  process.exit(1);
});

let cleanupUploadsInFlight = false;
const cleanupUploads = async () => {
  if (cleanupUploadsInFlight) {
    return;
  }
  cleanupUploadsInFlight = true;
  try {
    await cleanupStaleUploadDirs(
      UPLOADS_ROOT,
      UPLOAD_MAX_AGE_MS,
      Date.now(),
      new Set([UPLOADS_DIR]),
    );
    await cleanupStaleUploadChildren(UPLOADS_DIR, UPLOAD_MAX_AGE_MS);
  } catch (err) {
    logger.warn('Upload temp cleanup failed', {
      message: err instanceof Error ? err.message : String(err),
    });
  } finally {
    cleanupUploadsInFlight = false;
  }
};

const cleanupUploadTimer = setInterval(
  () => {
    void cleanupUploads();
  },
  15 * 60 * 1000,
);

const shutdown = async (signal) => {
  globalThis.clearInterval(cleanupUploadTimer);
  try {
    await app.close();
  } catch (err) {
    logger.warn('Server close failed during shutdown', {
      signal,
      message: err instanceof Error ? err.message : String(err),
    });
  }
  try {
    removePathInsideRoot(UPLOADS_DIR, UPLOADS_ROOT);
  } catch (err) {
    logger.warn('Upload directory cleanup failed during shutdown', {
      signal,
      message: err instanceof Error ? err.message : String(err),
    });
  }
  process.exit(0);
};

process.once('SIGINT', () => {
  void shutdown('SIGINT');
});

process.once('SIGTERM', () => {
  void shutdown('SIGTERM');
});
