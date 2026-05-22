import { describe, expect, it, vi } from 'vitest';
import { RuntimeStore } from '../../src/lib/codex-runtime/store';
import type { RuntimeState } from '../../src/lib/codex-runtime/types';

function createState(): RuntimeState {
  return {
    connected: false,
    connectionState: 'offline',
    connectionError: '',
    activeThreadId: null,
    activeTab: 'chat',
    activeFilter: 'active',
    searchTerm: '',
    visibleThreads: [],
    activeThread: null,
    activeThreadStatus: { type: 'idle' },
    loggedIn: false,
    loginInProgress: false,
    accountEmail: 'Not connected',
    accountPlan: '',
    showCommentary: false,
    pendingAttachments: [],
    attachmentUploadInProgress: false,
    turnActive: false,
    collaborationMode: 'default',
    collaborationModes: [
      {
        id: 'default',
        label: 'Default',
        supported: true,
      },
    ],
    messageDraft: '',
    selectedModel: '',
    selectedEffort: '',
    selectedServiceTier: '',
    selectedSandboxMode: '',
    models: [],
    configData: null,
    configHydrated: false,
    configLoading: false,
    configError: '',
    integrationWarnings: [],
    configMcpServers: [],
    configRequirements: null,
    infoHydrated: false,
    infoLoading: false,
    infoError: '',
    appsHydrated: false,
    appsLoading: false,
    appsError: '',
    infoMcpServers: [],
    skills: [],
    experimentalFeatures: [],
    plugins: [],
    pluginDetail: null,
    apps: [],
    fileBrowserPath: '/',
    fileBreadcrumb: [{ label: '/', path: '/' }],
    fileTree: [],
    fileLoading: false,
    fileError: '',
    currentFilePath: null,
    fileEditorName: 'No file selected',
    fileEditorContent: '',
    fileEditorReadOnly: true,
    fileMetadata: null,
    terminalCommand: '',
    terminalCwd: '',
    terminalStdin: '',
    terminalOutput: [],
    terminalRunning: false,
    terminalSize: { cols: 120, rows: 32 },
    chatEntries: [],
    activeApprovalRequest: null,
    protocolCoverage: {
      requests: { implemented: 0, total: 0, missing: [], extra: [] },
      notifications: { implemented: 0, total: 0, missing: [], extra: [] },
      serverRequests: { implemented: 0, total: 0, missing: [], extra: [] },
    },
    capabilities: {
      requests: {} as RuntimeState['capabilities']['requests'],
      notifications: {} as RuntimeState['capabilities']['notifications'],
      serverRequests: {} as RuntimeState['capabilities']['serverRequests'],
    },
    workspaceSummary: { content: '', source: 'idle', loading: false, error: '' },
    gitDiff: { content: '', loading: false, error: '' },
    authStatus: { content: '', loading: false, error: '' },
    fuzzySearch: { query: '', loading: false, error: '', results: [] },
    review: { loading: false, error: '', reviewThreadId: null },
    externalAgents: { loading: false, error: '', items: [], importedCount: 0 },
    connectionBanner: { visible: false, target: '', message: '' },
    threads: [],
    threadEntries: {},
    currentProcId: null,
    fileTreeCache: {},
    fileTreeExpanded: ['/'],
    unsupportedMethods: [],
    supportedMethods: [],
    configBatchDraft: {},
  };
}

describe('RuntimeStore', () => {
  it('patches state and notifies subscribers after the microtask flush', async () => {
    const store = new RuntimeStore(createState());
    const listener = vi.fn();
    const unsubscribe = store.subscribe(listener);

    store.patch({ connected: true, connectionState: 'connected' });

    expect(store.getState().connected).toBe(true);
    expect(store.getState().connectionState).toBe('connected');
    expect(listener).not.toHaveBeenCalled();

    await Promise.resolve();
    expect(listener).toHaveBeenCalledTimes(1);

    unsubscribe();
    store.patch({ connectionState: 'offline' });
    await Promise.resolve();
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it('coalesces multiple synchronous patches into one notification', async () => {
    const store = new RuntimeStore(createState());
    const listener = vi.fn();

    store.subscribe(listener);
    store.patch({ connected: true });
    store.patch({ connectionState: 'connected' });

    expect(listener).not.toHaveBeenCalled();

    await Promise.resolve();

    expect(listener).toHaveBeenCalledTimes(1);
    expect(listener.mock.calls[0]?.[0].connected).toBe(true);
    expect(listener.mock.calls[0]?.[0].connectionState).toBe('connected');
  });

  it('supports functional patch updates', () => {
    const store = new RuntimeStore(createState());
    store.patch((current) => ({
      messageDraft: `${current.messageDraft}hello`,
      selectedModel: 'gpt-5',
    }));

    expect(store.getState().messageDraft).toBe('hello');
    expect(store.getState().selectedModel).toBe('gpt-5');
  });
});
