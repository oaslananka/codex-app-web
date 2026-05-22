import { normalizeError } from './errors';
import { normalizeFuzzyResults } from './normalizers';
import { createBrowserLogger } from '../logging/browser-logger';
import { type OfficialNotificationMethod, type OfficialServerRequestMethod } from './protocol';
import type { RuntimeState } from './types';
import { RuntimeStore } from './store';
import { WebsocketRpcClient } from './transport/websocket-client';

type ApprovalServiceLike = {
  requestApproval: (
    method: OfficialServerRequestMethod,
    payload: Record<string, unknown>,
  ) => Promise<unknown>;
  cancelPending: (reason?: string) => void;
};

type ThreadServiceLike = {
  handleThreadStatusChanged: (payload: Record<string, unknown>) => void;
  handleThreadStarted: (payload: Record<string, unknown>) => void;
  handleThreadArchived: (payload: Record<string, unknown>, archived: boolean) => void;
  handleThreadNameUpdated: (payload: Record<string, unknown>) => void;
  selectThread: (threadId: string) => Promise<unknown>;
  loadThreads: () => Promise<unknown>;
  loadLoadedThreads: () => Promise<unknown>;
};

type TurnServiceLike = {
  handleTurnCompleted: (payload: Record<string, unknown>) => void;
  handleReasoningDelta: (
    payload: Record<string, unknown>,
    kind:
      | 'plan'
      | 'file-change'
      | 'reasoning'
      | 'summary'
      | 'command'
      | 'terminal-interaction'
      | 'mcp-progress',
  ) => void;
  handleItemStarted: (payload: Record<string, unknown>) => void;
  handleItemCompleted: (payload: Record<string, unknown>) => void;
  handleAgentMessageDelta: (payload: Record<string, unknown>) => void;
  handleThreadRealtime: (payload: Record<string, unknown>, kind: string) => void;
};

type TerminalServiceLike = {
  handleExecOutputDelta: (payload: Record<string, unknown>) => void;
};

type AuthServiceLike = {
  loadAccount: () => Promise<unknown>;
  loadRateLimits: () => Promise<unknown>;
};

type FeatureServiceLike = {
  loadInfo: () => Promise<unknown>;
  loadApps?: (force?: boolean) => Promise<unknown>;
  handleAppsUpdated: () => void;
  loadModels: () => Promise<unknown>;
};

type ConnectionDeps = {
  store: RuntimeStore;
  client: WebsocketRpcClient;
  approvalService: ApprovalServiceLike;
  threadService: ThreadServiceLike;
  turnService: TurnServiceLike;
  terminalService: TerminalServiceLike;
  authService: AuthServiceLike;
  featureService: FeatureServiceLike;
  emitToast: (message: string, type?: 'info' | 'success' | 'error') => void;
  updateCapability: (
    group: 'requests' | 'notifications' | 'serverRequests',
    method: OfficialNotificationMethod | OfficialServerRequestMethod,
    status: 'supported' | 'unsupported',
  ) => void;
  scheduleDeferredBootstrapLoads: () => void;
  clearDeferredBootstrapTimers: () => void;
  refreshConnectionBanner: (message?: string) => void;
};

const logger = createBrowserLogger('runtime:connection');

export function buildDisconnectedRuntimePatch(
  state: RuntimeState,
  message: string,
): Partial<RuntimeState> {
  return {
    connected: false,
    connectionState: 'offline',
    connectionError: message,
    activeApprovalRequest: null,
    attachmentUploadInProgress: false,
    currentProcId: null,
    fileLoading: false,
    infoLoading: false,
    appsLoading: false,
    loginInProgress: false,
    review: {
      ...state.review,
      loading: false,
      error: '',
    },
    authStatus: {
      ...state.authStatus,
      loading: false,
      error: '',
    },
    configLoading: false,
    turnActive: false,
    terminalRunning: false,
    fuzzySearch: {
      ...state.fuzzySearch,
      loading: false,
      error: '',
    },
    externalAgents: {
      ...state.externalAgents,
      loading: false,
      error: '',
    },
    gitDiff: {
      ...state.gitDiff,
      loading: false,
      error: '',
    },
    workspaceSummary: {
      ...state.workspaceSummary,
      loading: false,
      error: '',
    },
  };
}

export function buildFuzzySearchCompletedPatch(
  state: RuntimeState,
  payload: Record<string, unknown>,
): Partial<RuntimeState> {
  const nextResults = normalizeFuzzyResults(payload);
  return {
    fuzzySearch: {
      ...state.fuzzySearch,
      loading: false,
      results: nextResults.length > 0 ? nextResults : state.fuzzySearch.results,
    },
  };
}

function registerNotificationHandler(
  client: WebsocketRpcClient,
  updateCapability: ConnectionDeps['updateCapability'],
  method: OfficialNotificationMethod,
  handler: (payload: Record<string, unknown>) => void,
) {
  client.onNotification(method, (payload) => {
    updateCapability('notifications', method, 'supported');
    handler(payload);
  });
}

function registerNotifications({
  client,
  store,
  threadService,
  turnService,
  terminalService,
  authService,
  featureService,
  emitToast,
  updateCapability,
}: Omit<
  ConnectionDeps,
  | 'approvalService'
  | 'scheduleDeferredBootstrapLoads'
  | 'clearDeferredBootstrapTimers'
  | 'refreshConnectionBanner'
>) {
  registerNotificationHandler(client, updateCapability, 'thread/status/changed', (payload) =>
    threadService.handleThreadStatusChanged(payload),
  );
  registerNotificationHandler(client, updateCapability, 'thread/started', (payload) =>
    threadService.handleThreadStarted(payload),
  );
  registerNotificationHandler(client, updateCapability, 'thread/archived', (payload) =>
    threadService.handleThreadArchived(payload, true),
  );
  registerNotificationHandler(client, updateCapability, 'thread/unarchived', (payload) =>
    threadService.handleThreadArchived(payload, false),
  );
  registerNotificationHandler(client, updateCapability, 'thread/name/updated', (payload) =>
    threadService.handleThreadNameUpdated(payload),
  );
  registerNotificationHandler(client, updateCapability, 'thread/closed', (payload) => {
    threadService.handleThreadStatusChanged({
      threadId: payload.threadId,
      status: { type: 'idle' },
    });
  });
  registerNotificationHandler(client, updateCapability, 'thread/compacted', async () => {
    const activeThreadId = store.getState().activeThread?.id;
    if (activeThreadId) {
      await threadService.selectThread(activeThreadId);
    }
  });
  registerNotificationHandler(client, updateCapability, 'turn/started', () => {
    store.patch({ turnActive: true });
  });
  registerNotificationHandler(client, updateCapability, 'turn/completed', (payload) =>
    turnService.handleTurnCompleted(payload),
  );
  registerNotificationHandler(client, updateCapability, 'turn/plan/updated', (payload) =>
    turnService.handleReasoningDelta(payload, 'plan'),
  );
  registerNotificationHandler(client, updateCapability, 'turn/diff/updated', (payload) =>
    turnService.handleReasoningDelta(payload, 'file-change'),
  );
  registerNotificationHandler(client, updateCapability, 'item/started', (payload) =>
    turnService.handleItemStarted(payload),
  );
  registerNotificationHandler(client, updateCapability, 'item/completed', (payload) =>
    turnService.handleItemCompleted(payload),
  );
  registerNotificationHandler(client, updateCapability, 'rawResponseItem/completed', (payload) =>
    turnService.handleItemCompleted(payload),
  );
  registerNotificationHandler(client, updateCapability, 'item/agentMessage/delta', (payload) =>
    turnService.handleAgentMessageDelta(payload),
  );
  registerNotificationHandler(client, updateCapability, 'item/reasoning/textDelta', (payload) =>
    turnService.handleReasoningDelta(payload, 'reasoning'),
  );
  registerNotificationHandler(
    client,
    updateCapability,
    'item/reasoning/summaryPartAdded',
    (payload) => turnService.handleReasoningDelta(payload, 'summary'),
  );
  registerNotificationHandler(
    client,
    updateCapability,
    'item/reasoning/summaryTextDelta',
    (payload) => turnService.handleReasoningDelta(payload, 'summary'),
  );
  registerNotificationHandler(client, updateCapability, 'item/plan/delta', (payload) =>
    turnService.handleReasoningDelta(payload, 'plan'),
  );
  registerNotificationHandler(
    client,
    updateCapability,
    'item/commandExecution/outputDelta',
    (payload) => turnService.handleReasoningDelta(payload, 'command'),
  );
  registerNotificationHandler(
    client,
    updateCapability,
    'item/commandExecution/terminalInteraction',
    (payload) => turnService.handleReasoningDelta(payload, 'terminal-interaction'),
  );
  registerNotificationHandler(client, updateCapability, 'item/fileChange/outputDelta', (payload) =>
    turnService.handleReasoningDelta(payload, 'file-change'),
  );
  registerNotificationHandler(client, updateCapability, 'item/mcpToolCall/progress', (payload) =>
    turnService.handleReasoningDelta(payload, 'mcp-progress'),
  );
  registerNotificationHandler(
    client,
    updateCapability,
    'item/autoApprovalReview/started',
    (payload) => turnService.handleThreadRealtime(payload, 'auto-approval-started'),
  );
  registerNotificationHandler(
    client,
    updateCapability,
    'item/autoApprovalReview/completed',
    (payload) => turnService.handleThreadRealtime(payload, 'auto-approval-completed'),
  );
  registerNotificationHandler(client, updateCapability, 'command/exec/outputDelta', (payload) =>
    terminalService.handleExecOutputDelta(payload),
  );
  registerNotificationHandler(client, updateCapability, 'account/updated', async () =>
    authService.loadAccount(),
  );
  registerNotificationHandler(client, updateCapability, 'account/rateLimits/updated', async () =>
    authService.loadRateLimits(),
  );
  registerNotificationHandler(client, updateCapability, 'account/login/completed', async () => {
    store.patch({ loginInProgress: false });
    await authService.loadAccount();
  });
  registerNotificationHandler(client, updateCapability, 'skills/changed', async () =>
    featureService.loadInfo(),
  );
  registerNotificationHandler(client, updateCapability, 'app/list/updated', () =>
    featureService.handleAppsUpdated(),
  );
  registerNotificationHandler(client, updateCapability, 'model/rerouted', (payload) =>
    emitToast(`Model rerouted to ${String(payload.model ?? 'unknown')}`, 'info'),
  );
  registerNotificationHandler(client, updateCapability, 'configWarning', (payload) =>
    emitToast(String(payload.message ?? 'Configuration warning'), 'info'),
  );
  registerNotificationHandler(client, updateCapability, 'deprecationNotice', (payload) =>
    emitToast(String(payload.message ?? 'Deprecation notice'), 'info'),
  );
  registerNotificationHandler(client, updateCapability, 'serverRequest/resolved', (payload) =>
    turnService.handleThreadRealtime(payload, 'server-request-resolved'),
  );
  registerNotificationHandler(
    client,
    updateCapability,
    'fuzzyFileSearch/sessionUpdated',
    (payload) => {
      const nextResults = normalizeFuzzyResults(payload);
      if (nextResults.length > 0) {
        store.patch({
          fuzzySearch: {
            ...store.getState().fuzzySearch,
            loading: true,
            results: nextResults,
          },
        });
      }
    },
  );
  registerNotificationHandler(
    client,
    updateCapability,
    'fuzzyFileSearch/sessionCompleted',
    (payload) => {
      store.patch(buildFuzzySearchCompletedPatch(store.getState(), payload));
    },
  );
  registerNotificationHandler(client, updateCapability, 'thread/realtime/started', (payload) =>
    turnService.handleThreadRealtime(payload, 'realtime-started'),
  );
  registerNotificationHandler(client, updateCapability, 'thread/realtime/itemAdded', (payload) =>
    turnService.handleThreadRealtime(payload, 'realtime-item'),
  );
  registerNotificationHandler(
    client,
    updateCapability,
    'thread/realtime/outputAudio/delta',
    (payload) => turnService.handleThreadRealtime(payload, 'realtime-audio'),
  );
  registerNotificationHandler(client, updateCapability, 'thread/realtime/error', (payload) =>
    turnService.handleThreadRealtime(payload, 'realtime-error'),
  );
  registerNotificationHandler(client, updateCapability, 'thread/realtime/closed', (payload) =>
    turnService.handleThreadRealtime(payload, 'realtime-closed'),
  );
  registerNotificationHandler(client, updateCapability, 'windows/worldWritableWarning', (payload) =>
    turnService.handleThreadRealtime(payload, 'windows-warning'),
  );
  registerNotificationHandler(
    client,
    updateCapability,
    'windowsSandbox/setupCompleted',
    (payload) => turnService.handleThreadRealtime(payload, 'windows-sandbox'),
  );
  registerNotificationHandler(client, updateCapability, 'hook/started', (payload) =>
    turnService.handleThreadRealtime(payload, 'hook-started'),
  );
  registerNotificationHandler(client, updateCapability, 'hook/completed', (payload) =>
    turnService.handleThreadRealtime(payload, 'hook-completed'),
  );
  registerNotificationHandler(client, updateCapability, 'error', (payload) =>
    emitToast(String(payload.message ?? 'RPC error'), 'error'),
  );
}

function registerServerRequests({
  client,
  approvalService,
  updateCapability,
}: Pick<ConnectionDeps, 'client' | 'approvalService' | 'updateCapability'>) {
  const methods: OfficialServerRequestMethod[] = [
    'item/commandExecution/requestApproval',
    'item/fileChange/requestApproval',
    'item/tool/requestUserInput',
    'mcpServer/elicitation/request',
    'item/permissions/requestApproval',
    'item/tool/call',
    'account/chatgptAuthTokens/refresh',
    'applyPatchApproval',
    'execCommandApproval',
  ];

  methods.forEach((method) => {
    client.onServerRequest(method, async (payload) => {
      updateCapability('serverRequests', method, 'supported');
      try {
        return await approvalService.requestApproval(method, payload);
      } catch (error) {
        return { cancelled: true, error: normalizeError(error) };
      }
    });
  });
}

export function registerRuntimeConnection(deps: ConnectionDeps) {
  const {
    client,
    store,
    authService,
    featureService,
    threadService,
    emitToast,
    clearDeferredBootstrapTimers,
    refreshConnectionBanner,
    scheduleDeferredBootstrapLoads,
  } = deps;

  registerNotifications(deps);
  registerServerRequests(deps);

  client.onControl((type, payload) => {
    logger.debug('Connection control event received', { type, payload });
    if (type === 'connecting') {
      store.patch({
        connectionState: 'connecting',
        connectionBanner: {
          ...store.getState().connectionBanner,
          target: String(payload.url ?? store.getState().connectionBanner.target),
          visible: true,
          message: 'Connecting to Codex backend…',
        },
      });
      return;
    }

    if (type === 'connected') {
      store.patch({
        connected: true,
        connectionState: 'connecting',
        connectionError: '',
        connectionBanner: {
          ...store.getState().connectionBanner,
          target: String(payload.url ?? store.getState().connectionBanner.target),
          visible: true,
          message: 'Codex backend connected, initializing session…',
        },
      });
      return;
    }

    if (type === 'ready') {
      store.patch({
        connected: true,
        connectionState: 'connected',
        connectionError: '',
        connectionBanner: {
          ...store.getState().connectionBanner,
          visible: false,
          message: '',
        },
      });
      emitToast('Connected to Codex backend', 'success');
      logger.info('Codex backend is ready');
      void Promise.all([
        authService.loadAccount(),
        authService.loadRateLimits(),
        featureService.loadModels(),
        threadService.loadThreads(),
        threadService.loadLoadedThreads(),
      ]);
      scheduleDeferredBootstrapLoads();
      return;
    }

    if (type === 'readyError') {
      const message = String(payload.message ?? 'Codex initialize failed');
      logger.error('Codex backend initialization failed', { message });
      store.patch({
        connected: false,
        connectionState: 'error',
        connectionError: message,
      });
      refreshConnectionBanner(message);
      emitToast(message, 'error');
      return;
    }

    if (type === 'disconnected') {
      clearDeferredBootstrapTimers();
      const message = String(payload.reason ?? 'Connection closed');
      deps.approvalService.cancelPending(`Connection lost: ${message}`);
      logger.warn('Codex backend disconnected', {
        code: payload.code,
        reason: message,
      });
      store.patch(buildDisconnectedRuntimePatch(store.getState(), message));
      refreshConnectionBanner(message);
      emitToast('Codex backend disconnected', 'error');
      return;
    }

    if (type === 'error') {
      clearDeferredBootstrapTimers();
      const message = String(payload.message ?? 'Unknown WebSocket error');
      deps.approvalService.cancelPending(`Connection error: ${message}`);
      logger.error('Codex websocket control error', { message });
      store.patch({
        ...buildDisconnectedRuntimePatch(store.getState(), message),
        connectionState: 'error',
      });
      refreshConnectionBanner(message);
      emitToast(message, 'error');
    }
  });
}
