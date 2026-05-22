import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  applyPersistedRuntimeState,
  buildInitialState,
  buildPersistedRuntimeState,
  readPersistedRuntimeState,
  RUNTIME_STORAGE_KEY,
  writePersistedRuntimeState,
} from '../../src/lib/codex-runtime/runtime-state';

type LocalStorageStub = {
  getItem: (key: string) => string | null;
  setItem: (key: string, value: string) => void;
  removeItem: (key: string) => void;
};

function createLocalStorageStub(): LocalStorageStub {
  const store = new Map<string, string>();
  return {
    getItem: (key) => store.get(key) ?? null,
    setItem: (key, value) => {
      store.set(key, value);
    },
    removeItem: (key) => {
      store.delete(key);
    },
  };
}

describe('runtime state persistence', () => {
  const originalWindow = globalThis.window;

  beforeEach(() => {
    Object.defineProperty(globalThis, 'window', {
      configurable: true,
      value: {
        localStorage: createLocalStorageStub(),
      },
    });
  });

  afterEach(() => {
    if (originalWindow === undefined) {
      Reflect.deleteProperty(globalThis, 'window');
      return;
    }

    Object.defineProperty(globalThis, 'window', {
      configurable: true,
      value: originalWindow,
    });
  });

  it('persists only compact shell state and excludes transcript-heavy thread data', () => {
    const state = buildInitialState();
    state.activeThreadId = 'thread-1';
    state.selectedModel = 'gpt-5';
    state.threads = [
      {
        id: 'thread-1',
        title: 'Large thread',
        updatedAt: '2026-03-28T12:00:00Z',
        status: { type: 'idle' },
        archived: false,
      },
    ];
    state.threadEntries = {
      'thread-1': [
        {
          id: 'entry-1',
          kind: 'message',
          role: 'assistant',
          text: 'This should never hit persisted storage',
          timestamp: '2026-03-28T12:00:00Z',
        },
      ],
    } as never;

    const persisted = buildPersistedRuntimeState(state);

    expect(persisted).toMatchObject({
      activeThreadId: 'thread-1',
      selectedModel: 'gpt-5',
    });
    expect(persisted).not.toHaveProperty('threads');
    expect(persisted).not.toHaveProperty('threadEntries');
  });

  it('stores a versioned payload and ignores oversized legacy transcript snapshots', () => {
    writePersistedRuntimeState({
      activeThreadId: 'thread-1',
      activeTab: 'config',
      selectedSandboxMode: 'workspace-write',
    });

    const raw = globalThis.window.localStorage.getItem(RUNTIME_STORAGE_KEY);
    expect(raw).toContain('"version"');

    globalThis.window.localStorage.setItem(
      RUNTIME_STORAGE_KEY,
      JSON.stringify({
        activeThreadId: 'legacy-thread',
        threads: [{ id: 'legacy-thread' }],
        threadEntries: {
          'legacy-thread': [{ id: 'entry-1', text: 'legacy transcript' }],
        },
      }),
    );

    expect(readPersistedRuntimeState()).toEqual({});
  });

  it('restores compact preferences without mutating runtime thread state', () => {
    const state = buildInitialState();
    state.threads = [
      {
        id: 'thread-2',
        title: 'Existing thread',
        updatedAt: '2026-03-28T12:00:00Z',
        status: { type: 'idle' },
        archived: false,
      },
    ];
    state.visibleThreads = state.threads;
    state.threadEntries = {
      'thread-2': [{ id: 'entry-keep' }],
    } as never;

    const applied = applyPersistedRuntimeState(state, {
      activeThreadId: 'thread-2',
      activeTab: 'info',
      showCommentary: true,
    });

    expect(applied.activeThreadId).toBe('thread-2');
    expect(applied.activeTab).toBe('info');
    expect(applied.showCommentary).toBe(true);
    expect(applied.threads).toBe(state.threads);
    expect(applied.threadEntries).toBe(state.threadEntries);
    expect(applied.chatEntries).toEqual(state.threadEntries['thread-2']);
  });
});
