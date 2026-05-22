import type { CollaborationModeValue } from './collaboration';
import { getFallbackCollaborationModes } from './collaboration';
import {
  buildProtocolCoverage,
  createAvailabilityMap,
  OFFICIAL_NOTIFICATION_METHODS,
  OFFICIAL_REQUEST_METHODS,
  OFFICIAL_SERVER_REQUEST_METHODS,
} from './protocol';
import type {
  OfficialNotificationMethod,
  OfficialRequestMethod,
  OfficialServerRequestMethod,
} from './protocol';
import type { RuntimeState } from './types';

export type PersistedRuntimeState = Partial<
  Pick<
    RuntimeState,
    | 'activeFilter'
    | 'activeThreadId'
    | 'searchTerm'
    | 'activeTab'
    | 'showCommentary'
    | 'collaborationMode'
    | 'selectedModel'
    | 'selectedEffort'
    | 'selectedServiceTier'
    | 'selectedSandboxMode'
  >
>;

type PersistedRuntimeEnvelope = {
  version: number;
  state: PersistedRuntimeState;
};

export const RUNTIME_STORAGE_KEY = 'codex-control-center.runtime';
export const PERSISTED_RUNTIME_VERSION = 2;
const DEFAULT_PERSIST_THROTTLE_MS = 250;

export const trackedRequests = new Set<string>([
  'account/read',
  'account/logout',
  'account/rateLimits/read',
  'account/login/start',
  'account/login/cancel',
  'thread/start',
  'thread/list',
  'thread/read',
  'thread/fork',
  'thread/archive',
  'thread/unarchive',
  'thread/name/set',
  'thread/metadata/update',
  'thread/compact/start',
  'thread/rollback',
  'thread/unsubscribe',
  'thread/loaded/list',
  'turn/start',
  'turn/interrupt',
  'turn/steer',
  'model/list',
  'config/read',
  'config/value/write',
  'config/batchWrite',
  'config/mcpServer/reload',
  'configRequirements/read',
  'mcpServerStatus/list',
  'experimentalFeature/list',
  'skills/list',
  'skills/config/write',
  'plugin/list',
  'plugin/read',
  'plugin/install',
  'plugin/uninstall',
  'app/list',
  'review/start',
  'fs/readDirectory',
  'fs/readFile',
  'fs/writeFile',
  'fs/createDirectory',
  'fs/getMetadata',
  'fs/remove',
  'fs/copy',
  'command/exec',
  'command/exec/write',
  'command/exec/terminate',
  'command/exec/resize',
  'collaborationMode/list',
  'getConversationSummary',
  'gitDiffToRemote',
  'getAuthStatus',
  'fuzzyFileSearch',
  'externalAgentConfig/detect',
  'externalAgentConfig/import',
]);

export const trackedNotifications = new Set<string>([
  'thread/status/changed',
  'thread/started',
  'thread/archived',
  'thread/unarchived',
  'thread/name/updated',
  'thread/closed',
  'thread/compacted',
  'turn/started',
  'turn/completed',
  'turn/plan/updated',
  'turn/diff/updated',
  'item/started',
  'item/completed',
  'rawResponseItem/completed',
  'item/agentMessage/delta',
  'item/reasoning/textDelta',
  'item/reasoning/summaryPartAdded',
  'item/reasoning/summaryTextDelta',
  'item/plan/delta',
  'item/commandExecution/outputDelta',
  'item/commandExecution/terminalInteraction',
  'item/fileChange/outputDelta',
  'item/mcpToolCall/progress',
  'item/autoApprovalReview/started',
  'item/autoApprovalReview/completed',
  'account/updated',
  'account/rateLimits/updated',
  'account/login/completed',
  'model/rerouted',
  'deprecationNotice',
  'configWarning',
  'skills/changed',
  'app/list/updated',
  'command/exec/outputDelta',
  'serverRequest/resolved',
  'fuzzyFileSearch/sessionUpdated',
  'fuzzyFileSearch/sessionCompleted',
  'thread/realtime/started',
  'thread/realtime/itemAdded',
  'thread/realtime/outputAudio/delta',
  'thread/realtime/error',
  'thread/realtime/closed',
  'windows/worldWritableWarning',
  'windowsSandbox/setupCompleted',
  'hook/started',
  'hook/completed',
  'error',
]);

export const trackedServerRequests = new Set<string>([
  'item/commandExecution/requestApproval',
  'item/fileChange/requestApproval',
  'item/tool/requestUserInput',
  'mcpServer/elicitation/request',
  'item/permissions/requestApproval',
  'item/tool/call',
  'account/chatgptAuthTokens/refresh',
  'applyPatchApproval',
  'execCommandApproval',
]);

export function readPersistedRuntimeState(): PersistedRuntimeState {
  if (typeof window === 'undefined') return {};
  try {
    const raw = window.localStorage.getItem(RUNTIME_STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as PersistedRuntimeEnvelope | PersistedRuntimeState;
    if (!parsed || typeof parsed !== 'object') {
      return {};
    }

    const version = Reflect.get(parsed, 'version');
    const persistedState = Reflect.get(parsed, 'state');
    if (
      version !== PERSISTED_RUNTIME_VERSION ||
      !persistedState ||
      typeof persistedState !== 'object'
    ) {
      return {};
    }

    return persistedState as PersistedRuntimeState;
  } catch {
    return {};
  }
}

export function writePersistedRuntimeState(state: PersistedRuntimeState) {
  if (typeof window === 'undefined') return;
  try {
    const payload: PersistedRuntimeEnvelope = {
      version: PERSISTED_RUNTIME_VERSION,
      state,
    };
    window.localStorage.setItem(RUNTIME_STORAGE_KEY, JSON.stringify(payload));
  } catch {
    // Ignore storage failures.
  }
}

export function createPersistedRuntimeStateScheduler(options?: { throttleMs?: number }) {
  const throttleMs = options?.throttleMs ?? DEFAULT_PERSIST_THROTTLE_MS;
  let queuedState: PersistedRuntimeState | null = null;
  let timer: ReturnType<typeof setTimeout> | null = null;

  const flush = () => {
    if (!queuedState) return;
    writePersistedRuntimeState(queuedState);
    queuedState = null;
  };

  return {
    schedule(runtimeState: RuntimeState) {
      queuedState = buildPersistedRuntimeState(runtimeState);
      if (timer != null) return;
      timer = globalThis.setTimeout(() => {
        timer = null;
        flush();
      }, throttleMs);
    },
    flush,
    cancel() {
      if (timer != null) {
        globalThis.clearTimeout(timer);
        timer = null;
      }
      queuedState = null;
    },
  };
}

export function buildPersistedRuntimeState(runtimeState: RuntimeState): PersistedRuntimeState {
  return {
    activeFilter: runtimeState.activeFilter,
    activeThreadId: runtimeState.activeThreadId,
    searchTerm: runtimeState.searchTerm,
    activeTab: runtimeState.activeTab,
    showCommentary: runtimeState.showCommentary,
    collaborationMode: runtimeState.collaborationMode,
    selectedModel: runtimeState.selectedModel,
    selectedEffort: runtimeState.selectedEffort,
    selectedServiceTier: runtimeState.selectedServiceTier,
    selectedSandboxMode: runtimeState.selectedSandboxMode,
  };
}

export function applyPersistedRuntimeState(
  state: RuntimeState,
  persisted: PersistedRuntimeState,
): Partial<RuntimeState> {
  const restoredActiveThreadId =
    typeof persisted.activeThreadId === 'string' && persisted.activeThreadId.trim().length > 0
      ? persisted.activeThreadId
      : state.activeThreadId;
  const restoredActiveThread =
    state.threads.find((thread) => thread.id === restoredActiveThreadId) ?? state.activeThread;
  const restoredChatEntries = restoredActiveThreadId
    ? (state.threadEntries[restoredActiveThreadId] ?? state.chatEntries)
    : state.chatEntries;

  return {
    activeFilter: persisted.activeFilter ?? state.activeFilter,
    activeThreadId: restoredActiveThreadId,
    searchTerm: persisted.searchTerm ?? state.searchTerm,
    activeTab: persisted.activeTab ?? state.activeTab,
    showCommentary: persisted.showCommentary ?? state.showCommentary,
    collaborationMode: persisted.collaborationMode ?? state.collaborationMode,
    selectedModel: persisted.selectedModel ?? state.selectedModel,
    selectedEffort: persisted.selectedEffort ?? state.selectedEffort,
    selectedServiceTier: persisted.selectedServiceTier ?? state.selectedServiceTier,
    selectedSandboxMode: persisted.selectedSandboxMode ?? state.selectedSandboxMode,
    threads: state.threads,
    visibleThreads: state.visibleThreads,
    threadEntries: state.threadEntries,
    activeThread: restoredActiveThread,
    activeThreadStatus: restoredActiveThread?.status ?? state.activeThreadStatus,
    chatEntries: restoredChatEntries,
  };
}

export function buildInitialState(): RuntimeState {
  return {
    connected: false,
    connectionState: 'offline',
    connectionError: '',
    activeThreadId: null,
    activeTab: 'chat',
    activeFilter: 'active',
    searchTerm: '',
    visibleThreads: [],
    activeThread: null,
    activeThreadStatus: { type: 'idle' },
    loggedIn: false,
    loginInProgress: false,
    accountEmail: 'Not connected',
    accountPlan: '',
    showCommentary: false,
    pendingAttachments: [],
    attachmentUploadInProgress: false,
    turnActive: false,
    collaborationMode: 'default' as CollaborationModeValue,
    collaborationModes: getFallbackCollaborationModes(),
    messageDraft: '',
    selectedModel: '',
    selectedEffort: '',
    selectedServiceTier: '',
    selectedSandboxMode: '',
    models: [],
    configData: null,
    configHydrated: false,
    configLoading: false,
    configError: '',
    integrationWarnings: [],
    configMcpServers: [],
    configRequirements: null,
    infoHydrated: false,
    infoLoading: false,
    infoError: '',
    appsHydrated: false,
    appsLoading: false,
    appsError: '',
    infoMcpServers: [],
    skills: [],
    experimentalFeatures: [],
    plugins: [],
    pluginDetail: null,
    apps: [],
    fileBrowserPath: '/',
    fileBreadcrumb: [{ label: '/', path: '/' }],
    fileTree: [],
    fileLoading: false,
    fileError: '',
    currentFilePath: null,
    fileEditorName: 'No file selected',
    fileEditorContent: '',
    fileEditorReadOnly: true,
    fileMetadata: null,
    terminalCommand: '',
    terminalCwd: '',
    terminalStdin: '',
    terminalOutput: [],
    terminalRunning: false,
    terminalSize: { cols: 120, rows: 32 },
    chatEntries: [],
    activeApprovalRequest: null,
    protocolCoverage: buildProtocolCoverage({
      requests: trackedRequests,
      notifications: trackedNotifications,
      serverRequests: trackedServerRequests,
    }),
    capabilities: {
      requests: createAvailabilityMap(OFFICIAL_REQUEST_METHODS),
      notifications: createAvailabilityMap(OFFICIAL_NOTIFICATION_METHODS),
      serverRequests: createAvailabilityMap(OFFICIAL_SERVER_REQUEST_METHODS),
    },
    workspaceSummary: {
      content: '',
      source: 'idle',
      loading: false,
      error: '',
    },
    gitDiff: {
      content: '',
      loading: false,
      error: '',
    },
    authStatus: {
      content: '',
      loading: false,
      error: '',
    },
    fuzzySearch: {
      query: '',
      loading: false,
      error: '',
      results: [],
    },
    review: {
      loading: false,
      error: '',
      reviewThreadId: null,
    },
    externalAgents: {
      loading: false,
      error: '',
      items: [],
      importedCount: 0,
    },
    connectionBanner: {
      visible: false,
      target: 'ws://localhost:40000',
      message: '',
    },
    threads: [],
    threadEntries: {},
    currentProcId: null,
    fileTreeCache: {},
    fileTreeExpanded: ['/'],
    unsupportedMethods: [],
    supportedMethods: [],
    configBatchDraft: {},
  };
}

export type TrackedProtocolSets = {
  trackedRequests: Set<string>;
  trackedNotifications: Set<string>;
  trackedServerRequests: Set<string>;
};

export function getTrackedProtocolSets(): TrackedProtocolSets {
  return {
    trackedRequests,
    trackedNotifications,
    trackedServerRequests,
  };
}

export type ProtocolMethodTypes = {
  OfficialNotificationMethod: OfficialNotificationMethod;
  OfficialRequestMethod: OfficialRequestMethod;
  OfficialServerRequestMethod: OfficialServerRequestMethod;
};
