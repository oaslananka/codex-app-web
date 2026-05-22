import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { WebsocketRpcClient } from '../../src/lib/codex-runtime/transport/websocket-client';
import { clearBrowserLogs, getRecentBrowserLogs } from '../../src/lib/logging/browser-logger';

class MockWebSocket {
  static readonly OPEN = 1;

  static readonly CLOSED = 3;

  static instances: MockWebSocket[] = [];

  readonly sent: string[] = [];

  readyState = MockWebSocket.OPEN;

  onopen: (() => void) | null = null;

  onmessage: ((event: { data: string }) => void) | null = null;

  onerror: (() => void) | null = null;

  onclose: ((event: { code: number; reason: string }) => void) | null = null;

  constructor(public readonly url: string) {
    MockWebSocket.instances.push(this);
  }

  send(payload: string) {
    this.sent.push(payload);
  }

  close() {
    this.readyState = MockWebSocket.CLOSED;
  }
}

describe('WebsocketRpcClient', () => {
  const originalWindow = globalThis.window;
  const originalWebSocket = globalThis.WebSocket;
  const originalLocation = globalThis.location;

  beforeEach(() => {
    MockWebSocket.instances = [];
    vi.useFakeTimers();
    Object.defineProperty(globalThis, 'window', {
      configurable: true,
      value: globalThis,
    });
    Object.defineProperty(globalThis, 'location', {
      configurable: true,
      value: {
        protocol: 'http:',
        host: 'localhost:3000',
      },
    });
    Object.defineProperty(globalThis, 'WebSocket', {
      configurable: true,
      value: MockWebSocket,
    });
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
    clearBrowserLogs();
    if (originalWindow === undefined) {
      Reflect.deleteProperty(globalThis, 'window');
    } else {
      Object.defineProperty(globalThis, 'window', { configurable: true, value: originalWindow });
    }
    if (originalWebSocket === undefined) {
      Reflect.deleteProperty(globalThis, 'WebSocket');
    } else {
      Object.defineProperty(globalThis, 'WebSocket', {
        configurable: true,
        value: originalWebSocket,
      });
    }
    if (originalLocation === undefined) {
      Reflect.deleteProperty(globalThis, 'location');
    } else {
      Object.defineProperty(globalThis, 'location', {
        configurable: true,
        value: originalLocation,
      });
    }
  });

  it('rejects all in-flight requests when the transport disconnects', async () => {
    const client = new WebsocketRpcClient('ws://localhost:4000/ws');
    client.connect();

    const socket = MockWebSocket.instances[0];
    expect(socket).toBeDefined();
    if (!socket) {
      throw new Error('Expected websocket instance');
    }

    socket.onopen?.();
    socket.onmessage?.({
      data: JSON.stringify({ jsonrpc: '2.0', id: 1, result: { ok: true } }),
    });

    const pending = client.request('thread/list', {});
    socket.onclose?.({ code: 1006, reason: 'socket lost' });

    await expect(pending).rejects.toThrow(/socket lost|disconnected/i);
  });

  it('rejects requests immediately when the transport is unavailable', async () => {
    const client = new WebsocketRpcClient('ws://localhost:4000/ws');

    await expect(client.request('thread/list', {})).rejects.toThrow(/not connected|disconnected/i);
  });

  it('rejects and clears pending requests when an RPC timeout expires', async () => {
    const client = new WebsocketRpcClient('ws://localhost:4000/ws', { requestTimeoutMs: 1000 });
    client.connect();

    const socket = MockWebSocket.instances[0];
    expect(socket).toBeDefined();
    if (!socket) {
      throw new Error('Expected websocket instance');
    }

    socket.onopen?.();
    socket.onmessage?.({
      data: JSON.stringify({ jsonrpc: '2.0', id: 1, result: { ok: true } }),
    });

    const pending = client.request('thread/list', {});
    const pendingExpectation = expect(pending).rejects.toThrow(
      'RPC request timed out after 1000ms',
    );
    await vi.advanceTimersByTimeAsync(1000);
    await pendingExpectation;

    socket.onmessage?.({
      data: JSON.stringify({ jsonrpc: '2.0', id: 2, result: { late: true } }),
    });
    expect(socket.sent.some((payload) => payload.includes('"method":"thread/list"'))).toBe(true);
  });

  it('summarizes upstream HTML challenge errors instead of logging raw pages', async () => {
    const client = new WebsocketRpcClient('ws://localhost:4000/ws');
    client.connect();

    const socket = MockWebSocket.instances[0];
    expect(socket).toBeDefined();
    if (!socket) {
      throw new Error('Expected websocket instance');
    }

    socket.onopen?.();
    socket.onmessage?.({
      data: JSON.stringify({ jsonrpc: '2.0', id: 1, result: { ok: true } }),
    });

    const pending = client.request('app/list', {});
    socket.onmessage?.({
      data: JSON.stringify({
        jsonrpc: '2.0',
        id: 2,
        error: {
          code: -32603,
          message:
            'failed to list apps: Request failed with status 403 Forbidden: <html><body><span id="challenge-error-text">Enable JavaScript and cookies to continue</span></body></html>',
        },
      }),
    });

    await expect(pending).rejects.toThrow(
      'Request failed with status 403 Forbidden: remote service returned an HTML challenge page instead of API JSON. This usually means auth expired or the request was blocked upstream.',
    );

    const lastLog = getRecentBrowserLogs().at(-1);
    expect(lastLog?.message).toBe('RPC request failed');
    expect(lastLog?.details.join('\n')).not.toContain('<html>');
  });

  it('does not warn for expected file-path RPC errors that are handled by the UI', async () => {
    const client = new WebsocketRpcClient('ws://localhost:4000/ws');
    client.connect();

    const socket = MockWebSocket.instances[0];
    expect(socket).toBeDefined();
    if (!socket) {
      throw new Error('Expected websocket instance');
    }

    socket.onopen?.();
    socket.onmessage?.({
      data: JSON.stringify({ jsonrpc: '2.0', id: 1, result: { ok: true } }),
    });

    const initialLogCount = getRecentBrowserLogs().length;
    const pending = client.request('fs/readFile', { path: '/workspace/missing.ts' });
    socket.onmessage?.({
      data: JSON.stringify({
        jsonrpc: '2.0',
        id: 2,
        error: {
          code: -32603,
          message: 'No such file or directory (os error 2)',
        },
      }),
    });

    await expect(pending).rejects.toThrow('No such file or directory (os error 2)');

    const newLogs = getRecentBrowserLogs().slice(initialLogCount);
    expect(newLogs.some((entry) => entry.message === 'RPC request failed')).toBe(false);
    expect(
      newLogs.some((entry) => entry.message === 'RPC request returned an expected file-path error'),
    ).toBe(true);
  });

  it('does not warn when fs/readFile hits a directory path during directory navigation', async () => {
    const client = new WebsocketRpcClient('ws://localhost:4000/ws');
    client.connect();

    const socket = MockWebSocket.instances[0];
    expect(socket).toBeDefined();
    if (!socket) {
      throw new Error('Expected websocket instance');
    }

    socket.onopen?.();
    socket.onmessage?.({
      data: JSON.stringify({ jsonrpc: '2.0', id: 1, result: { ok: true } }),
    });

    const initialLogCount = getRecentBrowserLogs().length;
    const pending = client.request('fs/readFile', { path: '/workspace/src' });
    socket.onmessage?.({
      data: JSON.stringify({
        jsonrpc: '2.0',
        id: 2,
        error: {
          code: -32603,
          message: 'Is a directory (os error 21)',
        },
      }),
    });

    await expect(pending).rejects.toThrow('Is a directory (os error 21)');

    const newLogs = getRecentBrowserLogs().slice(initialLogCount);
    expect(newLogs.some((entry) => entry.message === 'RPC request failed')).toBe(false);
    expect(
      newLogs.some((entry) => entry.message === 'RPC request returned an expected file-path error'),
    ).toBe(true);
  });

  it('reconnects by reopening the browser websocket so initialize runs again', () => {
    const client = new WebsocketRpcClient('ws://localhost:4000/ws');
    client.connect();

    const firstSocket = MockWebSocket.instances[0];
    expect(firstSocket).toBeDefined();
    if (!firstSocket) {
      throw new Error('Expected first websocket instance');
    }

    firstSocket.onopen?.();
    expect(firstSocket.sent[0]).toContain('"method":"initialize"');

    client.reconnect();

    expect(MockWebSocket.instances).toHaveLength(2);
    expect(firstSocket.readyState).toBe(MockWebSocket.CLOSED);

    const secondSocket = MockWebSocket.instances[1];
    expect(secondSocket).toBeDefined();
    if (!secondSocket) {
      throw new Error('Expected second websocket instance');
    }

    secondSocket.onopen?.();
    expect(secondSocket.sent[0]).toContain('"method":"initialize"');
  });

  it('uses exponential backoff with jitter and resets the delay after a successful reconnect', async () => {
    vi.spyOn(Math, 'random').mockReturnValue(0);
    const client = new WebsocketRpcClient('ws://localhost:4000/ws');
    client.connect();

    const firstSocket = MockWebSocket.instances[0];
    expect(firstSocket).toBeDefined();
    if (!firstSocket) {
      throw new Error('Expected first websocket instance');
    }

    firstSocket.onclose?.({ code: 1006, reason: 'socket lost' });
    await vi.advanceTimersByTimeAsync(1499);
    expect(MockWebSocket.instances).toHaveLength(1);

    await vi.advanceTimersByTimeAsync(1);
    expect(MockWebSocket.instances).toHaveLength(2);

    const secondSocket = MockWebSocket.instances[1];
    expect(secondSocket).toBeDefined();
    if (!secondSocket) {
      throw new Error('Expected second websocket instance');
    }

    secondSocket.onclose?.({ code: 1006, reason: 'socket lost again' });
    await vi.advanceTimersByTimeAsync(2249);
    expect(MockWebSocket.instances).toHaveLength(2);

    await vi.advanceTimersByTimeAsync(1);
    expect(MockWebSocket.instances).toHaveLength(3);

    const thirdSocket = MockWebSocket.instances[2];
    expect(thirdSocket).toBeDefined();
    if (!thirdSocket) {
      throw new Error('Expected third websocket instance');
    }

    thirdSocket.onopen?.();
    thirdSocket.onclose?.({ code: 1006, reason: 'socket lost after reconnect' });
    await vi.advanceTimersByTimeAsync(1499);
    expect(MockWebSocket.instances).toHaveLength(3);

    await vi.advanceTimersByTimeAsync(1);
    expect(MockWebSocket.instances).toHaveLength(4);
  });
});
