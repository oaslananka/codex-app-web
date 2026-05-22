'use client';

import { useRef, useSyncExternalStore } from 'react';
import { buildInitialState } from '../../../lib/codex-runtime/runtime-state';
import type { RuntimeSnapshot } from '../../../lib/codex-ui-runtime';

export type RuntimeSnapshotStore = {
  subscribe(listener: (snapshot: RuntimeSnapshot) => void): () => void;
  getSnapshot(): RuntimeSnapshot;
};

export type SelectorEqualityFn<T> = (left: T, right: T) => boolean;

export const EMPTY_RUNTIME_SNAPSHOT: RuntimeSnapshot = buildInitialState();

const subscribeEmptyStore = () => () => undefined;
const getEmptySnapshot = () => EMPTY_RUNTIME_SNAPSHOT;

export function shallowEqual<T>(left: T, right: T) {
  if (Object.is(left, right)) {
    return true;
  }

  if (typeof left !== 'object' || left === null || typeof right !== 'object' || right === null) {
    return false;
  }

  const leftEntries = Object.entries(left as Record<string, unknown>);
  const rightRecord = right as Record<string, unknown>;
  if (leftEntries.length !== Object.keys(rightRecord).length) {
    return false;
  }

  return leftEntries.every(
    ([key, value]) =>
      Object.prototype.hasOwnProperty.call(rightRecord, key) && Object.is(value, rightRecord[key]),
  );
}

export function useRuntimeSelector<T>(
  runtime: RuntimeSnapshotStore | null,
  selector: (snapshot: RuntimeSnapshot) => T,
  isEqual: SelectorEqualityFn<T> = Object.is,
): T {
  const subscribe = runtime?.subscribe ?? subscribeEmptyStore;
  const getSnapshot = runtime?.getSnapshot ?? getEmptySnapshot;
  const selectionCacheRef = useRef<{
    snapshot: RuntimeSnapshot;
    selection: T;
  } | null>(null);

  const getSelection = () => {
    const snapshot = getSnapshot();
    const nextSelection = selector(snapshot);
    const cachedSelection = selectionCacheRef.current;

    if (cachedSelection) {
      if (Object.is(cachedSelection.snapshot, snapshot)) {
        return cachedSelection.selection;
      }

      if (isEqual(cachedSelection.selection, nextSelection)) {
        selectionCacheRef.current = {
          snapshot,
          selection: cachedSelection.selection,
        };
        return cachedSelection.selection;
      }
    }

    selectionCacheRef.current = {
      snapshot,
      selection: nextSelection,
    };
    return nextSelection;
  };

  return useSyncExternalStore(subscribe, getSelection, getSelection);
}

export function useRuntimeSnapshot(runtime: RuntimeSnapshotStore | null): RuntimeSnapshot {
  return useRuntimeSelector(runtime, (snapshot) => snapshot);
}
