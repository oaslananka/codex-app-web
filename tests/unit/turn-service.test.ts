import { describe, expect, it, vi } from 'vitest';
import { buildInitialState } from '../../src/lib/codex-runtime/runtime-state';
import { RuntimeStore } from '../../src/lib/codex-runtime/store';
import { TurnService } from '../../src/lib/codex-runtime/services/turn-service';

describe('TurnService', () => {
  it('starts a writable thread automatically when the user sends the first message without selecting a thread', async () => {
    const store = new RuntimeStore(buildInitialState());
    store.patch({
      messageDraft: 'hello from a fresh session',
    });

    const requestCompat = vi.fn(async (method: string) => {
      if (method === 'turn/start') {
        return { ok: true };
      }
      throw new Error(`Unexpected method: ${method}`);
    }) as <T = unknown>(
      canonicalMethod: string,
      params?: unknown,
      fallbacks?: readonly string[],
    ) => Promise<T>;

    const appendUserDraftEntry = vi.fn();
    const ensureWritableThread = vi.fn(async () => 'thread-123');
    const upsertThreadEntry = vi.fn();
    const toast = vi.fn();

    const service = new TurnService(
      store,
      {
        requestCompat,
        markRequestSupported: vi.fn(),
        markRequestUnsupported: vi.fn(),
        toast,
      },
      {
        appendUserDraftEntry,
        ensureWritableThread,
        upsertThreadEntry,
      },
    );

    await service.sendMessage();

    expect(ensureWritableThread).toHaveBeenCalledWith(null);
    expect(appendUserDraftEntry).toHaveBeenCalledTimes(1);
    expect(requestCompat).toHaveBeenCalledWith(
      'turn/start',
      expect.objectContaining({
        threadId: 'thread-123',
        input: [
          expect.objectContaining({
            type: 'text',
            text: 'hello from a fresh session',
          }),
        ],
      }),
    );
    expect(toast).not.toHaveBeenCalledWith('Select a thread first', 'info');
    expect(store.getState().turnActive).toBe(true);
    expect(store.getState().messageDraft).toBe('');
  });

  it('removes the optimistic draft entry when turn/start fails', async () => {
    const store = new RuntimeStore(buildInitialState());
    store.patch({
      messageDraft: 'this send should fail',
    });

    const requestCompat = vi.fn(async (method: string) => {
      if (method === 'turn/start') {
        throw new Error('backend unavailable');
      }
      throw new Error(`Unexpected method: ${method}`);
    }) as <T = unknown>(
      canonicalMethod: string,
      params?: unknown,
      fallbacks?: readonly string[],
    ) => Promise<T>;

    const toast = vi.fn();

    const service = new TurnService(
      store,
      {
        requestCompat,
        markRequestSupported: vi.fn(),
        markRequestUnsupported: vi.fn(),
        toast,
      },
      {
        appendUserDraftEntry(entry) {
          store.patch((state) => ({
            threadEntries: {
              ...state.threadEntries,
              [entry.threadId ?? 'thread-123']: [
                ...(state.threadEntries[entry.threadId ?? 'thread-123'] ?? []),
                entry,
              ],
            },
          }));
        },
        ensureWritableThread: vi.fn(async () => 'thread-123'),
        upsertThreadEntry: vi.fn(),
      },
    );

    await service.sendMessage();

    expect(store.getState().threadEntries['thread-123']).toEqual([]);
    expect(store.getState().messageDraft).toBe('this send should fail');
    expect(toast).toHaveBeenCalledWith('Send failed: backend unavailable', 'error');
  });

  it('includes the selected sandbox policy in turn/start payloads', async () => {
    const store = new RuntimeStore(buildInitialState());
    store.patch({
      messageDraft: 'use the configured sandbox',
      selectedSandboxMode: 'workspace-write',
      configData: {
        sandbox_workspace_write: {
          writable_roots: ['/workspace'],
          network_access: true,
          exclude_tmpdir_env_var: true,
          exclude_slash_tmp: false,
        },
      },
    });

    const requestCompat = vi.fn(async (method: string) => {
      if (method === 'turn/start') {
        return { ok: true };
      }
      throw new Error(`Unexpected method: ${method}`);
    }) as <T = unknown>(
      canonicalMethod: string,
      params?: unknown,
      fallbacks?: readonly string[],
    ) => Promise<T>;

    const service = new TurnService(
      store,
      {
        requestCompat,
        markRequestSupported: vi.fn(),
        markRequestUnsupported: vi.fn(),
        toast: vi.fn(),
      },
      {
        appendUserDraftEntry: vi.fn(),
        ensureWritableThread: vi.fn(async () => 'thread-123'),
        upsertThreadEntry: vi.fn(),
      },
    );

    await service.sendMessage();

    expect(requestCompat).toHaveBeenCalledWith(
      'turn/start',
      expect.objectContaining({
        sandboxPolicy: {
          type: 'workspaceWrite',
          writableRoots: ['/workspace'],
          networkAccess: true,
          excludeTmpdirEnvVar: true,
          excludeSlashTmp: false,
        },
      }),
    );
  });

  it('does not send empty messages when there are no ready attachments', async () => {
    const store = new RuntimeStore(buildInitialState());
    store.patch({
      messageDraft: '   ',
      pendingAttachments: [
        {
          id: 'uploading-1',
          name: 'uploading.png',
          path: '/tmp/uploading.png',
          status: 'uploading',
        },
      ],
    });
    const requestCompat = vi.fn() as <T = unknown>(
      canonicalMethod: string,
      params?: unknown,
      fallbacks?: readonly string[],
    ) => Promise<T>;
    const ensureWritableThread = vi.fn(async () => 'thread-123');
    const service = new TurnService(
      store,
      {
        requestCompat,
        markRequestSupported: vi.fn(),
        markRequestUnsupported: vi.fn(),
        toast: vi.fn(),
      },
      {
        appendUserDraftEntry: vi.fn(),
        ensureWritableThread,
        upsertThreadEntry: vi.fn(),
      },
    );

    await service.sendMessage();

    expect(ensureWritableThread).not.toHaveBeenCalled();
    expect(requestCompat).not.toHaveBeenCalled();
  });

  it('sends ready local image attachments even when the text draft is empty', async () => {
    const store = new RuntimeStore(buildInitialState());
    store.patch({
      pendingAttachments: [
        {
          id: 'image-1',
          name: 'diagram.png',
          mimeType: 'image/png',
          path: '/tmp/diagram.png',
          previewUrl: 'blob:diagram',
          status: 'ready',
        },
      ],
    });
    const requestCompat = vi.fn(async () => ({ ok: true })) as <T = unknown>(
      canonicalMethod: string,
      params?: unknown,
      fallbacks?: readonly string[],
    ) => Promise<T>;
    const appendUserDraftEntry = vi.fn();
    const service = new TurnService(
      store,
      {
        requestCompat,
        markRequestSupported: vi.fn(),
        markRequestUnsupported: vi.fn(),
        toast: vi.fn(),
      },
      {
        appendUserDraftEntry,
        ensureWritableThread: vi.fn(async () => 'thread-123'),
        upsertThreadEntry: vi.fn(),
      },
    );

    await service.sendMessage();

    expect(appendUserDraftEntry).toHaveBeenCalledWith(
      expect.objectContaining({
        content: '',
        attachments: [
          {
            name: 'diagram.png',
            mimeType: 'image/png',
            previewUrl: 'blob:diagram',
          },
        ],
      }),
    );
    expect(requestCompat).toHaveBeenCalledWith(
      'turn/start',
      expect.objectContaining({
        input: [{ type: 'localImage', path: '/tmp/diagram.png' }],
      }),
    );
    expect(store.getState().pendingAttachments).toEqual([]);
  });

  it('interrupts and steers only valid backend thread ids', async () => {
    const threadId = '018f65d2-0d3a-7c9a-b123-456789abcdef';
    const store = new RuntimeStore(buildInitialState());
    store.patch({
      activeThread: { id: threadId },
      messageDraft: 'adjust course',
      turnActive: true,
    });
    const requestCompat = vi.fn(async () => ({ ok: true })) as <T = unknown>(
      canonicalMethod: string,
      params?: unknown,
      fallbacks?: readonly string[],
    ) => Promise<T>;
    const toast = vi.fn();
    const service = new TurnService(
      store,
      {
        requestCompat,
        markRequestSupported: vi.fn(),
        markRequestUnsupported: vi.fn(),
        toast,
      },
      {
        appendUserDraftEntry: vi.fn(),
        ensureWritableThread: vi.fn(async () => threadId),
        upsertThreadEntry: vi.fn(),
      },
    );

    await service.interruptTurn();
    await service.steerTurn();

    expect(requestCompat).toHaveBeenCalledWith('turn/interrupt', { threadId });
    expect(requestCompat).toHaveBeenCalledWith('turn/steer', {
      threadId,
      input: [{ type: 'text', text: 'adjust course', text_elements: [] }],
    });
    expect(store.getState().turnActive).toBe(false);
    expect(store.getState().messageDraft).toBe('');
    expect(toast).toHaveBeenCalledWith('Turn interrupted', 'info');
    expect(toast).toHaveBeenCalledWith('Steering active turn', 'info');
  });

  it('streams agent and reasoning deltas into thread entries', () => {
    const store = new RuntimeStore(buildInitialState());
    store.patch({
      threadEntries: {
        'thread-1': [
          {
            id: 'assistant-1',
            threadId: 'thread-1',
            kind: 'message',
            role: 'assistant',
            content: 'hello',
          },
        ],
      },
    });
    const upsertThreadEntry = vi.fn((threadId: string, entry) => {
      store.patch((state) => ({
        threadEntries: {
          ...state.threadEntries,
          [threadId]: [
            ...(state.threadEntries[threadId] ?? []).filter((item) => item.id !== entry.id),
            entry,
          ],
        },
      }));
    });
    const service = new TurnService(
      store,
      {
        requestCompat: vi.fn(),
        markRequestSupported: vi.fn(),
        markRequestUnsupported: vi.fn(),
        toast: vi.fn(),
      },
      {
        appendUserDraftEntry: vi.fn(),
        ensureWritableThread: vi.fn(async () => 'thread-1'),
        upsertThreadEntry,
      },
    );

    service.handleAgentMessageDelta({
      threadId: 'thread-1',
      itemId: 'assistant-1',
      delta: ' world',
    });
    service.handleReasoningDelta(
      {
        threadId: 'thread-1',
        itemId: 'reasoning-1',
        message: 'plan updated',
      },
      'plan',
    );

    expect(upsertThreadEntry).toHaveBeenCalledWith(
      'thread-1',
      expect.objectContaining({
        id: 'assistant-1',
        content: 'hello world',
        status: 'running',
        isStreaming: true,
      }),
    );
    expect(upsertThreadEntry).toHaveBeenCalledWith(
      'thread-1',
      expect.objectContaining({
        id: 'reasoning-1',
        kind: 'tool',
        label: 'plan',
        content: 'plan updated\n',
      }),
    );
  });

  it('marks all running entries done when a turn completes for the active thread', () => {
    const store = new RuntimeStore(buildInitialState());
    store.patch({
      activeThread: { id: 'thread-1' },
      threadEntries: {
        'thread-1': [
          {
            id: 'entry-1',
            threadId: 'thread-1',
            kind: 'message',
            role: 'assistant',
            content: 'partial',
            status: 'running',
            isStreaming: true,
          },
        ],
      },
      chatEntries: [],
      turnActive: true,
    });
    const service = new TurnService(
      store,
      {
        requestCompat: vi.fn(),
        markRequestSupported: vi.fn(),
        markRequestUnsupported: vi.fn(),
        toast: vi.fn(),
      },
      {
        appendUserDraftEntry: vi.fn(),
        ensureWritableThread: vi.fn(async () => 'thread-1'),
        upsertThreadEntry: vi.fn(),
      },
    );

    service.handleTurnCompleted({ threadId: 'thread-1' });

    expect(store.getState().turnActive).toBe(false);
    expect(store.getState().threadEntries['thread-1']).toEqual([
      expect.objectContaining({
        id: 'entry-1',
        status: 'done',
        isStreaming: false,
      }),
    ]);
    expect(store.getState().chatEntries).toEqual(store.getState().threadEntries['thread-1']);
  });
});
