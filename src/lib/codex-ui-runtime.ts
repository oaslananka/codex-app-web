'use client';

export type {
  AppSummary,
  ApprovalRequestState,
  ChatEntry,
  ExperimentalFeatureSummary,
  FileBreadcrumbSegment,
  FileMetadataSummary,
  FileTreeNode,
  IntegrationWarning,
  McpServerSummary,
  ModelSummary,
  PendingAttachmentSummary,
  PluginDetailSummary,
  PluginSummary,
  RuntimeSnapshot,
  SkillSummary,
  TerminalOutputLine,
  ThreadSummary,
  ThreadStatus,
} from './codex-runtime/types';

import {
  OFFICIAL_NOTIFICATION_METHODS,
  OFFICIAL_REQUEST_METHODS,
  OFFICIAL_SERVER_REQUEST_METHODS,
  REQUEST_COMPATIBILITY_MAP,
  type OfficialNotificationMethod,
  type OfficialRequestMethod,
  type OfficialServerRequestMethod,
} from './codex-runtime/protocol';
import { isMethodUnavailable, normalizeError } from './codex-runtime/errors';
import type { CollaborationModeValue } from './codex-runtime/collaboration';
import { sanitizeSelectedEffort } from './codex-runtime/reasoning';
import { RuntimeStore } from './codex-runtime/store';
import type { RuntimeSnapshot, RuntimeState } from './codex-runtime/types';
import { reconcileMethodSupportLists } from './codex-runtime/capability-state';
import { WebsocketRpcClient } from './codex-runtime/transport/websocket-client';
import { ThreadService } from './codex-runtime/services/thread-service';
import { TerminalService } from './codex-runtime/services/terminal-service';
import { FileService } from './codex-runtime/services/file-service';
import { AuthService } from './codex-runtime/services/auth-service';
import { FeatureService } from './codex-runtime/services/feature-service';
import { WorkspaceService } from './codex-runtime/services/workspace-service';
import { ApprovalService } from './codex-runtime/services/approval-service';
import { TurnService } from './codex-runtime/services/turn-service';
import { registerRuntimeConnection } from './codex-runtime/runtime-connection';
import { createBrowserLogger } from './logging/browser-logger';
import {
  applyPersistedRuntimeState,
  buildInitialState,
  createPersistedRuntimeStateScheduler,
  readPersistedRuntimeState,
  trackedNotifications,
  trackedRequests,
  trackedServerRequests,
} from './codex-runtime/runtime-state';

const ALLOWED_UPLOAD_MIME_TYPES = new Set([
  'image/png',
  'image/jpeg',
  'image/gif',
  'image/webp',
  'image/bmp',
  'image/x-icon',
  'image/avif',
]);

type ToastEntry = {
  id: string;
  message: string;
  type: 'info' | 'success' | 'error';
};

const logger = createBrowserLogger('ui-runtime');

const toastListeners = new Set<(toast: ToastEntry) => void>();

const store = new RuntimeStore(buildInitialState());
const client = new WebsocketRpcClient();
const approvalService = new ApprovalService(store);

function emitToast(message: string, type: ToastEntry['type'] = 'info') {
  logger.debug('Emitting toast', { message, type });
  const toast = {
    id: `toast-${Date.now()}-${Math.random().toString(16).slice(2)}`,
    message,
    type,
  };
  toastListeners.forEach((listener) => listener(toast));
}

function updateCapability<
  K extends OfficialRequestMethod | OfficialNotificationMethod | OfficialServerRequestMethod,
>(
  group: 'requests' | 'notifications' | 'serverRequests',
  method: K,
  status: 'supported' | 'unsupported',
) {
  const state = store.getState();
  const methodSupportLists = reconcileMethodSupportLists({
    supportedMethods: state.supportedMethods,
    unsupportedMethods: state.unsupportedMethods,
    method,
    status,
  });
  store.patch({
    capabilities: {
      ...state.capabilities,
      [group]: {
        ...state.capabilities[group],
        [method]: status,
      },
    },
    supportedMethods: methodSupportLists.supportedMethods,
    unsupportedMethods: methodSupportLists.unsupportedMethods,
  });
}

async function requestCompat<T = unknown>(
  canonicalMethod: string,
  params?: unknown,
  fallbacks?: readonly string[],
) {
  const methods = [
    ...new Set([
      canonicalMethod,
      ...(fallbacks ?? REQUEST_COMPATIBILITY_MAP[canonicalMethod] ?? []),
    ]),
  ];
  let lastError: unknown = null;

  for (const method of methods) {
    try {
      const response = await client.request(method, params);
      if (OFFICIAL_REQUEST_METHODS.includes(method as OfficialRequestMethod)) {
        updateCapability('requests', method as OfficialRequestMethod, 'supported');
      }
      return response as T;
    } catch (error) {
      lastError = error;
      if (!isMethodUnavailable(error)) {
        throw error;
      }
      if (OFFICIAL_REQUEST_METHODS.includes(method as OfficialRequestMethod)) {
        updateCapability('requests', method as OfficialRequestMethod, 'unsupported');
      }
    }
  }

  throw lastError ?? new Error(`Request failed for ${canonicalMethod}`);
}

const sharedDeps = {
  requestCompat,
  markRequestSupported(method: string) {
    if (OFFICIAL_REQUEST_METHODS.includes(method as OfficialRequestMethod)) {
      updateCapability('requests', method as OfficialRequestMethod, 'supported');
    }
  },
  markRequestUnsupported(method: string) {
    if (OFFICIAL_REQUEST_METHODS.includes(method as OfficialRequestMethod)) {
      updateCapability('requests', method as OfficialRequestMethod, 'unsupported');
    }
  },
  toast: emitToast,
};

const threadService = new ThreadService(store, sharedDeps);
const terminalService = new TerminalService(store, sharedDeps);
const fileService = new FileService(store, sharedDeps);
const authService = new AuthService(store, sharedDeps);
const featureService = new FeatureService(store, sharedDeps);
const workspaceService = new WorkspaceService(store, sharedDeps);
const turnService = new TurnService(store, sharedDeps, {
  appendUserDraftEntry(entry) {
    threadService.appendUserDraftEntry(entry);
  },
  ensureWritableThread(threadId) {
    return threadService.ensureWritableThread(threadId);
  },
  upsertThreadEntry(threadId, entry) {
    threadService.upsertThreadEntry(threadId, entry);
  },
});

function restorePersistedRuntimeState() {
  const persisted = readPersistedRuntimeState();
  if (!Object.keys(persisted).length) return;
  store.patch(applyPersistedRuntimeState(store.getState(), persisted));
}

if (typeof window !== 'undefined') {
  const persistedRuntimeStateScheduler = createPersistedRuntimeStateScheduler();
  store.subscribe((state) => {
    persistedRuntimeStateScheduler.schedule(state);
  });
}

let initialized = false;
let deferredConfigTimer: ReturnType<typeof setTimeout> | null = null;
let deferredInfoTimer: ReturnType<typeof setTimeout> | null = null;

function clearDeferredBootstrapTimers() {
  if (deferredConfigTimer) {
    clearTimeout(deferredConfigTimer);
    deferredConfigTimer = null;
  }
  if (deferredInfoTimer) {
    clearTimeout(deferredInfoTimer);
    deferredInfoTimer = null;
  }
}

function scheduleDeferredBootstrapLoads() {
  clearDeferredBootstrapTimers();

  deferredConfigTimer = setTimeout(() => {
    void ensureConfigLoaded(true);
  }, 250);

  deferredInfoTimer = setTimeout(() => {
    void ensureInfoLoaded(true);
  }, 1000);
}

function refreshConnectionBanner(message = '') {
  const state = store.getState();
  store.patch({
    connectionBanner: {
      ...state.connectionBanner,
      visible: state.connectionState !== 'connected',
      message,
    },
  });
}
registerRuntimeConnection({
  store,
  client,
  approvalService,
  threadService,
  turnService,
  terminalService,
  authService,
  featureService,
  emitToast,
  updateCapability,
  scheduleDeferredBootstrapLoads,
  clearDeferredBootstrapTimers,
  refreshConnectionBanner,
});

export function initCodexUi() {
  if (initialized) return;
  initialized = true;
  logger.info('Initializing Codex UI runtime');
  restorePersistedRuntimeState();
  client.connect();
}

export function subscribe(listener: (snapshot: RuntimeSnapshot) => void) {
  return store.subscribe((state) => listener(state));
}

export function getSnapshot(): RuntimeSnapshot {
  return store.getState();
}

export function subscribeToToasts(listener: (toast: ToastEntry) => void) {
  toastListeners.add(listener);
  return () => toastListeners.delete(listener);
}

export function setActiveTab(tabName: RuntimeState['activeTab']) {
  store.patch({ activeTab: tabName });
}

export function setCommentaryVisible(visible: boolean) {
  store.patch({ showCommentary: visible });
}

export function setCollaborationMode(value: CollaborationModeValue) {
  store.patch({ collaborationMode: value });
}

export function setMessageDraft(value: string) {
  store.patch({ messageDraft: value });
}

export function setSelectedModel(value: string) {
  const state = store.getState();
  store.patch({
    selectedModel: value,
    selectedEffort: sanitizeSelectedEffort(state.models, value, state.selectedEffort),
  });
}

export function setSelectedEffort(value: string) {
  const state = store.getState();
  store.patch({
    selectedEffort: sanitizeSelectedEffort(state.models, state.selectedModel, value),
  });
}

export function setSelectedServiceTier(value: string) {
  store.patch({ selectedServiceTier: value });
}

export function setSelectedSandboxMode(value: string) {
  store.patch({ selectedSandboxMode: value });
}

export function focusThreadSearch() {
  const input = document.getElementById('thread-search') as HTMLInputElement | null;
  input?.focus();
  input?.select();
}

export function startNewThread() {
  return threadService.startThread();
}

export function createThreadWithOptions(options: { cwd?: string; instructions?: string }) {
  return threadService.startThread(options);
}

export function refreshThreads() {
  return threadService.loadThreads();
}

export function setThreadFilter(filter: string) {
  threadService.setThreadFilter(filter);
  return threadService.loadThreads();
}

export function setThreadSearch(searchTerm: string) {
  threadService.setThreadSearch(searchTerm);
}

export function selectThreadById(threadId: string) {
  return threadService.selectThread(threadId);
}

export function archiveThreadById(threadId: string, isArchived?: boolean) {
  return threadService.archiveThread(threadId, isArchived);
}

export function forkThreadById(threadId: string) {
  return threadService.forkThread(threadId);
}

export function renameActiveThread(name: string) {
  return threadService.renameActiveThread(name);
}

export function updateActiveThreadMetadata(metadata: Record<string, unknown>) {
  return threadService.updateThreadMetadata(metadata);
}

export function rollbackActiveThread() {
  return threadService.rollbackActiveThread();
}

export function compactActiveThread() {
  return threadService.compactActiveThread();
}

export function startLoginFlow() {
  return authService.startLogin();
}

export function cancelLoginFlow() {
  return authService.cancelLogin();
}

export function logoutAccount() {
  return authService.logout();
}

export function refreshAuthStatus() {
  return authService.refreshAuthStatus();
}

export function writeConfigValue(key: string, value: unknown) {
  return featureService.writeConfigValue(key, value);
}

export function ensureConfigLoaded(force = false) {
  const state = store.getState();
  if (!force && (state.configHydrated || state.configLoading)) {
    return Promise.resolve();
  }
  return featureService.loadConfig();
}

export function batchWriteConfig(values: Record<string, unknown>) {
  return featureService.batchWriteConfig(values);
}

export function reloadMcpServers() {
  return featureService.reloadMcpServers();
}

export function ensureInfoLoaded(force = false) {
  const state = store.getState();
  if (!force && (state.infoHydrated || state.infoLoading)) {
    return Promise.resolve();
  }
  return featureService.loadInfo();
}

export function ensureAppsLoaded(force = false) {
  const state = store.getState();
  if (!force && (state.appsHydrated || state.appsLoading)) {
    return Promise.resolve();
  }
  return featureService.loadApps(force);
}

export function setSkillEnabled(id: string, name: string | undefined, enabled: boolean) {
  return featureService.setSkillEnabled(id, name, enabled);
}

export function setExperimentalFeatureEnabled(key: string, enabled: boolean) {
  return featureService.setExperimentalFeatureEnabled(key, enabled);
}

export function installPlugin(id: string) {
  return featureService.installPlugin(id);
}

export function uninstallPlugin(id: string) {
  return featureService.uninstallPlugin(id);
}

export function loadPluginDetail(id: string) {
  return featureService.loadPluginDetail(id);
}

export function loadApps(force = false) {
  return featureService.loadApps(force);
}

export function setFilesPath(path: string) {
  fileService.setRootPath(path);
}

export function browseFilesPath(path?: string) {
  return fileService.browse(path);
}

export function toggleFileDirectory(path: string) {
  return fileService.toggleDirectory(path);
}

export function openFilePath(path: string, name?: string) {
  return fileService.openFile(path, name);
}

export function setFileEditorContent(content: string) {
  fileService.setEditorContent(content);
}

export function saveCurrentFile() {
  return fileService.saveCurrentFile();
}

export function createNewFile(name: string) {
  return fileService.createFile(name);
}

export function createNewDir(name: string) {
  return fileService.createDirectory(name);
}

export function copyFilePath(sourcePath: string, destinationPath: string) {
  return fileService.copyPath(sourcePath, destinationPath);
}

export function removeFilePath(path: string) {
  return fileService.removePath(path);
}

export function setTerminalCommand(command: string) {
  terminalService.setCommand(command);
}

export function setTerminalCwd(cwd: string) {
  terminalService.setCwd(cwd);
}

export function setTerminalStdin(data: string) {
  terminalService.setStdin(data);
}

export function setTerminalSize(cols: number, rows: number) {
  terminalService.setTerminalSize(cols, rows);
}

export function runTerminalCommand() {
  return terminalService.run();
}

export function killTerminalProcess() {
  return terminalService.kill();
}

export function writeTerminalStdin() {
  return terminalService.write();
}

export function sendChatMessage() {
  return turnService.sendMessage();
}

export function interruptActiveTurn() {
  return turnService.interruptTurn();
}

export function steerActiveTurn() {
  return turnService.steerTurn();
}

export function queueAttachmentFiles(fileList: FileList | File[]) {
  const files = Array.from(fileList || []);
  if (!files.length) return Promise.resolve();
  store.patch({ attachmentUploadInProgress: true });

  return Promise.all(
    files.map(async (file) => {
      if (!(file instanceof File) || !ALLOWED_UPLOAD_MIME_TYPES.has(file.type)) {
        emitToast(`${file.name} is not a supported image`, 'error');
        return;
      }

      const id = `attachment-${Date.now()}-${Math.random().toString(16).slice(2)}`;
      store.patch((state) => ({
        pendingAttachments: [
          ...state.pendingAttachments,
          {
            id,
            name: file.name,
            mimeType: file.type,
            size: file.size,
            status: 'uploading',
          },
        ],
      }));

      try {
        const fileDataUrl = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => {
            const result = typeof reader.result === 'string' ? reader.result : '';
            resolve(result);
          };
          reader.onerror = () => reject(reader.error);
          reader.readAsDataURL(file);
        });
        const dataBase64 = fileDataUrl.includes(',')
          ? (fileDataUrl.split(',').pop() ?? '')
          : fileDataUrl;

        store.patch((state) => ({
          pendingAttachments: state.pendingAttachments.map((attachment) =>
            attachment.id === id ? { ...attachment, previewUrl: fileDataUrl } : attachment,
          ),
        }));

        const response = await fetch('/api/uploads', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            name: file.name,
            mimeType: file.type,
            dataBase64,
          }),
        });
        const payload = await response.json();
        if (!response.ok || !payload?.path) {
          throw new Error(payload?.error || 'Upload failed');
        }

        store.patch((state) => ({
          pendingAttachments: state.pendingAttachments.map((attachment) =>
            attachment.id === id
              ? {
                  ...attachment,
                  status: 'ready',
                  path: String(payload.path),
                  previewUrl: attachment.previewUrl || fileDataUrl,
                }
              : attachment,
          ),
        }));
      } catch (error) {
        emitToast(`Upload failed: ${normalizeError(error)}`, 'error');
        store.patch((state) => ({
          pendingAttachments: state.pendingAttachments.filter((attachment) => attachment.id !== id),
        }));
      }
    }),
  ).finally(() => {
    store.patch((state) => ({
      attachmentUploadInProgress: state.pendingAttachments.some(
        (attachment) => attachment.status === 'uploading',
      ),
    }));
  });
}

export function openImagePicker() {
  const input = document.getElementById('chat-image-input') as HTMLInputElement | null;
  input?.click();
}

export function removePendingAttachmentById(id: string) {
  store.patch((state) => ({
    pendingAttachments: state.pendingAttachments.filter((attachment) => attachment.id !== id),
    attachmentUploadInProgress: state.pendingAttachments.some(
      (attachment) => attachment.id !== id && attachment.status === 'uploading',
    ),
  }));
}

export function loadWorkspaceSummary() {
  return workspaceService.loadConversationSummary();
}

export function loadGitDiff() {
  return workspaceService.loadGitDiff();
}

export function runFuzzyFileSearch(query: string) {
  return workspaceService.searchFiles(query);
}

export function startThreadReview() {
  return workspaceService.startReview();
}

export function detectExternalAgentConfig() {
  return workspaceService.detectExternalAgents();
}

export function importExternalAgentConfig() {
  return workspaceService.importExternalAgents();
}

export function resolveApprovalRequest(
  action: 'confirm' | 'alternate' | 'deny',
  values: {
    text?: string;
    answers?: Record<string, string[]>;
    accessToken?: string;
    chatgptAccountId?: string;
    chatgptPlanType?: string;
  },
) {
  approvalService.resolveApproval(action, values);
}

export function dismissApprovalRequest() {
  approvalService.dismissApproval();
}

export function closeTransientUi() {
  if (store.getState().activeApprovalRequest) {
    dismissApprovalRequest();
    return true;
  }
  return false;
}

export function reconnectCodex() {
  logger.info('Manual reconnect requested');
  client.reconnect();
}
