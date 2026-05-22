import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  getTopModalId,
  registerModal,
  resetModalStackForTests,
  subscribeToModalStack,
  unregisterModal,
} from '../../src/components/ui/modal-stack';

type ElementStub = {
  attributes: Record<string, string>;
  setAttribute: (name: string, value: string) => void;
  removeAttribute: (name: string) => void;
};

function createElementStub(): ElementStub {
  return {
    attributes: {},
    setAttribute(name, value) {
      this.attributes[name] = value;
    },
    removeAttribute(name) {
      delete this.attributes[name];
    },
  };
}

describe('modal stack', () => {
  const originalDocument = globalThis.document;

  beforeEach(() => {
    const appRoot = createElementStub();
    Object.defineProperty(globalThis, 'document', {
      configurable: true,
      value: {
        body: {
          dataset: {},
          style: {},
        },
        getElementById(id: string) {
          return id === 'app' ? appRoot : null;
        },
      },
    });
    resetModalStackForTests();
  });

  afterEach(() => {
    resetModalStackForTests();
    if (originalDocument === undefined) {
      Reflect.deleteProperty(globalThis, 'document');
    } else {
      Object.defineProperty(globalThis, 'document', {
        configurable: true,
        value: originalDocument,
      });
    }
  });

  it('prefers the highest priority modal and locks background interaction while any modal is open', () => {
    registerModal('settings', 'settings');
    registerModal('dialog', 'dialog');
    registerModal('approval', 'approval');

    const appRoot = globalThis.document.getElementById('app') as ElementStub | null;

    expect(getTopModalId()).toBe('approval');
    expect(globalThis.document.body.dataset.modalOpen).toBe('true');
    expect(globalThis.document.body.style.overflow).toBe('hidden');
    expect(appRoot?.attributes['aria-hidden']).toBe('true');
    expect(appRoot?.attributes.inert).toBe('');

    unregisterModal('approval');
    expect(getTopModalId()).toBe('dialog');

    unregisterModal('dialog');
    unregisterModal('settings');
    expect(getTopModalId()).toBeNull();
    expect(globalThis.document.body.dataset.modalOpen).toBe('false');
    expect(globalThis.document.body.style.overflow).toBe('');
    expect(appRoot?.attributes['aria-hidden']).toBeUndefined();
    expect(appRoot?.attributes.inert).toBeUndefined();
  });

  it('notifies subscribers when the modal stack changes', () => {
    const listener = vi.fn();
    const unsubscribe = subscribeToModalStack(listener);

    registerModal('settings', 'settings');
    unregisterModal('settings');

    expect(listener).toHaveBeenCalledTimes(2);
    unsubscribe();
  });
});
