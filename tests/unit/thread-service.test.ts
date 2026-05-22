import { describe, expect, it, vi } from 'vitest';
import { buildInitialState } from '../../src/lib/codex-runtime/runtime-state';
import { ThreadService } from '../../src/lib/codex-runtime/services/thread-service';
import { RuntimeStore } from '../../src/lib/codex-runtime/store';

describe('ThreadService', () => {
  it('uses the updated active filter when recalculating visible threads', () => {
    const store = new RuntimeStore(buildInitialState());
    store.patch({
      activeFilter: 'active',
      threads: [
        {
          id: 'thread-active',
          title: 'Active thread',
          archived: false,
          status: { type: 'idle' },
        },
        {
          id: 'thread-archived',
          title: 'Archived thread',
          archived: true,
          status: { type: 'idle' },
        },
      ],
      visibleThreads: [
        {
          id: 'thread-active',
          title: 'Active thread',
          archived: false,
          status: { type: 'idle' },
        },
      ],
    });

    const service = new ThreadService(store, {
      requestCompat: vi.fn(),
      markRequestSupported: vi.fn(),
      markRequestUnsupported: vi.fn(),
      toast: vi.fn(),
    });

    service.setThreadFilter('archived');

    const snapshot = store.getState();
    expect(snapshot.activeFilter).toBe('archived');
    expect(snapshot.visibleThreads.map((thread) => thread.id)).toEqual(['thread-archived']);
  });

  it('ignores thread-start notifications that do not include a canonical backend id', () => {
    const store = new RuntimeStore(buildInitialState());

    const service = new ThreadService(store, {
      requestCompat: vi.fn(),
      markRequestSupported: vi.fn(),
      markRequestUnsupported: vi.fn(),
      toast: vi.fn(),
    });

    service.handleThreadStarted({
      thread: {
        title: 'Untitled Thread',
        status: { type: 'idle' },
      },
    });

    expect(store.getState().threads).toEqual([]);
    expect(store.getState().visibleThreads).toEqual([]);
  });

  it('drops stale synthetic threads but preserves the active local draft thread', async () => {
    const store = new RuntimeStore(buildInitialState());
    store.patch({
      activeThreadId: 'thread:local-draft',
      activeThread: {
        id: 'thread:local-draft',
        title: 'Untitled Thread',
        status: { type: 'idle' },
      },
      messageDraft: 'continue working',
      threads: [
        {
          id: 'thread:stale-placeholder',
          title: 'Untitled Thread',
          status: { type: 'idle' },
        },
        {
          id: 'thread:local-draft',
          title: 'Untitled Thread',
          status: { type: 'idle' },
        },
      ],
      visibleThreads: [
        {
          id: 'thread:stale-placeholder',
          title: 'Untitled Thread',
          status: { type: 'idle' },
        },
        {
          id: 'thread:local-draft',
          title: 'Untitled Thread',
          status: { type: 'idle' },
        },
      ],
    });

    const service = new ThreadService(store, {
      requestCompat: vi.fn().mockResolvedValue({
        threads: [
          {
            id: '019d3144-50cf-75d2-95d5-7eda39430211',
            title: 'Backend thread',
            status: { type: 'idle' },
          },
        ],
      }),
      markRequestSupported: vi.fn(),
      markRequestUnsupported: vi.fn(),
      toast: vi.fn(),
    });

    await service.loadThreads();

    const snapshot = store.getState();
    expect(snapshot.threads.map((thread) => thread.id)).toEqual([
      '019d3144-50cf-75d2-95d5-7eda39430211',
      'thread:local-draft',
    ]);
    expect(snapshot.threads.some((thread) => thread.id === 'thread:stale-placeholder')).toBe(false);
    expect(snapshot.activeThreadId).toBe('thread:local-draft');
  });

  it('falls back to thread/read when thread/resume loses the rollout', async () => {
    const store = new RuntimeStore(buildInitialState());
    store.patch({
      threads: [
        {
          id: '019d3144-50cf-75d2-95d5-7eda39430211',
          title: 'Recovered thread',
          status: { type: 'idle' },
        },
      ],
      visibleThreads: [
        {
          id: '019d3144-50cf-75d2-95d5-7eda39430211',
          title: 'Recovered thread',
          status: { type: 'idle' },
        },
      ],
    });

    const requestCompat = vi.fn(async (method: string) => {
      if (method === 'thread/resume') {
        throw {
          code: -32600,
          message: 'no rollout found for thread id 019d3144-50cf-75d2-95d5-7eda39430211',
        };
      }

      if (method === 'thread/read') {
        return {
          thread: {
            id: '019d3144-50cf-75d2-95d5-7eda39430211',
            title: 'Recovered thread',
            turns: [
              {
                items: [
                  {
                    id: 'user-1',
                    type: 'userMessage',
                    text: 'hello',
                    createdAt: '2026-03-28T01:00:00Z',
                  },
                  {
                    id: 'assistant-1',
                    type: 'agentMessage',
                    role: 'assistant',
                    text: 'world',
                    createdAt: '2026-03-28T01:00:01Z',
                  },
                ],
              },
            ],
          },
        };
      }

      throw new Error(`Unexpected method: ${method}`);
    }) as <T = unknown>(
      canonicalMethod: string,
      params?: unknown,
      fallbacks?: readonly string[],
    ) => Promise<T>;

    const service = new ThreadService(store, {
      requestCompat,
      markRequestSupported: vi.fn(),
      markRequestUnsupported: vi.fn(),
      toast: vi.fn(),
    });

    await service.selectThread('019d3144-50cf-75d2-95d5-7eda39430211');

    expect(requestCompat).toHaveBeenCalledWith(
      'thread/resume',
      { threadId: '019d3144-50cf-75d2-95d5-7eda39430211', includeTurns: true },
      ['thread/read', 'thread/get', 'session/open'],
    );
    expect(requestCompat).toHaveBeenCalledWith(
      'thread/read',
      { threadId: '019d3144-50cf-75d2-95d5-7eda39430211', includeTurns: true },
      ['thread/get'],
    );

    const snapshot = store.getState();
    expect(snapshot.chatEntries).toHaveLength(2);
    expect(snapshot.chatEntries[0]?.content).toBe('hello');
    expect(snapshot.chatEntries[1]?.content).toBe('world');
  });

  it('preserves a newly started thread when thread/list is empty before the first message', async () => {
    const store = new RuntimeStore(buildInitialState());

    const requestCompat = vi.fn(async (method: string) => {
      if (method === 'thread/start') {
        return {
          thread: {
            id: '019d3144-50cf-75d2-95d5-7eda39430211',
            title: 'Fresh thread',
            cwd: '/workspace',
            status: { type: 'idle' },
          },
        };
      }

      if (method === 'thread/list') {
        return { threads: [] };
      }

      if (method === 'thread/resume') {
        throw {
          code: -32600,
          message: 'no rollout found for thread id 019d3144-50cf-75d2-95d5-7eda39430211',
        };
      }

      if (method === 'thread/read') {
        throw {
          code: -32600,
          message:
            'thread 019d3144-50cf-75d2-95d5-7eda39430211 is not available: includeTurns is unavailable before first user message',
        };
      }

      throw new Error(`Unexpected method: ${method}`);
    }) as <T = unknown>(
      canonicalMethod: string,
      params?: unknown,
      fallbacks?: readonly string[],
    ) => Promise<T>;

    const service = new ThreadService(store, {
      requestCompat,
      markRequestSupported: vi.fn(),
      markRequestUnsupported: vi.fn(),
      toast: vi.fn(),
    });

    const threadId = await service.ensureWritableThread(null);

    const snapshot = store.getState();
    expect(threadId).toBe('019d3144-50cf-75d2-95d5-7eda39430211');
    expect(snapshot.activeThreadId).toBe('019d3144-50cf-75d2-95d5-7eda39430211');
    expect(snapshot.activeThread?.id).toBe('019d3144-50cf-75d2-95d5-7eda39430211');
    expect(snapshot.threads.map((thread) => thread.id)).toEqual([
      '019d3144-50cf-75d2-95d5-7eda39430211',
    ]);
  });

  it('treats includeTurns-unavailable as an empty thread instead of an error', async () => {
    const store = new RuntimeStore(buildInitialState());
    store.patch({
      threads: [
        {
          id: '019d3144-50cf-75d2-95d5-7eda39430211',
          title: 'Fresh thread',
          status: { type: 'idle' },
        },
      ],
      visibleThreads: [
        {
          id: '019d3144-50cf-75d2-95d5-7eda39430211',
          title: 'Fresh thread',
          status: { type: 'idle' },
        },
      ],
    });

    const requestCompat = vi.fn(async (method: string) => {
      if (method === 'thread/resume') {
        throw {
          code: -32600,
          message: 'no rollout found for thread id 019d3144-50cf-75d2-95d5-7eda39430211',
        };
      }

      if (method === 'thread/read') {
        throw {
          code: -32600,
          message:
            'thread 019d3144-50cf-75d2-95d5-7eda39430211 is not available: includeTurns is unavailable before first user message',
        };
      }

      throw new Error(`Unexpected method: ${method}`);
    }) as <T = unknown>(
      canonicalMethod: string,
      params?: unknown,
      fallbacks?: readonly string[],
    ) => Promise<T>;

    const service = new ThreadService(store, {
      requestCompat,
      markRequestSupported: vi.fn(),
      markRequestUnsupported: vi.fn(),
      toast: vi.fn(),
    });

    await service.selectThread('019d3144-50cf-75d2-95d5-7eda39430211');

    const snapshot = store.getState();
    expect(snapshot.activeThreadId).toBe('019d3144-50cf-75d2-95d5-7eda39430211');
    expect(snapshot.chatEntries).toHaveLength(1);
    expect(snapshot.chatEntries[0]?.content).toBe('Thread is empty. Send a message to start.');
    expect(snapshot.chatEntries[0]?.status).toBe('done');
  });
});
