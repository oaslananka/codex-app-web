'use client';

import { useCallback, useEffect, useState } from 'react';

const SHELL_STORAGE_KEY = 'codex-control-center.shell';

function readPersistedShellState() {
  if (typeof window === 'undefined') {
    return {
      activeTab: 'chat' as const,
      isSidebarOpen: false,
      showCommentary: false,
    };
  }

  try {
    const raw = window.localStorage.getItem(SHELL_STORAGE_KEY);
    if (!raw) {
      return {
        activeTab: 'chat' as const,
        isSidebarOpen: false,
        showCommentary: false,
      };
    }

    const parsed = JSON.parse(raw) as {
      activeTab?: 'chat' | 'terminal' | 'files' | 'config' | 'info';
      isSidebarOpen?: boolean;
      showCommentary?: boolean;
    };

    return {
      activeTab: parsed.activeTab ?? 'chat',
      isSidebarOpen: parsed.isSidebarOpen ?? false,
      showCommentary: parsed.showCommentary ?? false,
    };
  } catch {
    return {
      activeTab: 'chat' as const,
      isSidebarOpen: false,
      showCommentary: false,
    };
  }
}

export type ShellRuntime = {
  setActiveTab(tabName: string): void;
  setCollaborationMode?(value: string): void;
  setCommentaryVisible(visible: boolean): void;
  focusThreadSearch(): void;
  startNewThread(): void | Promise<void>;
  closeTransientUi(): boolean;
  reconnectCodex(): void;
};

export function useControlCenterShell(runtime: ShellRuntime | null) {
  const [activeTab, setActiveTabState] = useState<
    'chat' | 'terminal' | 'files' | 'config' | 'info'
  >('chat');
  const [isSidebarOpen, setSidebarOpen] = useState(false);
  const [showCommentary, setShowCommentary] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [storageHydrated, setStorageHydrated] = useState(false);
  const setActiveTab = useCallback(
    (tabName: 'chat' | 'terminal' | 'files' | 'config' | 'info') => {
      setActiveTabState(tabName);
      setSidebarOpen(false);
      runtime?.setActiveTab(tabName);
    },
    [runtime],
  );

  const toggleCommentary = useCallback(() => {
    const next = !showCommentary;
    setShowCommentary(next);
    runtime?.setCommentaryVisible(next);
  }, [runtime, showCommentary]);

  const openSettings = useCallback(() => {
    setSettingsOpen(true);
  }, []);

  const closeSettings = useCallback(() => {
    setSettingsOpen(false);
  }, []);

  const saveSettings = useCallback(() => {
    setSettingsOpen(false);
    runtime?.reconnectCodex();
  }, [runtime]);

  const handleKeyDown = useCallback(
    (event: KeyboardEvent) => {
      if (!runtime) {
        return;
      }

      if (event.ctrlKey && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        runtime.focusThreadSearch();
        return;
      }

      if (event.ctrlKey && event.key.toLowerCase() === 'n') {
        event.preventDefault();
        void runtime.startNewThread();
        return;
      }

      if (event.key === 'Escape' && runtime.closeTransientUi()) {
        event.preventDefault();
        return;
      }

      if (event.key === 'Escape' && settingsOpen) {
        event.preventDefault();
        setSettingsOpen(false);
      }
    },
    [runtime, settingsOpen],
  );

  useEffect(() => {
    const persistedShellState = readPersistedShellState();
    setActiveTabState(persistedShellState.activeTab);
    setSidebarOpen(persistedShellState.isSidebarOpen);
    setShowCommentary(persistedShellState.showCommentary);
    setStorageHydrated(true);
  }, []);

  useEffect(() => {
    runtime?.setActiveTab(activeTab);
    runtime?.setCommentaryVisible(showCommentary);
  }, [activeTab, runtime, showCommentary]);

  useEffect(() => {
    if (!storageHydrated) return;
    try {
      window.localStorage.setItem(
        SHELL_STORAGE_KEY,
        JSON.stringify({
          activeTab,
          isSidebarOpen,
          showCommentary,
        }),
      );
    } catch {
      // Ignore storage failures.
    }
  }, [activeTab, isSidebarOpen, showCommentary, storageHydrated]);

  useEffect(() => {
    if (!runtime) {
      return;
    }

    document.addEventListener('keydown', handleKeyDown);

    return () => {
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [handleKeyDown, runtime]);

  return {
    activeTab,
    isSidebarOpen,
    settingsOpen,
    showCommentary,
    closeSettings,
    openSettings,
    saveSettings,
    setActiveTab,
    setSidebarOpen,
    toggleCommentary,
  };
}
