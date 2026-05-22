import { describe, expect, it } from 'vitest';
import { reconcileMethodSupportLists } from '../../src/lib/codex-runtime/capability-state';

describe('reconcileMethodSupportLists', () => {
  it('moves methods cleanly between supported and unsupported lists', () => {
    const unsupportedState = reconcileMethodSupportLists({
      supportedMethods: ['thread/list'],
      unsupportedMethods: [],
      method: 'thread/list',
      status: 'unsupported',
    });

    expect(unsupportedState.supportedMethods).toEqual([]);
    expect(unsupportedState.unsupportedMethods).toEqual(['thread/list']);

    const supportedState = reconcileMethodSupportLists({
      supportedMethods: unsupportedState.supportedMethods,
      unsupportedMethods: unsupportedState.unsupportedMethods,
      method: 'thread/list',
      status: 'supported',
    });

    expect(supportedState.supportedMethods).toEqual(['thread/list']);
    expect(supportedState.unsupportedMethods).toEqual([]);
  });
});
