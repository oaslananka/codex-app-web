'use client';

export type ModalLayer = 'settings' | 'dialog' | 'input' | 'lightbox' | 'approval';

type ModalEntry = {
  id: string;
  layer: ModalLayer;
  order: number;
};

const MODAL_LAYER_PRIORITY: Record<ModalLayer, number> = {
  settings: 10,
  dialog: 20,
  input: 30,
  lightbox: 40,
  approval: 50,
};

let modalOrder = 0;
const modalEntries: ModalEntry[] = [];
const stackListeners = new Set<() => void>();

function notifyModalStack() {
  if (typeof document !== 'undefined') {
    const appRoot = document.getElementById('app');
    const hasOpenModal = modalEntries.length > 0;
    document.body.dataset.modalOpen = modalEntries.length > 0 ? 'true' : 'false';
    document.body.style.overflow = hasOpenModal ? 'hidden' : '';
    if (appRoot) {
      if (hasOpenModal) {
        appRoot.setAttribute('aria-hidden', 'true');
        appRoot.setAttribute('inert', '');
      } else {
        appRoot.removeAttribute('aria-hidden');
        appRoot.removeAttribute('inert');
      }
    }
  }
  stackListeners.forEach((listener) => listener());
}

export function subscribeToModalStack(listener: () => void) {
  stackListeners.add(listener);
  return () => {
    stackListeners.delete(listener);
  };
}

export function registerModal(id: string, layer: ModalLayer) {
  const existing = modalEntries.find((entry) => entry.id === id);
  if (existing) {
    existing.layer = layer;
    existing.order = ++modalOrder;
  } else {
    modalEntries.push({
      id,
      layer,
      order: ++modalOrder,
    });
  }
  notifyModalStack();
}

export function unregisterModal(id: string) {
  const index = modalEntries.findIndex((entry) => entry.id === id);
  if (index === -1) return;
  modalEntries.splice(index, 1);
  notifyModalStack();
}

export function getTopModalId() {
  if (!modalEntries.length) return null;
  return (
    [...modalEntries].sort((left, right) => {
      const priorityDelta = MODAL_LAYER_PRIORITY[right.layer] - MODAL_LAYER_PRIORITY[left.layer];
      if (priorityDelta !== 0) return priorityDelta;
      return right.order - left.order;
    })[0]?.id ?? null
  );
}

export function resetModalStackForTests() {
  modalEntries.splice(0, modalEntries.length);
  modalOrder = 0;
  notifyModalStack();
}
