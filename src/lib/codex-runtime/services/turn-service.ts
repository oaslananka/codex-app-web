import { normalizeError } from '../errors';
import { buildCollaborationMode } from '../collaboration';
import { getOutputText, getTextContent, normalizeChatEntry } from '../normalizers';
import { sanitizeBackendThreadId } from '../thread-ids';
import { buildTurnSandboxPolicy } from '../sandbox-policy';
import type { RuntimeStore } from '../store';
import type { ChatEntry } from '../types';

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

type ThreadEntryApi = {
  appendUserDraftEntry(entry: ChatEntry): void;
  ensureWritableThread(threadId: string | null | undefined): Promise<string | null>;
  upsertThreadEntry(threadId: string, entry: ChatEntry): void;
};

export class TurnService {
  constructor(
    private readonly store: RuntimeStore,
    private readonly deps: ServiceDeps,
    private readonly threadEntries: ThreadEntryApi,
  ) {}

  async sendMessage() {
    const state = this.store.getState();
    const selectedThreadId = state.activeThread?.id ?? null;

    const text = state.messageDraft.trim();
    const attachments = state.pendingAttachments.filter(
      (attachment) => attachment.status === 'ready' && attachment.path,
    );
    if (!text && attachments.length === 0) return;

    const activeThreadId = await this.threadEntries.ensureWritableThread(selectedThreadId);
    if (!activeThreadId) {
      this.deps.toast('A writable thread could not be created for this conversation.', 'error');
      return;
    }

    const draftId = `draft-${Date.now()}`;
    this.threadEntries.appendUserDraftEntry({
      id: draftId,
      kind: 'message',
      role: 'user',
      content: text,
      attachments: attachments.map((attachment) => ({
        name: attachment.name,
        mimeType: attachment.mimeType,
        previewUrl: attachment.previewUrl,
      })),
      status: 'done',
      createdAt: Date.now(),
      threadId: activeThreadId,
    });

    try {
      await this.deps.requestCompat('turn/start', {
        threadId: activeThreadId,
        input: [
          ...(text ? [{ type: 'text', text, text_elements: [] }] : []),
          ...attachments.map((attachment) => ({ type: 'localImage', path: attachment.path })),
        ],
        collaborationMode: buildCollaborationMode(
          state.collaborationMode,
          state.models,
          state.selectedModel,
          state.selectedEffort,
        ),
        model: state.selectedModel || undefined,
        serviceTier: state.selectedServiceTier || undefined,
        effort: state.selectedEffort || undefined,
        sandboxPolicy: buildTurnSandboxPolicy(state),
      });
      this.store.patch({
        turnActive: true,
        pendingAttachments: [],
        attachmentUploadInProgress: false,
        messageDraft: '',
      });
      this.deps.markRequestSupported('turn/start');
    } catch (error) {
      this.removeDraftEntry(activeThreadId, draftId);
      this.deps.markRequestUnsupported('turn/start');
      this.deps.toast(`Send failed: ${normalizeError(error)}`, 'error');
    }
  }

  async interruptTurn() {
    const state = this.store.getState();
    const backendThreadId = sanitizeBackendThreadId(state.activeThread?.id);
    if (!backendThreadId) return;
    try {
      await this.deps.requestCompat('turn/interrupt', { threadId: backendThreadId });
      this.deps.markRequestSupported('turn/interrupt');
      this.store.patch({ turnActive: false });
      this.deps.toast('Turn interrupted', 'info');
    } catch (error) {
      this.deps.markRequestUnsupported('turn/interrupt');
      this.deps.toast(`Interrupt failed: ${normalizeError(error)}`, 'error');
    }
  }

  async steerTurn() {
    const state = this.store.getState();
    const text = state.messageDraft.trim();
    const backendThreadId = sanitizeBackendThreadId(state.activeThread?.id);
    if (!backendThreadId || !text) return;
    try {
      await this.deps.requestCompat('turn/steer', {
        threadId: backendThreadId,
        input: [{ type: 'text', text, text_elements: [] }],
      });
      this.store.patch({ messageDraft: '' });
      this.deps.markRequestSupported('turn/steer');
      this.deps.toast('Steering active turn', 'info');
    } catch (error) {
      this.deps.markRequestUnsupported('turn/steer');
      this.deps.toast(`Steer failed: ${normalizeError(error)}`, 'error');
    }
  }

  handleItemStarted(payload: Record<string, unknown>) {
    const threadId = typeof payload.threadId === 'string' ? payload.threadId : null;
    if (!threadId) return;
    const item = (payload.item ?? {}) as Record<string, unknown>;
    const entry = normalizeChatEntry(item, threadId);
    entry.status = 'running';
    entry.isStreaming = true;
    this.threadEntries.upsertThreadEntry(threadId, entry);
  }

  handleItemCompleted(payload: Record<string, unknown>) {
    const threadId = typeof payload.threadId === 'string' ? payload.threadId : null;
    if (!threadId) return;
    const item = (payload.item ?? {}) as Record<string, unknown>;
    const entry = normalizeChatEntry(item, threadId);
    entry.status = 'done';
    entry.isStreaming = false;
    this.threadEntries.upsertThreadEntry(threadId, entry);
  }

  handleAgentMessageDelta(payload: Record<string, unknown>) {
    const threadId = typeof payload.threadId === 'string' ? payload.threadId : null;
    const itemId = typeof payload.itemId === 'string' ? payload.itemId : null;
    if (!threadId || !itemId) return;
    const state = this.store.getState();
    const currentEntries = state.threadEntries[threadId] ?? [];
    const existingEntry = currentEntries.find((entry) => entry.id === itemId);
    const nextContent = `${existingEntry?.content ?? ''}${String(payload.delta ?? '')}`;
    this.threadEntries.upsertThreadEntry(threadId, {
      id: itemId,
      threadId,
      kind: 'message',
      role: 'assistant',
      content: nextContent,
      status: 'running',
      isStreaming: true,
    });
  }

  handleReasoningDelta(
    payload: Record<string, unknown>,
    kind:
      | 'summary'
      | 'reasoning'
      | 'plan'
      | 'command'
      | 'file-change'
      | 'mcp-progress'
      | 'terminal-interaction' = 'reasoning',
  ) {
    const threadId = typeof payload.threadId === 'string' ? payload.threadId : null;
    if (!threadId) return;
    const itemId = String(payload.itemId ?? `${kind}-${Date.now()}`);
    const state = this.store.getState();
    const currentEntries = state.threadEntries[threadId] ?? [];
    const existingEntry = currentEntries.find((entry) => entry.id === itemId);
    const nextDelta =
      typeof payload.delta === 'string'
        ? payload.delta
        : typeof payload.message === 'string'
          ? `${payload.message}\n`
          : typeof payload.stdin === 'string'
            ? `> ${payload.stdin}`
            : typeof payload.data === 'string'
              ? payload.data
              : '';
    const nextContent = `${existingEntry?.content ?? ''}${nextDelta}`;
    this.threadEntries.upsertThreadEntry(threadId, {
      id: itemId,
      threadId,
      kind: kind === 'reasoning' || kind === 'summary' ? 'reasoning' : 'tool',
      role: kind === 'reasoning' ? 'commentary' : undefined,
      title: kind,
      label: kind,
      content: nextContent,
      status: 'running',
      isStreaming: true,
      isCollapsible: true,
    });
  }

  handleTurnCompleted(payload: Record<string, unknown>) {
    const threadId = typeof payload.threadId === 'string' ? payload.threadId : null;
    if (!threadId) return;
    const state = this.store.getState();
    const threadEntries = state.threadEntries[threadId] ?? [];
    const normalizedEntries = threadEntries.map((entry) => ({
      ...entry,
      status: entry.status === 'running' ? 'done' : entry.status,
      isStreaming: false,
    }));
    this.store.patch({
      threadEntries: {
        ...state.threadEntries,
        [threadId]: normalizedEntries,
      },
      chatEntries: state.activeThread?.id === threadId ? normalizedEntries : state.chatEntries,
      turnActive: false,
    });
  }

  handleThreadRealtime(payload: Record<string, unknown>, eventName: string) {
    const threadId =
      typeof payload.threadId === 'string'
        ? payload.threadId
        : (this.store.getState().activeThread?.id ?? null);
    if (!threadId) return;
    this.threadEntries.upsertThreadEntry(threadId, {
      id: `realtime-${eventName}-${Date.now()}`,
      threadId,
      kind: 'system',
      role: 'system',
      title: 'Realtime',
      label: eventName,
      content: JSON.stringify(payload, null, 2),
      status: eventName.includes('error') ? 'error' : 'done',
      isCollapsible: true,
    });
  }

  handleCompletedPayload(threadId: string, item: Record<string, unknown>) {
    this.threadEntries.upsertThreadEntry(threadId, {
      ...normalizeChatEntry(item, threadId),
      content: getOutputText(item) || getTextContent(item),
      status: 'done',
      isStreaming: false,
    });
  }

  private removeDraftEntry(threadId: string, entryId: string) {
    const state = this.store.getState();
    const threadEntries = state.threadEntries[threadId] ?? [];
    const nextEntries = threadEntries.filter((entry) => entry.id !== entryId);

    this.store.patch({
      threadEntries: {
        ...state.threadEntries,
        [threadId]: nextEntries,
      },
      chatEntries: state.activeThread?.id === threadId ? nextEntries : state.chatEntries,
    });
  }
}
