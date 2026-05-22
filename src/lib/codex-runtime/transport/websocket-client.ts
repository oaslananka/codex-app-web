import {
  isDirectoryPathError,
  RpcMethodUnavailableError,
  TransportDisconnectedError,
  isMissingPathError,
  normalizeError,
} from '../errors';
import { createBrowserLogger } from '../../logging/browser-logger';

type PendingRequest = {
  method: string;
  resolve: (value: unknown) => void;
  reject: (error: unknown) => void;
  timer: ReturnType<typeof setTimeout>;
};

type ControlHandler = (type: string, payload: Record<string, unknown>) => void;
type NotificationHandler = (params: Record<string, unknown>) => void;
type ServerRequestHandler = (params: Record<string, unknown>) => Promise<unknown> | unknown;

const logger = createBrowserLogger('runtime:ws');
const EXPECTED_FILE_PATH_METHODS = new Set(['fs/readFile', 'fs/getMetadata']);
const JSON_RPC_SERVER_METHOD_RE = /^[A-Za-z][A-Za-z0-9/_.-]{0,127}$/;

export class WebsocketRpcClient {
  private ws: WebSocket | null = null;

  private rpcId = 1;

  private initializeRequestId: number | null = null;

  private readonly pending = new Map<number, PendingRequest>();

  private readonly notificationHandlers = new Map<string, Set<NotificationHandler>>();

  private readonly serverRequestHandlers = new Map<string, ServerRequestHandler>();

  private readonly controlHandlers = new Set<ControlHandler>();

  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;

  private reconnectAttempt = 0;

  private static readonly MAX_RECONNECT_DELAY_MS = 30_000;

  private static readonly DEFAULT_REQUEST_TIMEOUT_MS = 30_000;

  private readonly wsUrl: string;

  private readonly requestTimeoutMs: number;

  constructor(wsUrl?: string, options: { requestTimeoutMs?: number } = {}) {
    const wsScheme =
      typeof location !== 'undefined' && location.protocol === 'https:' ? 'wss' : 'ws';
    this.wsUrl = wsUrl ?? `${wsScheme}://${location.host}/ws`;
    this.requestTimeoutMs =
      options.requestTimeoutMs ?? WebsocketRpcClient.DEFAULT_REQUEST_TIMEOUT_MS;
  }

  connect() {
    if (this.ws) {
      this.failPendingRequests(new TransportDisconnectedError('WebSocket transport reconnecting'));
      this.ws.onclose = null;
      this.ws.close();
    }

    try {
      this.ws = new WebSocket(this.wsUrl);
      logger.debug('Opening websocket connection', { url: this.wsUrl });
    } catch (error) {
      logger.error('Failed to create websocket connection', error);
      this.emitControl('error', {
        message: error instanceof Error ? error.message : 'Failed to connect',
      });
      return;
    }

    this.ws.onopen = () => {
      this.reconnectAttempt = 0;
      logger.info('Websocket connection opened', { url: this.wsUrl });
      this.emitControl('connected', { url: this.wsUrl });
      const initializeId = this.rpcId++;
      this.initializeRequestId = initializeId;
      this.sendRaw({
        jsonrpc: '2.0',
        id: initializeId,
        method: 'initialize',
        params: {
          clientInfo: { name: 'codex-app-web', version: '2.0.0' },
          capabilities: { experimentalApi: true },
        },
      });
    };

    this.ws.onmessage = (event) => {
      try {
        const message = JSON.parse(String(event.data));
        if (message?.__ctrl) {
          logger.trace('Received control frame', message);
          this.emitControl(String(message.type ?? 'unknown'), message as Record<string, unknown>);
          return;
        }
        logger.trace('Received rpc frame', {
          id: typeof message?.id === 'number' ? message.id : undefined,
          method: typeof message?.method === 'string' ? message.method : undefined,
          kind:
            typeof message?.method === 'string'
              ? typeof message?.id === 'number'
                ? 'server-request-or-notification'
                : 'notification'
              : 'response',
        });
        this.handleMessage(message);
      } catch (error) {
        logger.error('Malformed websocket payload', error);
        this.emitControl('error', {
          message: error instanceof Error ? error.message : 'Malformed websocket payload',
        });
      }
    };

    this.ws.onerror = () => {
      logger.error('Websocket transport emitted an error event');
      this.emitControl('error', { message: 'WebSocket connection error' });
    };

    this.ws.onclose = (event) => {
      this.ws = null;
      this.initializeRequestId = null;
      this.failPendingRequests(
        new TransportDisconnectedError(
          event.reason || 'WebSocket transport disconnected',
          event.code,
        ),
      );
      logger.warn('Websocket connection closed', {
        code: event.code,
        reason: event.reason,
      });
      this.emitControl('disconnected', { code: event.code, reason: event.reason });
      this.scheduleReconnect();
    };

    this.emitControl('connecting', { url: this.wsUrl });
  }

  reconnect() {
    this.clearReconnectTimer();
    // Re-open the browser websocket so the full initialize -> ready bootstrap
    // runs again. Reconnecting only the upstream Codex socket leaves the UI
    // transport open, which skips initialize and can stall the session until
    // a hard page refresh.
    this.connect();
  }

  async request(method: string, params: unknown = undefined) {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      throw new TransportDisconnectedError('WebSocket transport is not connected');
    }

    const id = this.rpcId++;
    const payload = { jsonrpc: '2.0', id, method, params };
    logger.trace('Sending rpc request', { id, method, params });
    return await new Promise<unknown>((resolve, reject) => {
      const timer = globalThis.setTimeout(() => {
        const pending = this.pending.get(id);
        if (!pending) return;
        this.pending.delete(id);
        pending.reject(new Error(`RPC request timed out after ${this.requestTimeoutMs}ms`));
      }, this.requestTimeoutMs);
      this.pending.set(id, { method, resolve, reject, timer });
      if (this.sendRaw(payload)) {
        return;
      }

      this.clearPendingRequest(id);
      reject(new TransportDisconnectedError('WebSocket transport is not connected'));
    });
  }

  onNotification(method: string, handler: NotificationHandler) {
    if (!this.notificationHandlers.has(method)) {
      this.notificationHandlers.set(method, new Set());
    }
    this.notificationHandlers.get(method)?.add(handler);
    return () => this.notificationHandlers.get(method)?.delete(handler);
  }

  onServerRequest(method: string, handler: ServerRequestHandler) {
    this.serverRequestHandlers.set(method, handler);
  }

  onControl(handler: ControlHandler) {
    this.controlHandlers.add(handler);
    return () => this.controlHandlers.delete(handler);
  }

  private emitControl(type: string, payload: Record<string, unknown>) {
    this.controlHandlers.forEach((handler) => handler(type, payload));
  }

  private handleMessage(message: Record<string, unknown>) {
    if (
      typeof message.id === 'number' &&
      (Reflect.has(message, 'result') || Reflect.has(message, 'error'))
    ) {
      if (message.id === this.initializeRequestId) {
        this.initializeRequestId = null;
        if (message.error) {
          logger.error('Initialize request failed', {
            message: normalizeError(message.error),
          });
          const errorPayload = message.error as Record<string, unknown>;
          this.emitControl('readyError', {
            message: normalizeError(errorPayload, 'Initialize failed'),
          });
        } else {
          logger.info('Initialize request completed');
          this.emitControl('ready', {
            result: (message.result ?? {}) as Record<string, unknown>,
          });
        }
      }

      const pending = this.pending.get(message.id);
      if (!pending) return;
      this.clearPendingRequest(message.id);
      if (message.error) {
        const errorPayload = message.error as Record<string, unknown>;
        const messageText = normalizeError(errorPayload, 'RPC request failed');
        const errorDetails = {
          id: message.id,
          method: pending.method,
          code: errorPayload.code,
          message: messageText,
        };
        if (
          EXPECTED_FILE_PATH_METHODS.has(pending.method) &&
          (isMissingPathError(errorPayload) || isDirectoryPathError(errorPayload))
        ) {
          logger.trace('RPC request returned an expected file-path error', errorDetails);
        } else {
          logger.warn('RPC request failed', errorDetails);
        }
        const error =
          errorPayload.code === -32601
            ? new RpcMethodUnavailableError(pending.method, messageText)
            : Object.assign(new Error(messageText), {
                code: errorPayload.code,
                data: errorPayload.data,
              });
        pending.reject(error);
        return;
      }
      logger.trace('Resolved rpc response', { id: message.id });
      pending.resolve(message.result);
      return;
    }

    if (typeof message.id === 'number' && typeof message.method === 'string') {
      const method = message.method;
      if (!JSON_RPC_SERVER_METHOD_RE.test(method)) {
        logger.warn('Rejected unsafe server request method', { method });
        this.sendRaw({
          jsonrpc: '2.0',
          id: message.id,
          error: {
            code: -32600,
            message: 'Invalid server request method',
          },
        });
        return;
      }

      const serverHandler = this.serverRequestHandlers.get(method);
      if (!serverHandler) {
        logger.warn('No server request handler registered', { method });
        this.sendRaw({
          jsonrpc: '2.0',
          id: message.id,
          error: {
            code: -32601,
            message: `No handler registered for ${method}`,
          },
        });
        return;
      }

      // Handlers are registered only by trusted client code and the incoming
      // method was validated before lookup.
      // lgtm[js/unvalidated-dynamic-method-call]
      Promise.resolve(serverHandler((message.params ?? {}) as Record<string, unknown>))
        .then((result) => {
          logger.trace('Server request resolved', { id: message.id, method });
          this.sendRaw({ jsonrpc: '2.0', id: message.id, result });
        })
        .catch((error) => {
          logger.error('Server request handler failed', error, {
            id: message.id,
            method,
          });
          this.sendRaw({
            jsonrpc: '2.0',
            id: message.id,
            error: {
              code: -32000,
              message: error instanceof Error ? error.message : 'Server request failed',
            },
          });
        });
      return;
    }

    if (typeof message.method === 'string') {
      logger.trace('Dispatching notification', { method: message.method });
      this.notificationHandlers
        .get(message.method)
        ?.forEach((handler) => handler((message.params ?? {}) as Record<string, unknown>));
    }
  }

  private sendRaw(payload: unknown) {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return false;
    this.ws.send(JSON.stringify(payload));
    return true;
  }

  private failPendingRequests(error: Error) {
    if (!this.pending.size) return;
    const pending = [...this.pending.values()];
    this.pending.clear();
    pending.forEach((request) => {
      globalThis.clearTimeout(request.timer);
      request.reject(error);
    });
  }

  private clearPendingRequest(id: number) {
    const pending = this.pending.get(id);
    if (!pending) return null;
    globalThis.clearTimeout(pending.timer);
    this.pending.delete(id);
    return pending;
  }

  private clearReconnectTimer() {
    if (this.reconnectTimer != null) {
      globalThis.clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
  }

  private scheduleReconnect() {
    if (this.reconnectTimer != null) return;
    const baseDelay = Math.min(
      1500 * Math.pow(1.5, this.reconnectAttempt),
      WebsocketRpcClient.MAX_RECONNECT_DELAY_MS,
    );
    const jitter = Math.random() * 500;
    const delay = baseDelay + jitter;
    this.reconnectAttempt++;
    this.reconnectTimer = globalThis.setTimeout(() => {
      this.reconnectTimer = null;
      this.connect();
    }, delay);
  }
}
