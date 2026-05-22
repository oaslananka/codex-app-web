import { describe, expect, it, vi } from 'vitest';
import { buildInitialState } from '../../src/lib/codex-runtime/runtime-state';
import { RuntimeStore } from '../../src/lib/codex-runtime/store';
import {
  buildDisconnectedRuntimePatch,
  buildFuzzySearchCompletedPatch,
  registerRuntimeConnection,
} from '../../src/lib/codex-runtime/runtime-connection';
import type {
  OfficialNotificationMethod,
  OfficialServerRequestMethod,
} from '../../src/lib/codex-runtime/protocol';

type ControlHandler = (type: string, payload: Record<string, unknown>) => void;
type NotificationHandler = (payload: Record<string, unknown>) => void;
type ServerRequestHandler = (payload: Record<string, unknown>) => Promise<unknown>;

class FakeRpcClient {
  readonly controlHandlers: ControlHandler[] = [];

  readonly notificationHandlers = new Map<string, NotificationHandler>();

  readonly serverRequestHandlers = new Map<string, ServerRequestHandler>();

  onControl(handler: ControlHandler) {
    this.controlHandlers.push(handler);
  }

  onNotification(method: OfficialNotificationMethod, handler: NotificationHandler) {
    this.notificationHandlers.set(method, handler);
  }

  onServerRequest(method: OfficialServerRequestMethod, handler: ServerRequestHandler) {
    this.serverRequestHandlers.set(method, handler);
  }

  emitControl(type: string, payload: Record<string, unknown> = {}) {
    this.controlHandlers.forEach((handler) => handler(type, payload));
  }

  emitNotification(method: OfficialNotificationMethod, payload: Record<string, unknown> = {}) {
    const handler = this.notificationHandlers.get(method);
    if (!handler) throw new Error(`Missing notification handler: ${method}`);
    handler(payload);
  }

  requestFromServer(method: OfficialServerRequestMethod, payload: Record<string, unknown> = {}) {
    const handler = this.serverRequestHandlers.get(method);
    if (!handler) throw new Error(`Missing server request handler: ${method}`);
    return handler(payload);
  }
}

function createRuntimeConnection() {
  const store = new RuntimeStore(buildInitialState());
  const client = new FakeRpcClient();
  const deps = {
    store,
    client,
    approvalService: {
      requestApproval: vi.fn(async () => ({ decision: 'approved' })),
      cancelPending: vi.fn(),
    },
    threadService: {
      handleThreadStatusChanged: vi.fn(),
      handleThreadStarted: vi.fn(),
      handleThreadArchived: vi.fn(),
      handleThreadNameUpdated: vi.fn(),
      selectThread: vi.fn(async () => ({})),
      loadThreads: vi.fn(async () => ({})),
      loadLoadedThreads: vi.fn(async () => ({})),
    },
    turnService: {
      handleTurnCompleted: vi.fn(),
      handleReasoningDelta: vi.fn(),
      handleItemStarted: vi.fn(),
      handleItemCompleted: vi.fn(),
      handleAgentMessageDelta: vi.fn(),
      handleThreadRealtime: vi.fn(),
    },
    terminalService: {
      handleExecOutputDelta: vi.fn(),
    },
    authService: {
      loadAccount: vi.fn(async () => ({})),
      loadRateLimits: vi.fn(async () => ({})),
    },
    featureService: {
      loadInfo: vi.fn(async () => ({})),
      loadApps: vi.fn(async () => ({})),
      handleAppsUpdated: vi.fn(),
      loadModels: vi.fn(async () => ({})),
    },
    emitToast: vi.fn(),
    updateCapability: vi.fn(),
    scheduleDeferredBootstrapLoads: vi.fn(),
    clearDeferredBootstrapTimers: vi.fn(),
    refreshConnectionBanner: vi.fn(),
  };

  registerRuntimeConnection(deps as unknown as Parameters<typeof registerRuntimeConnection>[0]);

  return { client, deps, store };
}

describe('runtime connection disconnect handling', () => {
  it('clears loading and pending UI state when the transport drops', () => {
    const state = buildInitialState();
    state.turnActive = true;
    state.attachmentUploadInProgress = true;
    state.currentProcId = 'proc-1';
    state.fileLoading = true;
    state.configLoading = true;
    state.infoLoading = true;
    state.terminalRunning = true;
    state.loginInProgress = true;
    state.review = { ...state.review, loading: true, error: 'still pending' };
    state.fuzzySearch = { ...state.fuzzySearch, loading: true, error: 'pending' };
    state.authStatus = { ...state.authStatus, loading: true, error: 'pending' };
    state.gitDiff = { ...state.gitDiff, loading: true, error: 'pending' };
    state.workspaceSummary = { ...state.workspaceSummary, loading: true, error: 'pending' };
    state.externalAgents = { ...state.externalAgents, loading: true, error: 'pending' };
    state.activeApprovalRequest = {
      requestId: 'approval-1',
      method: 'item/tool/call',
      variant: 'tool-call',
      title: 'Approval',
      badge: 'TOOL',
      detail: '{}',
      confirmLabel: 'Allow',
      denyLabel: 'Deny',
    };

    const patch = buildDisconnectedRuntimePatch(state, 'Socket lost');

    expect(patch.connectionState).toBe('offline');
    expect(patch.connectionError).toBe('Socket lost');
    expect(patch.turnActive).toBe(false);
    expect(patch.attachmentUploadInProgress).toBe(false);
    expect(patch.currentProcId).toBeNull();
    expect(patch.activeApprovalRequest).toBeNull();
    expect(patch.fileLoading).toBe(false);
    expect(patch.configLoading).toBe(false);
    expect(patch.infoLoading).toBe(false);
    expect(patch.terminalRunning).toBe(false);
    expect(patch.loginInProgress).toBe(false);
    expect(patch.review?.loading).toBe(false);
    expect(patch.fuzzySearch?.loading).toBe(false);
    expect(patch.authStatus?.loading).toBe(false);
    expect(patch.gitDiff?.loading).toBe(false);
    expect(patch.workspaceSummary?.loading).toBe(false);
    expect(patch.externalAgents?.loading).toBe(false);
  });

  it('clears fuzzy-search loading even when the completion payload omits results', () => {
    const state = buildInitialState();
    const previousResults = [{ path: '/tmp/example.ts', score: 0.75 }];
    state.fuzzySearch = {
      ...state.fuzzySearch,
      loading: true,
      results: previousResults,
    };

    const patch = buildFuzzySearchCompletedPatch(state, {});

    expect(patch.fuzzySearch?.loading).toBe(false);
    expect(patch.fuzzySearch?.results).toBe(previousResults);
  });

  it('normalizes fuzzy-search file results using the reported root path', () => {
    const state = buildInitialState();

    const patch = buildFuzzySearchCompletedPatch(state, {
      files: [
        {
          root: '/workspace/project',
          path: 'src/components/App.tsx',
          score: 0.91,
        },
      ],
    });

    expect(patch.fuzzySearch?.loading).toBe(false);
    expect(patch.fuzzySearch?.results).toEqual([
      {
        path: '/workspace/project/src/components/App.tsx',
        score: 0.91,
        preview: undefined,
      },
    ]);
  });

  it('bootstraps account, model, and thread data after the backend reports ready', () => {
    const { client, deps, store } = createRuntimeConnection();

    client.emitControl('ready');

    expect(store.getState()).toMatchObject({
      connected: true,
      connectionState: 'connected',
      connectionError: '',
    });
    expect(store.getState().connectionBanner.visible).toBe(false);
    expect(deps.emitToast).toHaveBeenCalledWith('Connected to Codex backend', 'success');
    expect(deps.authService.loadAccount).toHaveBeenCalledTimes(1);
    expect(deps.authService.loadRateLimits).toHaveBeenCalledTimes(1);
    expect(deps.featureService.loadModels).toHaveBeenCalledTimes(1);
    expect(deps.threadService.loadThreads).toHaveBeenCalledTimes(1);
    expect(deps.threadService.loadLoadedThreads).toHaveBeenCalledTimes(1);
    expect(deps.scheduleDeferredBootstrapLoads).toHaveBeenCalledTimes(1);
  });

  it('cancels pending approvals and clears deferred bootstrap work on disconnect', () => {
    const { client, deps, store } = createRuntimeConnection();
    store.patch({
      turnActive: true,
      terminalRunning: true,
    });

    client.emitControl('disconnected', { code: 1006, reason: 'backend closed' });

    expect(deps.clearDeferredBootstrapTimers).toHaveBeenCalledTimes(1);
    expect(deps.approvalService.cancelPending).toHaveBeenCalledWith(
      'Connection lost: backend closed',
    );
    expect(store.getState()).toMatchObject({
      connected: false,
      connectionState: 'offline',
      connectionError: 'backend closed',
      turnActive: false,
      terminalRunning: false,
    });
    expect(deps.refreshConnectionBanner).toHaveBeenCalledWith('backend closed');
    expect(deps.emitToast).toHaveBeenCalledWith('Codex backend disconnected', 'error');
  });

  it('routes registered notifications to services and marks protocol support', () => {
    const { client, deps } = createRuntimeConnection();

    client.emitNotification('thread/closed', { threadId: 'thread-1' });
    client.emitNotification('item/reasoning/textDelta', {
      threadId: 'thread-1',
      itemId: 'item-1',
      delta: 'thinking',
    });

    expect(deps.updateCapability).toHaveBeenCalledWith(
      'notifications',
      'thread/closed',
      'supported',
    );
    expect(deps.threadService.handleThreadStatusChanged).toHaveBeenCalledWith({
      threadId: 'thread-1',
      status: { type: 'idle' },
    });
    expect(deps.turnService.handleReasoningDelta).toHaveBeenCalledWith(
      {
        threadId: 'thread-1',
        itemId: 'item-1',
        delta: 'thinking',
      },
      'reasoning',
    );
  });

  it('returns a cancelled server-request response when approval handling throws', async () => {
    const { client, deps } = createRuntimeConnection();
    deps.approvalService.requestApproval.mockRejectedValueOnce(new Error('user closed modal'));

    const response = await client.requestFromServer('item/tool/call', { requestId: 'req-1' });

    expect(deps.updateCapability).toHaveBeenCalledWith(
      'serverRequests',
      'item/tool/call',
      'supported',
    );
    expect(response).toEqual({
      cancelled: true,
      error: 'user closed modal',
    });
  });
});
