import type { ActiveInfoTab } from './panels';

function LogoIcon() {
  return (
    <svg className="logo-icon" viewBox="0 0 26 26" fill="none" xmlns="http://www.w3.org/2000/svg">
      <rect x="1" y="1" width="24" height="24" rx="5" stroke="#1d8cf8" strokeWidth="1.5" />
      <path
        d="M7 10l-3 3 3 3M19 10l3 3-3 3M15 7l-4 12"
        stroke="#00d4c8"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

type HeaderProps = {
  activeTab: 'chat' | 'terminal' | 'files' | 'config' | 'info';
  activeInfoTab: ActiveInfoTab;
  accountEmail: string;
  accountPlan: string;
  connectionState: string;
  integrationWarningCount: number;
  isSidebarOpen: boolean;
  showCommentary: boolean;
  onOpenMcp: () => void;
  onOpenModels: () => void;
  onOpenPlugins: () => void;
  onOpenIntegrationWarnings: () => void;
  onOpenSettings: () => void;
  onToggleCommentary: () => void;
  onToggleSidebar: () => void;
};

function getConnectionBadge(connectionState: string) {
  if (connectionState === 'connected') {
    return { className: 'connected', label: 'ONLINE' };
  }

  if (connectionState === 'connecting') {
    return { className: 'connecting', label: 'CONNECTING' };
  }

  return { className: 'error', label: 'OFFLINE' };
}

export function Header({
  activeTab,
  activeInfoTab,
  accountEmail,
  accountPlan,
  connectionState,
  integrationWarningCount,
  isSidebarOpen,
  showCommentary,
  onOpenMcp,
  onOpenModels,
  onOpenPlugins,
  onOpenIntegrationWarnings,
  onOpenSettings,
  onToggleCommentary,
  onToggleSidebar,
}: HeaderProps) {
  const connectionBadge = getConnectionBadge(connectionState);

  return (
    <header id="header" role="banner">
      <button
        type="button"
        className="logo"
        id="btn-toggle-sidebar"
        title="Toggle sidebar"
        aria-label="Toggle sidebar"
        aria-expanded={isSidebarOpen}
        aria-controls="sidebar"
        onClick={onToggleSidebar}
      >
        <LogoIcon />
        CODEX
      </button>

      <div className={`conn-badge ${connectionBadge.className}`} id="conn-badge">
        <span className="dot" />
        <span id="conn-label">{connectionBadge.label}</span>
      </div>

      {integrationWarningCount > 0 ? (
        <button
          type="button"
          className="integration-status-badge"
          id="integration-status-badge"
          role="status"
          title="Open degraded integrations"
          aria-label="Open integrations status"
          data-tooltip="Open degraded integrations"
          onClick={onOpenIntegrationWarnings}
        >
          <span className="dot" />
          <span>
            {integrationWarningCount === 1
              ? '1 integration issue'
              : `${integrationWarningCount} integration issues`}
          </span>
        </button>
      ) : null}

      <div className="header-spacer" />

      <nav className="header-nav" aria-label="Primary navigation">
        <button
          type="button"
          className={`header-btn${activeTab === 'info' && activeInfoTab === 'models' ? ' active' : ''}`}
          id="btn-models"
          title="Models"
          aria-current={activeTab === 'info' && activeInfoTab === 'models' ? 'page' : undefined}
          aria-label="Models"
          onClick={onOpenModels}
        >
          <span aria-hidden="true">⬡</span>
          <span className="header-btn-label">Models</span>
        </button>
        <button
          type="button"
          className={`header-btn${activeTab === 'info' && activeInfoTab === 'mcp' ? ' active' : ''}`}
          id="btn-mcp"
          title="MCP Servers"
          aria-current={activeTab === 'info' && activeInfoTab === 'mcp' ? 'page' : undefined}
          aria-label="MCP servers"
          onClick={onOpenMcp}
        >
          <span aria-hidden="true">⊡</span>
          <span className="header-btn-label">MCP</span>
        </button>
        <button
          type="button"
          className={`header-btn${activeTab === 'info' && activeInfoTab === 'plugins' ? ' active' : ''}`}
          id="btn-plugins"
          title="Plugins"
          aria-current={activeTab === 'info' && activeInfoTab === 'plugins' ? 'page' : undefined}
          aria-label="Plugins"
          onClick={onOpenPlugins}
        >
          <span aria-hidden="true">◈</span>
          <span className="header-btn-label">Plugins</span>
        </button>
      </nav>
      <button
        type="button"
        className={`header-btn${showCommentary ? ' active' : ''}`}
        id="btn-toggle-commentary"
        title="Commentary"
        aria-pressed={showCommentary}
        aria-label={showCommentary ? 'Hide commentary' : 'Show commentary'}
        onClick={onToggleCommentary}
      >
        <span aria-hidden="true">💭</span>
        <span className="header-btn-label">
          {showCommentary ? 'Hide commentary' : 'Show commentary'}
        </span>
      </button>

      <div id="account-badge">
        <span id="account-email">{accountEmail}</span>
        <span className="plan" id="account-plan">
          {accountPlan}
        </span>
      </div>

      <button
        type="button"
        className="btn-icon"
        id="btn-settings"
        title="Settings"
        aria-label="Settings"
        aria-haspopup="dialog"
        onClick={onOpenSettings}
      >
        ⚙
      </button>
    </header>
  );
}
