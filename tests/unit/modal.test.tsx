// @vitest-environment happy-dom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { Modal } from '../../src/components/ui/Modal';
import { resetModalStackForTests } from '../../src/components/ui/modal-stack';

describe('Modal', () => {
  let appRoot: HTMLDivElement;
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    appRoot = document.createElement('div');
    appRoot.id = 'app';
    document.body.appendChild(appRoot);

    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    resetModalStackForTests();
  });

  afterEach(() => {
    act(() => {
      root.unmount();
    });
    resetModalStackForTests();
    container.remove();
    appRoot.remove();
    document.body.style.overflow = '';
  });

  it('keeps non-top modals mounted but inert when a higher-priority modal opens', () => {
    act(() => {
      root.render(
        <>
          <Modal isOpen onClose={() => undefined} layer="settings" overlayId="settings-overlay">
            <div>Settings</div>
          </Modal>
          <Modal isOpen onClose={() => undefined} layer="approval" overlayId="approval-overlay">
            <div>Approval</div>
          </Modal>
        </>,
      );
    });

    const settingsOverlay = document.getElementById('settings-overlay');
    const approvalOverlay = document.getElementById('approval-overlay');

    expect(settingsOverlay).not.toBeNull();
    expect(approvalOverlay).not.toBeNull();
    expect(settingsOverlay?.getAttribute('aria-hidden')).toBe('true');
    expect(settingsOverlay?.getAttribute('style')).toContain('pointer-events: none');
    expect(approvalOverlay?.getAttribute('aria-hidden')).toBe('false');
    expect(document.body.style.overflow).toBe('hidden');
    expect(appRoot.getAttribute('inert')).toBe('');
  });
});
