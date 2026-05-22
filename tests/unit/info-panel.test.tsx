import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { InfoPanel } from '../../src/components/codex/panels/InfoPanel';

const mockedAccountState = vi.hoisted(() => ({
  accountEmail: 'user@example.com',
  accountPlan: 'PLUS',
  authStatus: { content: '', loading: false, error: '' },
  loggedIn: true,
  loginInProgress: false,
}));

const mockedChatState = vi.hoisted(() => ({
  models: [],
}));

const mockedInfoState = vi.hoisted(() => ({
  apps: [] as Array<Record<string, unknown>>,
  appsError: '',
  appsHydrated: false,
  appsLoading: false,
  experimentalFeatures: [],
  externalAgents: { loading: false, error: '', items: [], importedCount: 0 },
  fuzzySearch: { query: '', loading: false, error: '', results: [] },
  gitDiff: { content: '', loading: false, error: '' },
  infoError: '',
  infoHydrated: true,
  infoLoading: false,
  infoMcpServers: [],
  integrationWarnings: [] as Array<{
    id: string;
    context: 'info';
    source: 'apps' | 'mcp' | 'plugins' | 'skills' | 'features' | 'config';
    message: string;
  }>,
  pluginDetail: null,
  plugins: [],
  protocolCoverage: {
    requests: { implemented: 0, total: 0, missing: [], extra: [] },
    notifications: { implemented: 0, total: 0, missing: [], extra: [] },
    serverRequests: { implemented: 0, total: 0, missing: [], extra: [] },
  },
  skills: [],
  workspaceSummary: { content: '', source: 'idle', loading: false, error: '' },
}));

const mockedShellState = vi.hoisted(() => ({
  activeInfoCategory: 'workspace',
  activeInfoTab: 'apps',
  activeTab: 'info',
  logSettings: { level: 'info', timestamps: true },
  showCommentary: false,
}));

const mockedThreadState = vi.hoisted(() => ({
  activeThread: { id: 'thread-1' },
  review: { loading: false, error: '', reviewThreadId: null },
}));

const mockedActions = vi.hoisted(() => ({
  info: {
    loadApps: vi.fn(),
    loadSummary: vi.fn(),
    loadGitDiff: vi.fn(),
    startReview: vi.fn(),
    runFuzzySearch: vi.fn(),
    openFuzzyResult: vi.fn(),
    logout: vi.fn(),
    startLogin: vi.fn(),
    loadAuthStatus: vi.fn(),
    reloadMcp: vi.fn(),
    detectExternalAgents: vi.fn(),
    importExternalAgents: vi.fn(),
    installPlugin: vi.fn(),
    removePlugin: vi.fn(),
    loadPluginDetail: vi.fn(),
    setExperimentalFeatureEnabled: vi.fn(),
    setSkillEnabled: vi.fn(),
  },
  shell: {
    openInfoTab: vi.fn(),
  },
}));

vi.mock('../../src/components/codex/ControlCenterContext', () => ({
  useAccountState: () => mockedAccountState,
  useChatState: () => mockedChatState,
  useControlCenterActions: () => mockedActions,
  useInfoState: () => mockedInfoState,
  useShellState: () => mockedShellState,
  useThreadState: () => mockedThreadState,
}));

vi.mock('../../src/lib/logging/browser-logger', () => ({
  clearBrowserLogs: vi.fn(),
  getRecentBrowserLogs: () => [],
  subscribeToBrowserLogs: () => () => undefined,
}));

vi.mock('../../src/components/ui', () => ({
  Skeleton: ({ lines }: { lines: number }) => <div data-testid={`skeleton-${lines}`} />,
}));

describe('InfoPanel', () => {
  beforeEach(() => {
    mockedInfoState.apps = [];
    mockedInfoState.appsError = '';
    mockedInfoState.appsHydrated = false;
    mockedInfoState.appsLoading = false;
    mockedInfoState.integrationWarnings = [];
    mockedInfoState.infoError = '';
    mockedInfoState.infoHydrated = true;
    mockedInfoState.infoLoading = false;
  });

  it('shows a pending apps message before the first lazy load completes', () => {
    const markup = renderToStaticMarkup(<InfoPanel />);

    expect(markup).toContain('Apps will load when this section comes into view.');
    expect(markup).not.toContain('The app list is empty.');
  });

  it('shows the apps loading state without rendering the empty state', () => {
    mockedInfoState.appsLoading = true;

    const markup = renderToStaticMarkup(<InfoPanel />);

    expect(markup).toContain('Loading apps…');
    expect(markup).not.toContain('The app list is empty.');
  });

  it('shows an apps error instead of the empty state after a failed load', () => {
    mockedInfoState.appsHydrated = true;
    mockedInfoState.appsError = 'Request failed with status 403 Forbidden';

    const markup = renderToStaticMarkup(<InfoPanel />);

    expect(markup).toContain('Request failed with status 403 Forbidden');
    expect(markup).not.toContain('The app list is empty.');
  });

  it('shows the empty state only after a successful empty apps response', () => {
    mockedInfoState.appsHydrated = true;

    const markup = renderToStaticMarkup(<InfoPanel />);

    expect(markup).toContain('The app list is empty.');
  });

  it('shows the upstream apps hint for auth/challenge failures', () => {
    mockedInfoState.appsHydrated = true;
    mockedInfoState.appsError =
      'Request failed with status 403 Forbidden: remote service returned an HTML challenge page instead of API JSON. This usually means auth expired or the request was blocked upstream.';
    mockedInfoState.integrationWarnings = [
      {
        id: 'info:apps',
        context: 'info',
        source: 'apps',
        message: `Apps unavailable: ${mockedInfoState.appsError}`,
      },
    ];

    const markup = renderToStaticMarkup(<InfoPanel />);

    expect(markup).toContain(
      'The Apps directory is currently being blocked by the upstream service.',
    );
  });
});
