import { describe, expect, it } from 'vitest';
import {
  applyPersistedRuntimeState,
  buildInitialState,
  buildPersistedRuntimeState,
} from '../../src/lib/codex-runtime/runtime-state';
import { isBackendThreadId, sanitizeBackendThreadId } from '../../src/lib/codex-runtime/thread-ids';

describe('thread id safeguards', () => {
  it('accepts canonical backend thread ids and rejects synthetic ids', () => {
    const validThreadId = '123e4567-e89b-42d3-a456-426614174000';
    const validV7ThreadId = '019d26d6-a9c0-7521-8add-85c62a2afcf2';

    expect(isBackendThreadId(validThreadId)).toBe(true);
    expect(sanitizeBackendThreadId(validThreadId)).toBe(validThreadId);
    expect(isBackendThreadId(validV7ThreadId)).toBe(true);
    expect(sanitizeBackendThreadId(validV7ThreadId)).toBe(validV7ThreadId);
    expect(isBackendThreadId('thread:cached|title')).toBe(false);
    expect(sanitizeBackendThreadId('thread:cached|title')).toBeNull();
  });

  it('persists and restores local thread snapshots without exposing them as backend ids', () => {
    const state = buildInitialState();
    state.activeThreadId = 'thread:local-fallback';
    state.threads = [
      {
        id: 'thread:local-fallback',
        title: 'Recovered thread',
        status: { type: 'idle' },
      },
    ];
    state.threadEntries = {
      'thread:local-fallback': [
        {
          id: 'entry-1',
          kind: 'message',
          role: 'assistant',
          content: 'Recovered message',
        },
      ],
    };
    state.chatEntries = state.threadEntries['thread:local-fallback'] ?? [];

    const persisted = buildPersistedRuntimeState(state);
    expect(persisted.activeThreadId).toBe('thread:local-fallback');
    expect(persisted).not.toHaveProperty('threadEntries');

    const restored = applyPersistedRuntimeState(buildInitialState(), persisted);
    expect(restored.activeThreadId).toBe('thread:local-fallback');
    expect(restored.activeThread).toBeNull();
    expect(restored.chatEntries).toEqual([]);

    const validThreadId = '123e4567-e89b-42d3-a456-426614174000';
    expect(
      applyPersistedRuntimeState(buildInitialState(), {
        activeThreadId: validThreadId,
      }).activeThreadId,
    ).toBe(validThreadId);

    const restoredFromLiveState = applyPersistedRuntimeState(state, persisted);
    expect(restoredFromLiveState.activeThread?.title).toBe('Recovered thread');
    expect(restoredFromLiveState.chatEntries?.[0]?.content).toBe('Recovered message');
  });
});
