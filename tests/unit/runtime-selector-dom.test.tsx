// @vitest-environment happy-dom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { RuntimeSnapshot } from '../../src/lib/codex-ui-runtime';
import { buildInitialState } from '../../src/lib/codex-runtime/runtime-state';
import {
  type RuntimeSnapshotStore,
  shallowEqual,
  useRuntimeSelector,
} from '../../src/components/codex/hooks/useRuntimeSnapshot';

type TestRuntime = RuntimeSnapshotStore & {
  patch(partial: Partial<RuntimeSnapshot>): void;
};

function createRuntime(): TestRuntime {
  let snapshot = buildInitialState() as RuntimeSnapshot;
  const listeners = new Set<(snapshot: RuntimeSnapshot) => void>();

  return {
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    getSnapshot() {
      return snapshot;
    },
    patch(partial) {
      snapshot = {
        ...snapshot,
        ...partial,
      };
      listeners.forEach((listener) => listener(snapshot));
    },
  };
}

describe('useRuntimeSelector', () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => {
      root.unmount();
    });
    container.remove();
  });

  it('does not re-render selectors when unrelated snapshot fields change', () => {
    const runtime = createRuntime();
    let accountRenderCount = 0;
    let threadRenderCount = 0;

    function AccountProbe() {
      useRuntimeSelector(
        runtime,
        (snapshot) => ({
          accountEmail: snapshot.accountEmail,
          loggedIn: snapshot.loggedIn,
        }),
        shallowEqual,
      );
      accountRenderCount++;
      return <div id="account-probe" />;
    }

    function ThreadProbe() {
      useRuntimeSelector(
        runtime,
        (snapshot) => ({
          messageDraft: snapshot.messageDraft,
        }),
        shallowEqual,
      );
      threadRenderCount++;
      return <div id="thread-probe" />;
    }

    act(() => {
      root.render(
        <>
          <AccountProbe />
          <ThreadProbe />
        </>,
      );
    });

    expect(accountRenderCount).toBe(1);
    expect(threadRenderCount).toBe(1);

    act(() => {
      runtime.patch({ connectionState: 'connecting' });
    });

    expect(accountRenderCount).toBe(1);
    expect(threadRenderCount).toBe(1);

    act(() => {
      runtime.patch({ accountEmail: 'next@example.com' });
    });

    expect(accountRenderCount).toBe(2);
    expect(threadRenderCount).toBe(1);

    act(() => {
      runtime.patch({ messageDraft: 'hello' });
    });

    expect(accountRenderCount).toBe(2);
    expect(threadRenderCount).toBe(2);
  });
});
