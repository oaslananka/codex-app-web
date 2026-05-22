import { createRequire } from 'node:module';
import os from 'node:os';
import { describe, expect, it } from 'vitest';

const require = createRequire(import.meta.url);
const security = require('../../src/lib/server/security.cjs') as Record<string, any>;

const token = 'test-token-123';

function wsRequest(overrides: Record<string, unknown> = {}) {
  return {
    url: '/ws',
    method: 'GET',
    headers: {
      host: '127.0.0.1:1989',
      origin: 'http://127.0.0.1:1989',
      cookie: `codex_ui_token=${token}`,
    },
    socket: { remoteAddress: '127.0.0.1' },
    ...overrides,
  };
}

describe('server security helpers', () => {
  it('uses loopback-only defaults for the local control plane', () => {
    const config = security.createLocalAccessConfig({ PORT: '1989', CODEX_UI_TOKEN: token });

    expect(config.uiHost).toBe('127.0.0.1');
    expect(config.codexBackendUrl).toBe('ws://127.0.0.1:40000');
    expect(config.allowedHosts.has('127.0.0.1:1989')).toBe(true);
    expect(config.allowedOrigins.has('http://127.0.0.1:1989')).toBe(true);
    expect(config.maxWsPayloadBytes).toBe(1_048_576);
    expect(config.maxBackendWsPayloadBytes).toBe(16_777_216);
    expect(config.maxUploadBytes).toBe(10_485_760);
    expect(security.ALLOWED_IMAGE_EXTENSIONS.has('.svg')).toBe(false);
  });

  it('builds a strict local auth cookie without writing a static secret', () => {
    expect(security.buildAuthCookie(token)).toBe(
      'codex_ui_token=test-token-123; Path=/; HttpOnly; SameSite=Strict; Max-Age=86400',
    );
  });

  it('allows WebSocket upgrades with a valid host, origin, and token', () => {
    const config = security.createLocalAccessConfig({ PORT: '1989', CODEX_UI_TOKEN: token });

    expect(security.validateUpgradeRequest(wsRequest(), config, () => false)).toEqual({ ok: true });
  });

  it('denies invalid WebSocket origins, hosts, and tokens', () => {
    const config = security.createLocalAccessConfig({ PORT: '1989', CODEX_UI_TOKEN: token });

    expect(
      security.validateUpgradeRequest(
        wsRequest({ headers: { host: '127.0.0.1:1989', origin: 'http://evil.test' } }),
        config,
        () => false,
      ),
    ).toMatchObject({ ok: false, statusCode: 403 });

    expect(
      security.validateUpgradeRequest(
        wsRequest({ headers: { host: '192.168.1.9:1989', origin: 'http://127.0.0.1:1989' } }),
        config,
        () => false,
      ),
    ).toMatchObject({ ok: false, statusCode: 403 });

    expect(
      security.validateUpgradeRequest(
        wsRequest({
          headers: {
            host: '127.0.0.1:1989',
            origin: 'http://127.0.0.1:1989',
            cookie: 'codex_ui_token=wrong',
          },
        }),
        config,
        () => false,
      ),
    ).toMatchObject({ ok: false, statusCode: 401 });
  });

  it('does not treat LAN URL display as Host or Origin authorization', () => {
    const config = security.createLocalAccessConfig({
      PORT: '1989',
      UI_HOST: '0.0.0.0',
      SHOW_LAN_URLS: '1',
      CODEX_UI_TOKEN: token,
      NODE_ENV: 'development',
    });

    expect(
      security.validateUpgradeRequest(
        wsRequest({
          headers: {
            host: '192.168.1.9:1989',
            origin: 'http://192.168.1.9:1989',
            cookie: `codex_ui_token=${token}`,
          },
        }),
        config,
        () => false,
      ),
    ).toMatchObject({ ok: false, statusCode: 403 });
  });

  it('allows private LAN Host and Origin values only in explicit development LAN mode', () => {
    const config = security.createLocalAccessConfig({
      PORT: '1989',
      UI_HOST: '0.0.0.0',
      DEV_LAN_ACCESS: '1',
      CODEX_UI_TOKEN: token,
      NODE_ENV: 'development',
    });

    expect(
      security.validateUpgradeRequest(
        wsRequest({
          headers: {
            host: '192.168.1.9:1989',
            origin: 'http://192.168.1.9:1989',
            cookie: `codex_ui_token=${token}`,
          },
        }),
        config,
        () => false,
      ),
    ).toEqual({ ok: true });

    expect(
      security.validateUpgradeRequest(
        wsRequest({
          headers: {
            host: '8.8.8.8:1989',
            origin: 'http://8.8.8.8:1989',
            cookie: `codex_ui_token=${token}`,
          },
        }),
        config,
        () => false,
      ),
    ).toMatchObject({ ok: false, statusCode: 403 });

    const hostname = os.hostname().toLowerCase();
    expect(
      security.validateUpgradeRequest(
        wsRequest({
          headers: {
            host: `${hostname}.attacker.test:1989`,
            origin: `http://${hostname}.attacker.test:1989`,
            cookie: `codex_ui_token=${token}`,
          },
        }),
        config,
        () => false,
      ),
    ).toMatchObject({ ok: false, statusCode: 403 });

    expect(
      security.validateUpgradeRequest(
        wsRequest({
          headers: {
            host: '[fe80::1]:1989',
            origin: 'http://[fe80::1]:1989',
            cookie: `codex_ui_token=${token}`,
          },
        }),
        config,
        () => false,
      ),
    ).toMatchObject({ ok: false, statusCode: 403 });

    const directives = security.buildCspDirectives(config, true);
    expect(directives.connectSrc).not.toContain('http://*:1989');
    expect(directives.connectSrc).not.toContain('ws://*:1989');
    expect(directives.connectSrc.some((source: string) => source.includes('://['))).toBe(false);
  });

  it('ignores development LAN access in production mode', () => {
    const config = security.createLocalAccessConfig({
      PORT: '1989',
      UI_HOST: '0.0.0.0',
      DEV_LAN_ACCESS: '1',
      CODEX_UI_TOKEN: token,
      NODE_ENV: 'production',
    });

    expect(
      security.validateUpgradeRequest(
        wsRequest({
          headers: {
            host: '192.168.1.9:1989',
            origin: 'http://192.168.1.9:1989',
            cookie: `codex_ui_token=${token}`,
          },
        }),
        config,
        () => false,
      ),
    ).toMatchObject({ ok: false, statusCode: 403 });
  });

  it('rejects missing WebSocket origin headers for browser traffic', () => {
    const config = security.createLocalAccessConfig({ PORT: '1989', CODEX_UI_TOKEN: token });

    expect(
      security.validateUpgradeRequest(
        wsRequest({ headers: { host: '127.0.0.1:1989', cookie: `codex_ui_token=${token}` } }),
        config,
        () => false,
      ),
    ).toMatchObject({ ok: false, statusCode: 403 });
  });

  it('returns deterministic HTTP upgrade rejections', () => {
    expect(security.buildUpgradeRejection(403, 'Forbidden Origin')).toBe(
      'HTTP/1.1 403 Forbidden Origin\r\nConnection: close\r\nContent-Length: 0\r\n\r\n',
    );
  });

  it('validates browser WebSocket payload size and Codex RPC shape before forwarding', () => {
    const config = security.createLocalAccessConfig({
      PORT: '1989',
      CODEX_UI_TOKEN: token,
      MAX_WS_PAYLOAD_BYTES: '64',
    });

    expect(
      security.validateBrowserWsPayload(
        Buffer.from(JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'thread/list' })),
        false,
        config,
      ),
    ).toMatchObject({ ok: true });

    expect(
      security.validateBrowserWsPayload(
        Buffer.from(JSON.stringify({ id: 1, method: 'thread/list', params: null })),
        false,
        config,
      ),
    ).toMatchObject({ ok: true });

    expect(
      security.validateBrowserWsPayload(
        Buffer.from(JSON.stringify({ id: 1, method: 'thread/list' })),
        false,
        config,
      ),
    ).toMatchObject({ ok: true });

    expect(security.validateBrowserWsPayload(Buffer.alloc(65, 'x'), false, config)).toMatchObject({
      ok: false,
      closeCode: 1009,
    });

    expect(security.validateBrowserWsPayload(Buffer.from('{'), false, config)).toMatchObject({
      ok: false,
      closeCode: 1007,
    });

    expect(
      security.validateBrowserWsPayload(
        Buffer.from(JSON.stringify({ jsonrpc: '1.0', method: 'invalid-version' })),
        false,
        config,
      ),
    ).toMatchObject({ ok: false, closeCode: 1008 });

    expect(
      security.validateBrowserWsPayload(
        Buffer.from(JSON.stringify({ id: 1, method: 'thread/list', params: 'invalid' })),
        false,
        config,
      ),
    ).toMatchObject({ ok: false, closeCode: 1008 });
  });

  it('validates backend WebSocket payloads before forwarding to browsers', () => {
    const config = security.createLocalAccessConfig({
      PORT: '1989',
      CODEX_UI_TOKEN: token,
      MAX_BACKEND_WS_PAYLOAD_BYTES: '256',
    });

    expect(
      security.validateBackendWsPayload(
        Buffer.from(JSON.stringify({ jsonrpc: '2.0', id: 1, result: { ok: true } })),
        false,
        config,
      ),
    ).toMatchObject({ ok: true });

    expect(
      security.validateBackendWsPayload(
        Buffer.from(
          JSON.stringify({
            id: 1,
            result: {
              userAgent: 'Codex Desktop/0.130.0',
              codexHome: 'C:\\Users\\Admin\\.codex',
              platformFamily: 'windows',
              platformOs: 'windows',
            },
          }),
        ),
        false,
        config,
      ),
    ).toMatchObject({ ok: true });

    expect(
      security.validateBackendWsPayload(
        Buffer.from(
          JSON.stringify({
            method: 'remoteControl/status/changed',
            params: { status: 'disabled', environmentId: null },
          }),
        ),
        false,
        config,
      ),
    ).toMatchObject({ ok: true });

    expect(
      security.validateBackendWsPayload(
        Buffer.from(JSON.stringify({ jsonrpc: '1.0', id: 1, result: { ok: true } })),
        false,
        config,
      ),
    ).toMatchObject({ ok: false, closeCode: 1008 });

    expect(security.validateBackendWsPayload(Buffer.alloc(257, 'x'), false, config)).toMatchObject({
      ok: false,
      closeCode: 1009,
    });

    expect(security.validateBackendWsPayload(Buffer.from([0, 1, 2]), true, config)).toMatchObject({
      ok: false,
      closeCode: 1003,
    });

    expect(security.validateBackendWsPayload(Buffer.from('{'), false, config)).toMatchObject({
      ok: false,
      closeCode: 1007,
    });
  });

  it('keeps the backend frame limit separate from the browser ingress limit', () => {
    const config = security.createLocalAccessConfig({
      PORT: '1989',
      CODEX_UI_TOKEN: token,
      MAX_WS_PAYLOAD_BYTES: '64',
      MAX_BACKEND_WS_PAYLOAD_BYTES: '512',
    });
    const backendPayload = Buffer.from(
      JSON.stringify({ id: 1, result: { payload: 'x'.repeat(240) } }),
    );

    expect(backendPayload.byteLength).toBeGreaterThan(config.maxWsPayloadBytes);
    expect(backendPayload.byteLength).toBeLessThan(config.maxBackendWsPayloadBytes);
    expect(security.validateBrowserWsPayload(Buffer.alloc(65, 'x'), false, config)).toMatchObject({
      ok: false,
      closeCode: 1009,
    });
    expect(security.validateBackendWsPayload(backendPayload, false, config)).toMatchObject({
      ok: true,
    });
  });

  it('accepts bounded Codex backend frames that exceed the browser ingress default', () => {
    const config = security.createLocalAccessConfig({ PORT: '1989', CODEX_UI_TOKEN: token });
    const backendPayload = Buffer.from(
      JSON.stringify({ id: 1, result: { payload: 'x'.repeat(1_100_000) } }),
    );

    expect(backendPayload.byteLength).toBeGreaterThan(config.maxWsPayloadBytes);
    expect(backendPayload.byteLength).toBeLessThan(config.maxBackendWsPayloadBytes);
    expect(security.validateBackendWsPayload(backendPayload, false, config)).toMatchObject({
      ok: true,
    });
  });

  it('validates upload extension, declared mime, magic bytes, and size', () => {
    const validPng = security.decodeBase64Payload(
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/p9sAAAAASUVORK5CYII=',
      1024,
    );
    expect(validPng).toBeInstanceOf(Buffer);
    expect(security.isImagePayloadForExtension('.png', 'image/png', validPng)).toBe(true);
    expect(security.isImagePayloadForExtension('.png', 'image/jpeg', validPng)).toBe(false);
    expect(security.isImagePayloadForExtension('.png', 'image/png', Buffer.from('not-png'))).toBe(
      false,
    );
    expect(security.decodeBase64Payload(Buffer.alloc(2048).toString('base64'), 16)).toBeNull();

    const svg = security.createUploadFileName('diagram.svg');
    expect(security.ALLOWED_IMAGE_EXTENSIONS.has(svg.extension)).toBe(false);
  });

  it('reconnects only after unexpected backend disconnects while the browser remains open', () => {
    expect(security.shouldReconnectBackend(1006, false)).toBe(true);
    expect(security.shouldReconnectBackend(4001, false)).toBe(false);
    expect(security.shouldReconnectBackend(1006, true)).toBe(false);
  });

  it('adds Secure to auth cookies only for directly secure or trusted proxy HTTPS requests', () => {
    expect(security.isSecureRequest({ socket: { encrypted: true }, headers: {} }, {})).toBe(true);
    expect(
      security.isSecureRequest(
        { socket: {}, headers: { 'x-forwarded-proto': 'https' } },
        { trustProxyHeaders: false },
      ),
    ).toBe(false);
    expect(
      security.isSecureRequest(
        { socket: {}, headers: { 'x-forwarded-proto': 'https, http' } },
        { trustProxyHeaders: true },
      ),
    ).toBe(true);
    expect(security.buildAuthCookie(token, { secure: true })).toContain('; Secure');
  });
});
