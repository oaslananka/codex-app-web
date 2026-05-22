'use strict';

const crypto = require('node:crypto');
const net = require('node:net');
const os = require('node:os');
const path = require('node:path');

const AUTH_COOKIE_NAME = 'codex_ui_token';
const DEFAULT_UI_HOST = '127.0.0.1';
const DEFAULT_PORT = 1989;
const DEFAULT_PORT_FALLBACK = 1990;
const DEFAULT_CODEX_BACKEND_URL = 'ws://127.0.0.1:40000';
const DEFAULT_MAX_WS_PAYLOAD_BYTES = 1_048_576;
const DEFAULT_MAX_BACKEND_WS_PAYLOAD_BYTES = 16_777_216;
const DEFAULT_MAX_UPLOAD_BYTES = 10_485_760;
const DEFAULT_MAX_WS_BUFFERED_BYTES = 1_048_576;
const EXCLUDED_LAN_INTERFACE_PREFIXES = [
  'br-',
  'docker',
  'veth',
  'tailscale',
  'virbr',
  'cni',
  'flannel',
];

const ALLOWED_IMAGE_EXTENSIONS = new Set([
  '.png',
  '.jpg',
  '.jpeg',
  '.gif',
  '.webp',
  '.bmp',
  '.ico',
  '.avif',
]);

const IMAGE_MIME_BY_EXTENSION = new Map([
  ['.png', 'image/png'],
  ['.jpg', 'image/jpeg'],
  ['.jpeg', 'image/jpeg'],
  ['.gif', 'image/gif'],
  ['.webp', 'image/webp'],
  ['.bmp', 'image/bmp'],
  ['.ico', 'image/x-icon'],
  ['.avif', 'image/avif'],
]);

function parsePort(value, fallback = DEFAULT_PORT) {
  const parsed = Number.parseInt(value ?? '', 10);
  return Number.isInteger(parsed) && parsed > 0 && parsed < 65_536 ? parsed : fallback;
}

function parsePositiveInt(value, fallback) {
  const parsed = Number.parseInt(value ?? '', 10);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

function parseNonNegativeInt(value, fallback) {
  const parsed = Number.parseInt(value ?? '', 10);
  return Number.isInteger(parsed) && parsed >= 0 ? parsed : fallback;
}

function parseCsv(value) {
  return String(value || '')
    .split(',')
    .map((entry) => entry.trim())
    .filter(Boolean);
}

function normalizeHost(value) {
  return String(value || '')
    .trim()
    .replace(/\.$/, '')
    .toLowerCase();
}

function normalizeOrigin(value) {
  if (!value) return '';
  try {
    const url = new URL(String(value));
    url.hostname = url.hostname.toLowerCase();
    return url.origin;
  } catch {
    return '';
  }
}

function loopbackHostsForPort(port) {
  return [`127.0.0.1:${port}`, `localhost:${port}`];
}

function loopbackOriginsForPort(port) {
  return [`http://127.0.0.1:${port}`, `http://localhost:${port}`];
}

let cachedLocalHostname;

function getLocalHostname() {
  if (cachedLocalHostname === undefined) {
    cachedLocalHostname = normalizeHost(os.hostname());
  }
  return cachedLocalHostname;
}

function isAllInterfacesHost(value) {
  const normalized = normalizeHost(value);
  return normalized === '0.0.0.0' || normalized === '::' || normalized === '[::]';
}

function hostnameFromHostHeader(value) {
  const normalized = normalizeHost(value);
  if (!normalized) return '';
  if (normalized.startsWith('[')) {
    const end = normalized.indexOf(']');
    return end > 0 ? normalized.slice(1, end) : '';
  }
  const colon = normalized.indexOf(':');
  return colon === -1 ? normalized : normalized.slice(0, colon);
}

function isPrivateLanIpv4(address) {
  return (
    /^10\./.test(address) ||
    /^192\.168\./.test(address) ||
    /^172\.(1[6-9]|2\d|3[0-1])\./.test(address)
  );
}

function isPrivateLanHostname(hostname) {
  const normalized = normalizeHost(hostname).replace(/^\[|\]$/g, '');
  if (!normalized) return false;

  if (net.isIPv4(normalized)) return isPrivateLanIpv4(normalized);
  if (net.isIPv6(normalized)) return false;

  const localHostname = getLocalHostname();
  return Boolean(
    localHostname &&
    (normalized === localHostname ||
      normalized === `${localHostname}.local` ||
      normalized === `${localHostname}.lan` ||
      normalized === `${localHostname}.home`),
  );
}

function detectDevLanCspHosts() {
  const hosts = new Set();
  for (const [name, entries] of Object.entries(os.networkInterfaces())) {
    if (EXCLUDED_LAN_INTERFACE_PREFIXES.some((prefix) => name.startsWith(prefix))) {
      continue;
    }

    for (const entry of entries ?? []) {
      if (entry.internal) continue;
      if (entry.family === 'IPv4' && isPrivateLanIpv4(entry.address)) {
        hosts.add(entry.address);
      }
    }
  }

  const localHostname = getLocalHostname();
  if (localHostname) {
    hosts.add(localHostname);
    hosts.add(`${localHostname}.local`);
    hosts.add(`${localHostname}.lan`);
    hosts.add(`${localHostname}.home`);
  }

  return [...hosts].sort();
}

function shouldAllowDevLanAddress(config) {
  return Boolean(config.devLanAccess && isAllInterfacesHost(config.uiHost));
}

function isDevLanHost(host, config) {
  return shouldAllowDevLanAddress(config) && isPrivateLanHostname(hostnameFromHostHeader(host));
}

function isDevLanOrigin(origin, config) {
  if (!shouldAllowDevLanAddress(config)) return false;
  try {
    const url = new URL(String(origin));
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return false;
    return isPrivateLanHostname(url.hostname);
  } catch {
    return false;
  }
}

function deriveCodexBackendUrl(env) {
  if (env.CODEX_BACKEND_URL) return env.CODEX_BACKEND_URL;
  if (env.CODEX_PATH) return `ws+unix://${env.CODEX_PATH}:`;
  const legacyHost = env.CODEX_HOST || '127.0.0.1';
  const legacyPort = parsePort(env.CODEX_PORT, 40_000);
  return `ws://${legacyHost}:${legacyPort}`;
}

function createLocalAccessConfig(env = process.env) {
  const serverPort = parsePort(env.PORT, DEFAULT_PORT);
  const fallbackPort = parsePort(env.PORT_FALLBACK, DEFAULT_PORT_FALLBACK);
  const defaultHosts = [...loopbackHostsForPort(serverPort), ...loopbackHostsForPort(fallbackPort)];
  const defaultOrigins = [
    ...loopbackOriginsForPort(serverPort),
    ...loopbackOriginsForPort(fallbackPort),
  ];
  const authToken =
    env.CODEX_UI_TOKEN || env.LOCAL_UI_TOKEN || crypto.randomBytes(32).toString('base64url');
  const devLanAccess = env.NODE_ENV !== 'production' && env.DEV_LAN_ACCESS === '1';

  return {
    uiHost: env.UI_HOST || DEFAULT_UI_HOST,
    serverPort,
    fallbackPort,
    codexBackendUrl: deriveCodexBackendUrl(env),
    authToken,
    authTokenGenerated: !env.CODEX_UI_TOKEN && !env.LOCAL_UI_TOKEN,
    allowedHosts: new Set(parseCsv(env.ALLOWED_HOSTS).map(normalizeHost).concat(defaultHosts)),
    allowedOrigins: new Set(
      parseCsv(env.ALLOWED_ORIGINS).map(normalizeOrigin).filter(Boolean).concat(defaultOrigins),
    ),
    maxWsPayloadBytes: parsePositiveInt(env.MAX_WS_PAYLOAD_BYTES, DEFAULT_MAX_WS_PAYLOAD_BYTES),
    maxBackendWsPayloadBytes: parsePositiveInt(
      env.MAX_BACKEND_WS_PAYLOAD_BYTES ?? env.MAX_CODEX_WS_PAYLOAD_BYTES,
      DEFAULT_MAX_BACKEND_WS_PAYLOAD_BYTES,
    ),
    maxUploadBytes: parsePositiveInt(
      env.MAX_UPLOAD_BYTES ?? env.UPLOAD_BODY_LIMIT_BYTES,
      DEFAULT_MAX_UPLOAD_BYTES,
    ),
    maxWsBufferedBytes: parsePositiveInt(env.MAX_WS_BUFFERED_BYTES, DEFAULT_MAX_WS_BUFFERED_BYTES),
    trustProxyHeaders: env.TRUST_PROXY_HEADERS === '1' || env.TRUST_PROXY === '1',
    devLanAccess,
    devLanCspHosts: devLanAccess ? detectDevLanCspHosts() : [],
  };
}

function buildAuthCookie(token, options = {}) {
  const encoded = encodeURIComponent(token);
  const parts = [
    `${AUTH_COOKIE_NAME}=${encoded}`,
    'Path=/',
    'HttpOnly',
    'SameSite=Strict',
    'Max-Age=86400',
  ];
  if (options.secure) parts.push('Secure');
  return parts.join('; ');
}

function parseCookies(header) {
  const cookies = new Map();
  for (const item of String(header || '').split(';')) {
    const index = item.indexOf('=');
    if (index === -1) continue;
    const name = item.slice(0, index).trim();
    const value = item.slice(index + 1).trim();
    if (!name) continue;
    cookies.set(name, decodeURIComponent(value));
  }
  return cookies;
}

function safeTokenEquals(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string' || !a || !b) return false;
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.byteLength === right.byteLength && crypto.timingSafeEqual(left, right);
}

function getBearerToken(header) {
  const value = String(header || '');
  const match = value.match(/^Bearer\s+(.+)$/i);
  return match?.[1]?.trim() || '';
}

function getRequestToken(req) {
  const bearer = getBearerToken(req.headers.authorization);
  if (bearer) return bearer;
  return parseCookies(req.headers.cookie).get(AUTH_COOKIE_NAME) || '';
}

function isAuthenticatedRequest(req, config) {
  return safeTokenEquals(getRequestToken(req), config.authToken);
}

function isAllowedHost(host, configOrAllowedHosts) {
  const normalized = normalizeHost(host);
  if (configOrAllowedHosts instanceof Set) {
    return configOrAllowedHosts.has(normalized);
  }
  return (
    configOrAllowedHosts.allowedHosts.has(normalized) ||
    isDevLanHost(normalized, configOrAllowedHosts)
  );
}

function isAllowedOrigin(origin, configOrAllowedOrigins) {
  const normalized = normalizeOrigin(origin);
  if (configOrAllowedOrigins instanceof Set) {
    return configOrAllowedOrigins.has(normalized);
  }
  return (
    configOrAllowedOrigins.allowedOrigins.has(normalized) ||
    isDevLanOrigin(origin, configOrAllowedOrigins)
  );
}

function pathFromRequestUrl(value) {
  try {
    return new URL(value || '/', 'http://127.0.0.1').pathname;
  } catch {
    return '/';
  }
}

function buildUpgradeRejection(statusCode, statusText = 'Rejected') {
  return `HTTP/1.1 ${statusCode} ${statusText}\r\nConnection: close\r\nContent-Length: 0\r\n\r\n`;
}

function validateUpgradeRequest(req, config, isRateLimited) {
  const pathname = pathFromRequestUrl(req.url);
  if (pathname !== '/ws') {
    return { ok: false, statusCode: 404, statusText: 'Not Found' };
  }
  if (req.method && req.method !== 'GET') {
    return { ok: false, statusCode: 405, statusText: 'Method Not Allowed' };
  }
  if (!isAllowedHost(req.headers.host, config)) {
    return { ok: false, statusCode: 403, statusText: 'Forbidden Host' };
  }
  if (!req.headers.origin || !isAllowedOrigin(req.headers.origin, config)) {
    return { ok: false, statusCode: 403, statusText: 'Forbidden Origin' };
  }
  if (!isAuthenticatedRequest(req, config)) {
    return { ok: false, statusCode: 401, statusText: 'Unauthorized' };
  }

  const clientIp = req.socket.remoteAddress || req.headers['x-forwarded-for'] || 'unknown';
  const rateKey = Array.isArray(clientIp) ? clientIp[0] : clientIp;
  if (isRateLimited(rateKey)) {
    return { ok: false, statusCode: 429, statusText: 'Too Many Requests' };
  }
  return { ok: true };
}

function isPlainObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function isValidJsonRpcId(value) {
  return (
    value === undefined ||
    value === null ||
    typeof value === 'string' ||
    (typeof value === 'number' && Number.isFinite(value))
  );
}

function isValidJsonRpcError(value) {
  return (
    isPlainObject(value) &&
    typeof value.code === 'number' &&
    Number.isFinite(value.code) &&
    typeof value.message === 'string'
  );
}

function isValidJsonRpcMessage(value) {
  if (!isPlainObject(value)) return false;
  if (value.jsonrpc !== undefined && value.jsonrpc !== '2.0') return false;
  if ('method' in value) {
    return (
      typeof value.method === 'string' &&
      value.method.length > 0 &&
      value.method.length <= 160 &&
      isValidJsonRpcId(value.id) &&
      (value.params === undefined ||
        value.params === null ||
        isPlainObject(value.params) ||
        Array.isArray(value.params))
    );
  }
  const hasResult = Object.prototype.hasOwnProperty.call(value, 'result');
  const hasError = Object.prototype.hasOwnProperty.call(value, 'error');
  return (
    isValidJsonRpcId(value.id) &&
    hasResult !== hasError &&
    (!hasError || isValidJsonRpcError(value.error))
  );
}

function isValidControlMessage(value) {
  return isPlainObject(value) && value.__ctrl === true && value.type === 'reconnect';
}

function webSocketPayloadByteLength(rawData) {
  if (Buffer.isBuffer(rawData)) return rawData.byteLength;
  if (Array.isArray(rawData)) {
    return rawData.reduce((total, item) => total + webSocketPayloadByteLength(item), 0);
  }
  if (rawData instanceof ArrayBuffer) return rawData.byteLength;
  if (ArrayBuffer.isView(rawData)) return rawData.byteLength;
  return Buffer.byteLength(String(rawData));
}

function webSocketPayloadToText(rawData) {
  if (Buffer.isBuffer(rawData)) return rawData.toString('utf8');
  if (Array.isArray(rawData)) return Buffer.concat(rawData).toString('utf8');
  if (rawData instanceof ArrayBuffer) return Buffer.from(rawData).toString('utf8');
  if (ArrayBuffer.isView(rawData)) {
    return Buffer.from(rawData.buffer, rawData.byteOffset, rawData.byteLength).toString('utf8');
  }
  return String(rawData);
}

function validateBrowserWsPayload(rawData, isBinary, config) {
  if (isBinary) {
    return { ok: false, closeCode: 1003, reason: 'Binary payloads are not supported' };
  }

  const bytes = webSocketPayloadByteLength(rawData);
  if (bytes > config.maxWsPayloadBytes) {
    return { ok: false, closeCode: 1009, reason: 'Payload too large', bytes };
  }

  const text = webSocketPayloadToText(rawData);
  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch {
    return { ok: false, closeCode: 1007, reason: 'Malformed JSON', bytes };
  }

  if (!isValidControlMessage(parsed) && !isValidJsonRpcMessage(parsed)) {
    return { ok: false, closeCode: 1008, reason: 'Invalid JSON-RPC payload', bytes };
  }

  return { ok: true, text, parsed, bytes };
}

function validateBackendWsPayload(rawData, isBinary, config) {
  if (isBinary) {
    return { ok: false, closeCode: 1003, reason: 'Backend binary payloads are not supported' };
  }

  const bytes = webSocketPayloadByteLength(rawData);
  const maxBackendBytes = config.maxBackendWsPayloadBytes ?? config.maxWsPayloadBytes;
  if (bytes > maxBackendBytes) {
    return { ok: false, closeCode: 1009, reason: 'Backend payload too large', bytes };
  }

  const text = webSocketPayloadToText(rawData);
  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch {
    return { ok: false, closeCode: 1007, reason: 'Malformed backend JSON', bytes };
  }

  if (!isValidJsonRpcMessage(parsed)) {
    return { ok: false, closeCode: 1008, reason: 'Invalid backend JSON-RPC payload', bytes };
  }

  return { ok: true, text, parsed, bytes };
}

function shouldReconnectBackend(code, browserSessionEnded) {
  return code !== 4001 && !browserSessionEnded;
}

function decodeBase64Payload(value, maxBytes) {
  const compact = String(value || '').replace(/\s+/g, '');
  if (!compact || compact.length > Math.ceil(maxBytes / 3) * 4 + 4) {
    return null;
  }
  if (!/^[A-Za-z0-9+/]+={0,2}$/.test(compact) || compact.length % 4 !== 0) {
    return null;
  }
  const buffer = Buffer.from(compact, 'base64');
  if (!buffer.byteLength || buffer.byteLength > maxBytes) {
    return null;
  }
  const normalizedInput = compact.replace(/=+$/, '');
  const normalizedOutput = buffer.toString('base64').replace(/=+$/, '');
  return normalizedInput === normalizedOutput ? buffer : null;
}

function isImagePayloadForExtension(ext, mimeType, buffer) {
  const expectedMime = IMAGE_MIME_BY_EXTENSION.get(ext);
  if (!expectedMime || String(mimeType).toLowerCase() !== expectedMime) {
    return false;
  }
  if (ext === '.png') {
    return buffer.subarray(0, 8).equals(Buffer.from('89504e470d0a1a0a', 'hex'));
  }
  if (ext === '.jpg' || ext === '.jpeg') {
    return buffer[0] === 0xff && buffer[1] === 0xd8;
  }
  if (ext === '.gif') {
    const signature = buffer.subarray(0, 6).toString('ascii');
    return signature === 'GIF87a' || signature === 'GIF89a';
  }
  if (ext === '.webp') {
    return (
      buffer.subarray(0, 4).toString('ascii') === 'RIFF' &&
      buffer.subarray(8, 12).toString('ascii') === 'WEBP'
    );
  }
  if (ext === '.bmp') return buffer.subarray(0, 2).toString('ascii') === 'BM';
  if (ext === '.ico') return buffer.subarray(0, 4).equals(Buffer.from([0x00, 0x00, 0x01, 0x00]));
  if (ext === '.avif') return buffer.subarray(4, 12).toString('ascii') === 'ftypavif';
  return false;
}

function createUploadFileName(originalName) {
  const safeName = path
    .basename(String(originalName || 'upload.bin'))
    .replace(/[^a-zA-Z0-9._-]/g, '_');
  return {
    safeName,
    extension: path.extname(safeName).toLowerCase(),
  };
}

function cspConnectSources(config) {
  const sources = new Set(["'self'"]);
  for (const origin of config.allowedOrigins) {
    sources.add(origin);
    if (origin.startsWith('http://')) sources.add(`ws://${origin.slice('http://'.length)}`);
    if (origin.startsWith('https://')) sources.add(`wss://${origin.slice('https://'.length)}`);
  }
  if (shouldAllowDevLanAddress(config)) {
    for (const host of config.devLanCspHosts ?? []) {
      sources.add(`http://${host}:${config.serverPort}`);
      sources.add(`ws://${host}:${config.serverPort}`);
      sources.add(`http://${host}:${config.fallbackPort}`);
      sources.add(`ws://${host}:${config.fallbackPort}`);
    }
  }
  return [...sources];
}

function buildCspDirectives(config, isDev) {
  return {
    defaultSrc: ["'self'"],
    baseUri: ["'none'"],
    objectSrc: ["'none'"],
    frameAncestors: ["'none'"],
    imgSrc: ["'self'", 'data:', 'blob:'],
    fontSrc: ["'self'", 'data:'],
    styleSrc: ["'self'", "'unsafe-inline'"],
    scriptSrc: isDev
      ? ["'self'", "'unsafe-inline'", "'unsafe-eval'"]
      : ["'self'", "'unsafe-inline'"],
    connectSrc: cspConnectSources(config),
    upgradeInsecureRequests: null,
  };
}

function firstHeaderValue(value) {
  if (Array.isArray(value)) return String(value[0] || '');
  return String(value || '');
}

function isSecureRequest(req, config) {
  if (req?.socket?.encrypted) {
    return true;
  }
  if (!config.trustProxyHeaders) {
    return false;
  }
  const forwardedProto = firstHeaderValue(req?.headers?.['x-forwarded-proto'])
    .split(',')[0]
    .trim()
    .toLowerCase();
  return forwardedProto === 'https';
}

module.exports = {
  ALLOWED_IMAGE_EXTENSIONS,
  AUTH_COOKIE_NAME,
  DEFAULT_CODEX_BACKEND_URL,
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
  normalizeOrigin,
  parseNonNegativeInt,
  parsePort,
  parsePositiveInt,
  pathFromRequestUrl,
  shouldReconnectBackend,
  validateBackendWsPayload,
  validateBrowserWsPayload,
  validateUpgradeRequest,
  webSocketPayloadByteLength,
};
