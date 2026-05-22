import {
  isInitializationPendingError,
  isMethodUnavailable,
  isRolloutUnavailableError,
  isThreadEmptyBeforeFirstUserMessageError,
  normalizeError,
} from '../errors';
import { buildCollaborationMode } from '../collaboration';
import {
  normalizeChatEntry,
  normalizeThread,
  normalizeThreadEntries,
  normalizeThreadSessionSettings,
  normalizeThreadsResponse,
  normalizeThreadStatus,
} from '../normalizers';
import { sanitizeBackendThreadId } from '../thread-ids';
import type { RuntimeStore } from '../store';
import type { ChatEntry, RuntimeState, ThreadSummary } from '../types';

type ServiceDeps = {
  requestCompat: <T = unknown>(
    canonicalMethod: string,
    params?: unknown,
    fallbacks?: readonly string[],
  ) => Promise<T>;
  markRequestSupported(method: string): void;
  markRequestUnsupported(method: string): void;
  toast(message: string, type?: 'info' | 'success' | 'error'): void;
};

function normalizePath(path: string | null | undefined) {
  if (!path) return '/';
  return path.replace(/\\/g, '/');
}

function buildThreadUnavailableEntry(threadId: string, content: string): ChatEntry {
  return {
    id: `thread-unavailable-${threadId}`,
    kind: 'system',
    role: 'system',
    title: 'Thread unavailable',
    label: 'UNAVAILABLE',
    content,
    status: 'error',
  };
}

function hasMeaningfulThreadHistory(entries: ChatEntry[]) {
  if (!entries.length) return false;
  return entries.some(
    (entry) =>
      entry.kind !== 'system' ||
      (entry.label !== 'UNAVAILABLE' &&
        !String(entry.content ?? '').includes('Thread history is unavailable') &&
        !String(entry.content ?? '').includes('cannot be reopened')),
  );
}

function shouldRetainMissingThread(state: RuntimeState, thread: ThreadSummary) {
  if (sanitizeBackendThreadId(thread.id)) {
    return true;
  }

  const entries = state.threadEntries[thread.id] ?? [];
  if (hasMeaningfulThreadHistory(entries)) {
    return true;
  }

  if (state.activeThreadId !== thread.id) {
    return false;
  }

  return Boolean(state.messageDraft.trim() || state.pendingAttachments.length);
}

function mergeIncomingThreads(state: RuntimeState, incomingThreads: ThreadSummary[]) {
  return [
    ...incomingThreads,
    ...state.threads.filter(
      (thread) =>
        !incomingThreads.some((loadedThread) => loadedThread.id === thread.id) &&
        shouldRetainMissingThread(state, thread),
    ),
  ];
}

export class ThreadService {
  constructor(
    private readonly store: RuntimeStore,
    private readonly deps: ServiceDeps,
  ) {}

  async loadThreads() {
    const state = this.store.getState();
    const params: Record<string, unknown> = {};
    if (state.activeFilter === 'archived') {
      params.archived = true;
    } else if (state.activeFilter === 'active') {
      params.archived = false;
    }

    try {
      const response = await this.deps.requestCompat('thread/list', params);
      const threads = normalizeThreadsResponse(response).filter((thread) =>
        shouldRetainMissingThread(state, thread),
      );
      const mergedThreads = mergeIncomingThreads(state, threads);
      const restoredActiveThread = state.activeThreadId
        ? (mergedThreads.find((thread) => thread.id === state.activeThreadId) ?? null)
        : null;
      const preservedEntries = state.activeThreadId
        ? (state.threadEntries[state.activeThreadId] ?? [])
        : [];
      const shouldPreserveActiveSelection = Boolean(
        state.activeThreadId &&
        !threads.some((thread) => thread.id === state.activeThreadId) &&
        (hasMeaningfulThreadHistory(preservedEntries) || state.activeThread),
      );
      this.store.patch({
        threads: mergedThreads,
        visibleThreads: this.filterThreads(mergedThreads, state.searchTerm),
        activeThread:
          restoredActiveThread ?? (shouldPreserveActiveSelection ? state.activeThread : null),
        activeThreadStatus:
          restoredActiveThread?.status ??
          (shouldPreserveActiveSelection
            ? (state.activeThread?.status ?? state.activeThreadStatus)
            : state.activeThreadStatus),
        activeThreadId:
          state.activeThreadId && !restoredActiveThread && !shouldPreserveActiveSelection
            ? null
            : state.activeThreadId,
      });
      if (
        state.activeThreadId &&
        restoredActiveThread &&
        sanitizeBackendThreadId(state.activeThreadId) &&
        !state.threadEntries[state.activeThreadId]?.length
      ) {
        await this.loadThreadContent(state.activeThreadId);
      }
      this.deps.markRequestSupported('thread/list');
    } catch (error) {
      if (isInitializationPendingError(error)) {
        this.store.patch({
          threads: [],
          visibleThreads: [],
        });
        return;
      }
      this.deps.markRequestUnsupported('thread/list');
      this.deps.toast(`Failed to load threads: ${normalizeError(error)}`, 'error');
    }
  }

  async selectThread(threadId: string) {
    const state = this.store.getState();
    const activeThread = state.threads.find((thread) => thread.id === threadId) ?? null;
    this.store.patch({
      activeThreadId: threadId,
      activeThread,
      activeThreadStatus: activeThread?.status ?? { type: 'idle' },
      currentFilePath: null,
      fileBrowserPath: normalizePath(activeThread?.cwd),
      fileBreadcrumb: [
        { label: normalizePath(activeThread?.cwd), path: normalizePath(activeThread?.cwd) },
      ],
    });
    const backendThreadId = sanitizeBackendThreadId(threadId);
    if (!backendThreadId) {
      const existingEntries = this.store.getState().threadEntries[threadId] ?? [];
      this.store.patch({
        chatEntries:
          existingEntries.length > 0
            ? existingEntries
            : [
                buildThreadUnavailableEntry(
                  threadId,
                  'This thread is available locally, but it cannot be reopened because the backend did not provide a valid canonical thread id.',
                ),
              ],
      });
      return;
    }
    await this.loadThreadContent(backendThreadId);
  }

  async startThread(params: { cwd?: string; instructions?: string } = {}) {
    try {
      await this.startThreadInternal(params);
      this.deps.toast('Thread started', 'success');
    } catch (error) {
      this.deps.toast(`Failed to start thread: ${normalizeError(error)}`, 'error');
    }
  }

  async ensureWritableThread(threadId: string | null | undefined) {
    const backendThreadId = sanitizeBackendThreadId(threadId);
    if (backendThreadId) {
      return backendThreadId;
    }

    const state = this.store.getState();
    const sourceThread =
      (threadId ? state.threads.find((thread) => thread.id === threadId) : null) ??
      state.activeThread;
    const nextThreadId = await this.startThreadInternal({
      cwd: sourceThread?.cwd,
    });

    if (nextThreadId) {
      this.deps.toast('Started a new backend thread for this local snapshot.', 'info');
    }

    return nextThreadId;
  }

  async archiveThread(threadId: string, isArchived?: boolean) {
    const backendThreadId = sanitizeBackendThreadId(threadId);
    if (!backendThreadId) {
      this.deps.toast(
        'This thread cannot be updated because it does not have a valid backend id.',
        'info',
      );
      return;
    }
    const canonicalMethod = isArchived ? 'thread/unarchive' : 'thread/archive';
    try {
      await this.deps.requestCompat(canonicalMethod, { threadId: backendThreadId });
      await this.loadThreads();
      this.deps.toast(isArchived ? 'Thread unarchived' : 'Thread archived', 'success');
    } catch (error) {
      this.deps.toast(`Thread update failed: ${normalizeError(error)}`, 'error');
    }
  }

  async forkThread(threadId: string) {
    const backendThreadId = sanitizeBackendThreadId(threadId);
    if (!backendThreadId) {
      this.deps.toast(
        'This thread cannot be forked because it does not have a valid backend id.',
        'info',
      );
      return;
    }
    try {
      const response = (await this.deps.requestCompat('thread/fork', {
        threadId: backendThreadId,
      })) as Record<string, unknown>;
      this.store.patch({
        ...normalizeThreadSessionSettings(response),
      });
      await this.loadThreads();
      const threadIdFromResponse =
        typeof response.threadId === 'string'
          ? response.threadId
          : typeof (response.thread as Record<string, unknown> | undefined)?.id === 'string'
            ? String((response.thread as Record<string, unknown>).id)
            : null;
      if (threadIdFromResponse) {
        await this.selectThread(threadIdFromResponse);
      }
      this.deps.toast('Thread forked', 'success');
    } catch (error) {
      this.deps.toast(`Fork failed: ${normalizeError(error)}`, 'error');
    }
  }

  async rollbackActiveThread() {
    const state = this.store.getState();
    const activeThreadId = state.activeThreadId;
    const backendThreadId = sanitizeBackendThreadId(state.activeThreadId);
    if (!backendThreadId) {
      this.deps.toast(
        'This thread cannot be rolled back because it does not have a valid backend id.',
        'info',
      );
      return;
    }
    const entries = activeThreadId ? (state.threadEntries[activeThreadId] ?? []) : [];
    const lastEntry = [...entries].reverse().find((entry) => entry.kind !== 'system');
    if (!lastEntry) {
      this.deps.toast('No thread items available to rollback', 'info');
      return;
    }
    try {
      await this.deps.requestCompat('thread/rollback', {
        threadId: backendThreadId,
        toItemId: lastEntry.id,
      });
      await this.loadThreadContent(backendThreadId);
      this.deps.toast('Thread rolled back', 'success');
    } catch (error) {
      this.deps.toast(`Rollback failed: ${normalizeError(error)}`, 'error');
    }
  }

  async compactActiveThread() {
    const state = this.store.getState();
    const backendThreadId = sanitizeBackendThreadId(state.activeThreadId);
    if (!backendThreadId) {
      this.deps.toast(
        'This thread cannot be compacted because it does not have a valid backend id.',
        'info',
      );
      return;
    }
    try {
      await this.deps.requestCompat('thread/compact/start', { threadId: backendThreadId });
      this.deps.toast('Context compaction started', 'info');
    } catch (error) {
      this.deps.toast(`Compact failed: ${normalizeError(error)}`, 'error');
    }
  }

  async renameActiveThread(name: string) {
    const state = this.store.getState();
    const backendThreadId = sanitizeBackendThreadId(state.activeThreadId);
    if (!backendThreadId || !name.trim()) {
      if (!name.trim()) return;
      this.deps.toast(
        'This thread cannot be renamed because it does not have a valid backend id.',
        'info',
      );
      return;
    }
    try {
      await this.deps.requestCompat('thread/name/set', {
        threadId: backendThreadId,
        name: name.trim(),
      });
      await this.loadThreads();
      this.deps.toast('Thread renamed', 'success');
    } catch (error) {
      this.deps.toast(`Rename failed: ${normalizeError(error)}`, 'error');
    }
  }

  async updateThreadMetadata(metadata: Record<string, unknown>) {
    const state = this.store.getState();
    const backendThreadId = sanitizeBackendThreadId(state.activeThreadId);
    if (!backendThreadId) {
      this.deps.toast(
        'This thread cannot be updated because it does not have a valid backend id.',
        'info',
      );
      return;
    }
    try {
      await this.deps.requestCompat('thread/metadata/update', {
        threadId: backendThreadId,
        ...metadata,
      });
      this.deps.toast('Thread metadata updated', 'success');
    } catch (error) {
      this.deps.markRequestUnsupported('thread/metadata/update');
      this.deps.toast(`Metadata update unavailable: ${normalizeError(error)}`, 'info');
    }
  }

  async unsubscribeThread(threadId: string) {
    const backendThreadId = sanitizeBackendThreadId(threadId);
    if (!backendThreadId) {
      this.deps.markRequestUnsupported('thread/unsubscribe');
      return;
    }
    try {
      await this.deps.requestCompat('thread/unsubscribe', { threadId: backendThreadId });
      this.deps.markRequestSupported('thread/unsubscribe');
    } catch {
      this.deps.markRequestUnsupported('thread/unsubscribe');
    }
  }

  setThreadFilter(filter: string) {
    // Patch activeFilter first so filterThreads reads the new value.
    this.store.patch({ activeFilter: filter });
    const updatedState = this.store.getState();
    this.store.patch({
      visibleThreads: this.filterThreads(updatedState.threads, updatedState.searchTerm),
    });
  }

  setThreadSearch(searchTerm: string) {
    const state = this.store.getState();
    this.store.patch({
      searchTerm,
      visibleThreads: this.filterThreads(state.threads, searchTerm),
    });
  }

  handleThreadStatusChanged(payload: Record<string, unknown>) {
    const threadId = typeof payload.threadId === 'string' ? payload.threadId : null;
    if (!threadId) return;
    const status = normalizeThreadStatus(payload.status);
    const state = this.store.getState();
    const threads = state.threads.map((thread) =>
      thread.id === threadId ? { ...thread, status } : thread,
    );
    this.store.patch({
      threads,
      visibleThreads: this.filterThreads(threads, state.searchTerm),
      activeThreadStatus: state.activeThreadId === threadId ? status : state.activeThreadStatus,
      turnActive: state.activeThreadId === threadId ? status.type === 'active' : state.turnActive,
    });
  }

  handleThreadStarted(payload: Record<string, unknown>) {
    const thread = normalizeThread(payload.thread ?? payload);
    if (!sanitizeBackendThreadId(thread.id)) {
      return;
    }
    const state = this.store.getState();
    const threads = [thread, ...state.threads.filter((item) => item.id !== thread.id)];
    this.store.patch({
      threads,
      visibleThreads: this.filterThreads(threads, state.searchTerm),
    });
  }

  handleThreadArchived(payload: Record<string, unknown>, archived: boolean) {
    const threadId = typeof payload.threadId === 'string' ? payload.threadId : null;
    if (!threadId) return;
    const state = this.store.getState();
    const threads = state.threads.map((thread) =>
      thread.id === threadId ? { ...thread, archived } : thread,
    );
    this.store.patch({
      threads,
      visibleThreads: this.filterThreads(threads, state.searchTerm),
    });
  }

  handleThreadNameUpdated(payload: Record<string, unknown>) {
    const threadId = typeof payload.threadId === 'string' ? payload.threadId : null;
    if (!threadId) return;
    const nextName = typeof payload.name === 'string' ? payload.name : undefined;
    const state = this.store.getState();
    const threads = state.threads.map((thread) =>
      thread.id === threadId ? { ...thread, name: nextName, title: nextName } : thread,
    );
    this.store.patch({
      threads,
      visibleThreads: this.filterThreads(threads, state.searchTerm),
      activeThread:
        state.activeThreadId === threadId
          ? (threads.find((thread) => thread.id === threadId) ?? state.activeThread)
          : state.activeThread,
    });
  }

  async loadLoadedThreads() {
    try {
      const response = (await this.deps.requestCompat('thread/loaded/list', {})) as Record<
        string,
        unknown
      >;
      const state = this.store.getState();
      const threads = normalizeThreadsResponse(response).filter((thread) =>
        shouldRetainMissingThread(state, thread),
      );
      if (!threads.length) return;
      const merged = mergeIncomingThreads(state, threads);
      this.store.patch({
        threads: merged,
        visibleThreads: this.filterThreads(merged, state.searchTerm),
      });
      this.deps.markRequestSupported('thread/loaded/list');
    } catch (error) {
      if (isInitializationPendingError(error)) {
        return;
      }
      this.deps.markRequestUnsupported('thread/loaded/list');
    }
  }

  appendUserDraftEntry(entry: ChatEntry) {
    const state = this.store.getState();
    if (!state.activeThreadId) return;
    const threadEntries = state.threadEntries[state.activeThreadId] ?? [];
    this.store.patch({
      threadEntries: {
        ...state.threadEntries,
        [state.activeThreadId]: [...threadEntries, entry],
      },
      chatEntries: [...threadEntries, entry],
    });
  }

  upsertThreadEntry(threadId: string, nextEntry: ChatEntry) {
    const state = this.store.getState();
    const existingEntries = state.threadEntries[threadId] ?? [];
    const entryIndex = existingEntries.findIndex((entry) => entry.id === nextEntry.id);
    const draftEntryIndex =
      entryIndex === -1 && nextEntry.role === 'user'
        ? this.findMatchingUserDraftIndex(existingEntries, nextEntry)
        : -1;
    const nextEntries =
      entryIndex === -1
        ? draftEntryIndex === -1
          ? [...existingEntries, nextEntry]
          : existingEntries.map((entry, index) =>
              index === draftEntryIndex ? { ...entry, ...nextEntry, id: nextEntry.id } : entry,
            )
        : existingEntries.map((entry, index) =>
            index === entryIndex ? { ...entry, ...nextEntry } : entry,
          );

    this.store.patch({
      threadEntries: {
        ...state.threadEntries,
        [threadId]: nextEntries,
      },
      chatEntries: state.activeThreadId === threadId ? nextEntries : state.chatEntries,
    });
  }

  private isMatchingUserDraft(draftEntry: ChatEntry, nextEntry: ChatEntry) {
    if (draftEntry.kind !== 'message' || nextEntry.kind !== 'message') {
      return false;
    }

    const draftContent = draftEntry.content.trim();
    const nextContent = nextEntry.content.trim();
    if (draftContent && nextContent) {
      return draftContent === nextContent;
    }

    if (!draftContent && !nextContent) {
      return Boolean(draftEntry.attachments?.length);
    }

    return draftContent === nextContent && Boolean(draftEntry.attachments?.length);
  }

  private findMatchingUserDraftIndex(entries: ChatEntry[], nextEntry: ChatEntry) {
    for (let index = entries.length - 1; index >= 0; index -= 1) {
      const entry = entries[index];
      if (
        entry?.role === 'user' &&
        entry.id.startsWith('draft-') &&
        this.isMatchingUserDraft(entry, nextEntry)
      ) {
        return index;
      }
    }

    return -1;
  }

  private async loadThreadContent(threadId: string) {
    const backendThreadId = sanitizeBackendThreadId(threadId);
    const state = this.store.getState();
    const existingEntries = state.threadEntries[threadId] ?? [];
    if (!backendThreadId) {
      if (hasMeaningfulThreadHistory(existingEntries)) {
        if (state.activeThreadId === threadId) {
          this.store.patch({ chatEntries: existingEntries });
        }
        return;
      }
      this.replaceThreadEntries(threadId, [
        buildThreadUnavailableEntry(
          threadId,
          'Thread history is unavailable because this thread does not have a valid backend id.',
        ),
      ]);
      return;
    }
    try {
      const response = await this.deps.requestCompat(
        'thread/resume',
        { threadId: backendThreadId, includeTurns: true },
        ['thread/read', 'thread/get', 'session/open'],
      );
      this.applyThreadContentResponse(threadId, backendThreadId, response, true);
    } catch (error) {
      if (isRolloutUnavailableError(error)) {
        try {
          const response = await this.deps.requestCompat(
            'thread/read',
            { threadId: backendThreadId, includeTurns: true },
            ['thread/get'],
          );
          this.applyThreadContentResponse(threadId, backendThreadId, response, false);
          return;
        } catch (readError) {
          error = readError;
        }
      }

      if (isMethodUnavailable(error)) {
        this.deps.markRequestUnsupported('thread/resume');
      }
      if (isThreadEmptyBeforeFirstUserMessageError(error)) {
        this.replaceThreadEntries(threadId, []);
        return;
      }
      if (hasMeaningfulThreadHistory(existingEntries)) {
        if (state.activeThreadId === threadId) {
          this.store.patch({ chatEntries: existingEntries });
        }
        return;
      }
      const message = normalizeError(error, 'Thread history could not be loaded');
      this.replaceThreadEntries(threadId, [
        {
          id: `thread-read-error-${threadId}`,
          kind: 'system',
          role: 'system',
          content: message,
          status: 'error',
        },
      ]);
    }
  }

  private applyThreadContentResponse(
    threadId: string,
    backendThreadId: string,
    response: unknown,
    updateSessionSettings: boolean,
  ) {
    const entries = normalizeThreadEntries(response, backendThreadId);
    this.replaceThreadEntries(threadId, entries);

    if (updateSessionSettings) {
      const sessionSettings = normalizeThreadSessionSettings(response);
      const state = this.store.getState();
      const configServiceTier =
        typeof state.configData?.service_tier === 'string' ? state.configData.service_tier : '';
      const configSandboxMode =
        typeof state.configData?.sandbox_mode === 'string' ? state.configData.sandbox_mode : '';
      this.store.patch({
        selectedModel: sessionSettings.selectedModel || '',
        selectedEffort: sessionSettings.selectedEffort || '',
        selectedServiceTier: sessionSettings.selectedServiceTier || configServiceTier,
        selectedSandboxMode: sessionSettings.selectedSandboxMode || configSandboxMode,
      });
    }

    const state = this.store.getState();
    const threadRecord = ((response as Record<string, unknown>).thread ?? {}) as Record<
      string,
      unknown
    >;
    if (threadRecord && Object.keys(threadRecord).length > 0) {
      const normalizedThreadRecord = normalizeThread(threadRecord);
      const normalizedThread = sanitizeBackendThreadId(normalizedThreadRecord.id)
        ? normalizedThreadRecord
        : { ...normalizedThreadRecord, id: backendThreadId };
      const hasExistingThread = state.threads.some((thread) => thread.id === backendThreadId);
      const threads = hasExistingThread
        ? state.threads.map((thread) =>
            thread.id === backendThreadId ? { ...thread, ...normalizedThread } : thread,
          )
        : [normalizedThread, ...state.threads.filter((thread) => thread.id !== backendThreadId)];
      const activeThread =
        threads.find((thread) => thread.id === backendThreadId) ?? normalizedThread;
      this.store.patch({
        threads,
        activeThread,
        activeThreadStatus: normalizedThread.status ?? state.activeThreadStatus,
        visibleThreads: this.filterThreads(threads, state.searchTerm),
      });
    }
  }

  private async startThreadInternal(params: { cwd?: string; instructions?: string } = {}) {
    const state = this.store.getState();
    const response = (await this.deps.requestCompat('thread/start', {
      cwd: params.cwd || undefined,
      baseInstructions: params.instructions || undefined,
      collaborationMode: buildCollaborationMode(
        state.collaborationMode,
        state.models,
        state.selectedModel,
        state.selectedEffort,
      ),
      sandbox: state.selectedSandboxMode || undefined,
      serviceTier: state.selectedServiceTier || undefined,
    })) as Record<string, unknown>;

    this.store.patch({
      ...normalizeThreadSessionSettings(response),
    });

    const threadId = this.extractThreadId(response);
    const threadRecord = ((response.thread ?? {}) as Record<string, unknown>) || {};
    if (threadId && Object.keys(threadRecord).length > 0) {
      const normalizedThreadRecord = normalizeThread(threadRecord);
      const normalizedThread = sanitizeBackendThreadId(normalizedThreadRecord.id)
        ? normalizedThreadRecord
        : { ...normalizedThreadRecord, id: threadId };
      const nextThreads = [
        normalizedThread,
        ...state.threads.filter((thread) => thread.id !== threadId),
      ];
      this.store.patch({
        threads: nextThreads,
        visibleThreads: this.filterThreads(nextThreads, state.searchTerm),
      });
    }

    await this.loadThreads();
    if (threadId) {
      await this.selectThread(threadId);
    }

    return threadId;
  }

  private extractThreadId(response: Record<string, unknown>) {
    return typeof response.threadId === 'string'
      ? response.threadId
      : typeof (response.thread as Record<string, unknown> | undefined)?.id === 'string'
        ? String((response.thread as Record<string, unknown>).id)
        : null;
  }

  private replaceThreadEntries(threadId: string, entries: ChatEntry[]) {
    const state = this.store.getState();
    this.store.patch({
      threadEntries: {
        ...state.threadEntries,
        [threadId]: entries.length
          ? entries
          : [
              {
                id: `thread-empty-${threadId}`,
                kind: 'system',
                role: 'system',
                content: 'Thread is empty. Send a message to start.',
                status: 'done',
              },
            ],
      },
      chatEntries:
        state.activeThreadId === threadId
          ? entries.length
            ? entries
            : [
                {
                  id: `thread-empty-${threadId}`,
                  kind: 'system',
                  role: 'system',
                  content: 'Thread is empty. Send a message to start.',
                  status: 'done',
                },
              ]
          : state.chatEntries,
    });
  }

  private filterThreads(threads: ThreadSummary[], searchTerm: string) {
    const state = this.store.getState();
    const normalizedSearch = searchTerm.trim().toLowerCase();
    return threads.filter((thread) => {
      if (state.activeFilter === 'archived' && !thread.archived) return false;
      if (state.activeFilter === 'active' && thread.archived) return false;
      if (!normalizedSearch) return true;
      return `${thread.title ?? ''} ${thread.name ?? ''} ${thread.preview ?? ''}`
        .toLowerCase()
        .includes(normalizedSearch);
    });
  }
}
