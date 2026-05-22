'use client';

import { useAccountState, useShellState } from '../ControlCenterContext';
import { AccountLoginBanner, ChatPanel, ContentTabs, ThreadHeader } from './ChatPanel';
import { ConfigPanel } from './ConfigPanel';
import { FilesPanel } from './FilesPanel';
import { InfoPanel } from './InfoPanel';
import { TerminalPanel } from './TerminalPanel';

export function MainPanels() {
  const account = useAccountState();
  const shell = useShellState();
  let activePanel = <ChatPanel />;

  if (shell.activeTab === 'terminal') {
    activePanel = <TerminalPanel />;
  } else if (shell.activeTab === 'files') {
    activePanel = <FilesPanel />;
  } else if (shell.activeTab === 'config') {
    activePanel = <ConfigPanel />;
  } else if (shell.activeTab === 'info') {
    activePanel = <InfoPanel />;
  }

  return (
    <main id="main">
      <ThreadHeader />
      <AccountLoginBanner loggedIn={account.loggedIn} loginInProgress={account.loginInProgress} />
      <ContentTabs />
      <div id="content-area">{activePanel}</div>
    </main>
  );
}
