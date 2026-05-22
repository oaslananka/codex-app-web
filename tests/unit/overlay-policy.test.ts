import { describe, expect, it } from 'vitest';
import { resolveOverlayDismissals } from '../../src/components/codex/overlay-policy';

describe('resolveOverlayDismissals', () => {
  it('closes settings when an input modal is active', () => {
    expect(
      resolveOverlayDismissals({
        approvalOpen: false,
        inputOpen: true,
        sidebarOpen: false,
        settingsOpen: true,
      }),
    ).toEqual({
      closeInput: false,
      closeSidebar: false,
      closeSettings: true,
    });
  });

  it('keeps settings open when approval is layered above it', () => {
    expect(
      resolveOverlayDismissals({
        approvalOpen: true,
        inputOpen: false,
        sidebarOpen: false,
        settingsOpen: true,
      }),
    ).toEqual({
      closeInput: false,
      closeSidebar: false,
      closeSettings: false,
    });
  });

  it('closes both input and settings when approval is active over an input modal', () => {
    expect(
      resolveOverlayDismissals({
        approvalOpen: true,
        inputOpen: true,
        sidebarOpen: false,
        settingsOpen: true,
      }),
    ).toEqual({
      closeInput: true,
      closeSidebar: false,
      closeSettings: true,
    });
  });

  it('closes the sidebar when a modal-level overlay owns focus', () => {
    expect(
      resolveOverlayDismissals({
        approvalOpen: false,
        inputOpen: false,
        sidebarOpen: true,
        settingsOpen: true,
      }),
    ).toEqual({
      closeInput: false,
      closeSidebar: true,
      closeSettings: false,
    });
  });

  it('keeps overlays untouched when there is no collision', () => {
    expect(
      resolveOverlayDismissals({
        approvalOpen: false,
        inputOpen: false,
        sidebarOpen: false,
        settingsOpen: true,
      }),
    ).toEqual({
      closeInput: false,
      closeSidebar: false,
      closeSettings: false,
    });
  });
});
