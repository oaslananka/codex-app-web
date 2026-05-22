import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MainPanels } from '../../src/components/codex/panels/MainPanels';

const mockedAccountState = vi.hoisted(() => ({
  loggedIn: true,
  loginInProgress: false,
}));

const mockedShellState = vi.hoisted(() => ({
  activeTab: 'chat',
}));

vi.mock('../../src/components/codex/ControlCenterContext', () => ({
  useAccountState: () => mockedAccountState,
  useShellState: () => mockedShellState,
}));

vi.mock('../../src/components/codex/panels/ChatPanel', () => ({
  AccountLoginBanner: ({
    loggedIn,
    loginInProgress,
  }: {
    loggedIn: boolean;
    loginInProgress: boolean;
  }) => (
    <div data-testid="account-banner">
      {String(loggedIn)}:{String(loginInProgress)}
    </div>
  ),
  ChatPanel: () => <div data-panel="chat">chat</div>,
  ContentTabs: () => <div data-testid="content-tabs">tabs</div>,
  ThreadHeader: () => <div data-testid="thread-header">header</div>,
}));

vi.mock('../../src/components/codex/panels/ConfigPanel', () => ({
  ConfigPanel: () => <div data-panel="config">config</div>,
}));

vi.mock('../../src/components/codex/panels/FilesPanel', () => ({
  FilesPanel: () => <div data-panel="files">files</div>,
}));

vi.mock('../../src/components/codex/panels/InfoPanel', () => ({
  InfoPanel: () => <div data-panel="info">info</div>,
}));

vi.mock('../../src/components/codex/panels/TerminalPanel', () => ({
  TerminalPanel: () => <div data-panel="terminal">terminal</div>,
}));

describe('MainPanels', () => {
  beforeEach(() => {
    mockedAccountState.loggedIn = true;
    mockedAccountState.loginInProgress = false;
    mockedShellState.activeTab = 'chat';
  });

  it('renders shared chrome and only mounts the active panel', () => {
    mockedShellState.activeTab = 'files';

    const markup = renderToStaticMarkup(<MainPanels />);

    expect(markup).toContain('data-testid="thread-header"');
    expect(markup).toContain('data-testid="account-banner"');
    expect(markup).toContain('data-testid="content-tabs"');
    expect(markup).toContain('data-panel="files"');
    expect(markup).not.toContain('data-panel="chat"');
    expect(markup).not.toContain('data-panel="terminal"');
    expect(markup).not.toContain('data-panel="config"');
    expect(markup).not.toContain('data-panel="info"');
  });
});
