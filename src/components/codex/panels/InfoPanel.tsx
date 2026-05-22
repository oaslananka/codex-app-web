'use client';

import { useEffect, useRef, useState, type RefObject } from 'react';
import { sanitizeBackendThreadId } from '../../../lib/codex-runtime/thread-ids';
import {
  clearBrowserLogs,
  getRecentBrowserLogs,
  subscribeToBrowserLogs,
  type BrowserLogEntry,
} from '../../../lib/logging/browser-logger';
import { LOG_LEVEL_PRIORITY, type LogLevel } from '../../../lib/logging/shared';
import { Skeleton } from '../../ui';
import {
  useAccountState,
  useChatState,
  useControlCenterActions,
  useInfoState,
  useShellState,
  useThreadState,
} from '../ControlCenterContext';
import type { ActiveInfoCategory, ActiveInfoTab } from './types';
import {
  getExperimentalFeatureDisplayName,
  getExperimentalFeatureKey,
  splitExperimentalFeatures,
} from './experimental-feature-utils';
import {
  getAppsAvailabilityHint,
  getAppsPendingMessage,
  shouldShowAppsEmptyState,
} from './info-panel-utils';

function getMcpStatusClass(status?: string) {
  if (status === 'running') return 'running';
  if (status === 'starting') return 'starting';
  return 'error';
}

export function InfoPanel() {
  const account = useAccountState();
  const actions = useControlCenterActions();
  const chat = useChatState();
  const info = useInfoState();
  const shell = useShellState();
  const thread = useThreadState();
  const integrationWarnings = info.integrationWarnings.filter(
    (warning) => warning.context === 'info',
  );
  const hasBackendThreadId = Boolean(sanitizeBackendThreadId(thread.activeThread?.id));
  const isInitialInfoLoading = shell.activeTab === 'info' && !info.infoHydrated && !info.infoError;
  const [searchQuery, setSearchQuery] = useState('');
  const [browserLogs, setBrowserLogs] = useState<BrowserLogEntry[]>(getRecentBrowserLogs);
  const [logFilter, setLogFilter] = useState<LogLevel>('trace');
  const modelsRef = useRef<HTMLDivElement | null>(null);
  const mcpRef = useRef<HTMLDivElement | null>(null);
  const pluginsRef = useRef<HTMLDivElement | null>(null);
  const appsRef = useRef<HTMLDivElement | null>(null);
  const skillsRef = useRef<HTMLDivElement | null>(null);

  const defaultInfoTabByCategory: Record<ActiveInfoCategory, ActiveInfoTab> = {
    session: 'models',
    workspace: 'apps',
    integrations: 'mcp',
    settings: 'skills',
  };

  useEffect(() => {
    const unsubscribe = subscribeToBrowserLogs(setBrowserLogs);
    return () => {
      unsubscribe();
    };
  }, []);

  useEffect(() => {
    setLogFilter(shell.logSettings.level === 'silent' ? 'error' : shell.logSettings.level);
  }, [shell.logSettings.level]);

  useEffect(() => {
    if (shell.activeTab !== 'info') return;

    const refs: Record<ActiveInfoTab, RefObject<HTMLDivElement | null>> = {
      models: modelsRef,
      mcp: mcpRef,
      plugins: pluginsRef,
      apps: appsRef,
      skills: skillsRef,
    };
    const node = refs[shell.activeInfoTab].current;
    if (!node) return;

    requestAnimationFrame(() => {
      node.scrollIntoView({ block: 'start', behavior: 'smooth' });
      node.focus({ preventScroll: true });
    });
  }, [shell.activeInfoTab, shell.activeTab]);

  useEffect(() => {
    if (
      shell.activeTab !== 'info' ||
      shell.activeInfoCategory !== 'workspace' ||
      info.appsHydrated ||
      info.appsLoading
    ) {
      return;
    }

    const node = appsRef.current;
    if (!node) {
      return;
    }

    if (typeof IntersectionObserver === 'undefined') {
      void actions.info.loadApps();
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        const isVisible = entries.some((entry) => entry.isIntersecting);
        if (!isVisible) {
          return;
        }

        observer.disconnect();
        void actions.info.loadApps();
      },
      {
        root: document.getElementById('info-panel'),
        threshold: 0.2,
      },
    );

    observer.observe(node);

    return () => {
      observer.disconnect();
    };
  }, [
    actions.info,
    info.appsHydrated,
    info.appsLoading,
    shell.activeInfoCategory,
    shell.activeTab,
  ]);

  const infoCategories: Array<{ id: ActiveInfoCategory; label: string }> = [
    { id: 'session', label: 'Session' },
    { id: 'workspace', label: 'Workspace' },
    { id: 'integrations', label: 'Integrations' },
    { id: 'settings', label: 'Settings' },
  ];
  const {
    documented: documentedExperimentalFeatures,
    backendOnly: backendOnlyExperimentalFeatures,
  } = splitExperimentalFeatures(info.experimentalFeatures);
  const appsAvailabilityHint = getAppsAvailabilityHint(integrationWarnings);
  const appsPendingMessage = getAppsPendingMessage(info.appsHydrated, info.appsLoading);
  const showAppsEmptyState = shouldShowAppsEmptyState(
    info.appsHydrated,
    info.appsLoading,
    info.appsError,
    info.apps.length,
  );
  const filteredLogs = browserLogs
    .filter((entry) => LOG_LEVEL_PRIORITY[entry.level] >= LOG_LEVEL_PRIORITY[logFilter])
    .slice(-120)
    .reverse();

  return (
    <div className={`panel${shell.activeTab === 'info' ? ' active' : ''}`} id="panel-info">
      <div id="info-panel">
        <div className="info-nav" role="tablist" aria-label="Info sections">
          {infoCategories.map((category) => (
            <button
              key={category.id}
              type="button"
              role="tab"
              className={`info-nav-tab${shell.activeInfoCategory === category.id ? ' active' : ''}`}
              aria-selected={shell.activeInfoCategory === category.id}
              onClick={() => actions.shell.openInfoTab(defaultInfoTabByCategory[category.id])}
            >
              {category.label}
            </button>
          ))}
        </div>
        {info.infoLoading || isInitialInfoLoading ? (
          <div className="loading">
            <Skeleton lines={5} />
            <div>Loading info…</div>
          </div>
        ) : info.infoError ? (
          <div className="panel-error">Could not load info: {info.infoError}</div>
        ) : (
          <>
            {integrationWarnings.length ? (
              <div className="integration-warning-card" role="status" aria-live="polite">
                <div className="integration-warning-title">
                  Some integrations are unavailable. Codex can continue without them.
                </div>
                <div className="integration-warning-list">
                  {integrationWarnings.map((warning) => (
                    <div key={warning.id} className="integration-warning-item">
                      {warning.message}
                    </div>
                  ))}
                </div>
              </div>
            ) : null}
            {shell.activeInfoCategory === 'session' ? (
              <>
                <div className="info-grid">
                  <div className="info-section">
                    <div className="info-section-title">Account</div>
                    <div className="account-info">
                      <div className="account-email">{account.accountEmail}</div>
                      {account.accountPlan ? (
                        <div className="account-plan">{account.accountPlan}</div>
                      ) : null}
                      <div className="config-help">
                        Commentary is currently{' '}
                        <strong>{shell.showCommentary ? 'visible' : 'hidden'}</strong>.
                      </div>
                    </div>
                    {account.loggedIn ? (
                      <button
                        type="button"
                        className="btn-sm btn-outline"
                        style={{ marginTop: '8px' }}
                        onClick={actions.info.logout}
                      >
                        Sign Out
                      </button>
                    ) : (
                      <button
                        type="button"
                        className="btn-sm btn-primary"
                        style={{ marginTop: '8px' }}
                        onClick={actions.info.startLogin}
                      >
                        Sign In
                      </button>
                    )}
                    <button
                      type="button"
                      className="btn-sm btn-outline"
                      style={{ marginTop: '8px' }}
                      onClick={() => actions.info.loadAuthStatus()}
                    >
                      Auth Status
                    </button>
                    {account.authStatus.loading ? (
                      <div className="config-help">Loading auth status…</div>
                    ) : null}
                    {account.authStatus.error ? (
                      <div className="config-help">{account.authStatus.error}</div>
                    ) : null}
                    {account.authStatus.content ? (
                      <pre className="info-code-block">{account.authStatus.content}</pre>
                    ) : null}
                  </div>

                  <div
                    className="info-section"
                    id="info-section-models"
                    ref={modelsRef}
                    tabIndex={-1}
                  >
                    <div className="info-section-title">Models</div>
                    {chat.models.length === 0 ? (
                      <div className="empty-inline">No models are available.</div>
                    ) : (
                      chat.models.map((model, index) => (
                        <div
                          key={model.id || model.displayName || `model-${index}`}
                          className="info-card"
                        >
                          <div className="info-card-name">{model.displayName || model.id}</div>
                          <div className="info-card-sub">{model.id}</div>
                          {model.description ? (
                            <div className="info-card-sub">{model.description}</div>
                          ) : null}
                          <div className="info-card-meta">
                            {model.isDefault ? (
                              <span className="info-tag default">DEFAULT</span>
                            ) : null}
                            {model.hidden ? <span className="info-tag">HIDDEN</span> : null}
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              </>
            ) : null}

            {shell.activeInfoCategory === 'workspace' ? (
              <>
                <div className="info-grid">
                  <div className="info-section">
                    <div className="info-section-title">Workspace Overview</div>
                    <div className="stack-actions">
                      <button
                        type="button"
                        className="btn-sm btn-primary"
                        onClick={() => actions.info.loadSummary()}
                      >
                        Summary
                      </button>
                      <button
                        type="button"
                        className="btn-sm btn-outline"
                        onClick={() => actions.info.loadGitDiff()}
                      >
                        Git Diff
                      </button>
                      <button
                        type="button"
                        className="btn-sm btn-outline"
                        disabled={!hasBackendThreadId}
                        onClick={() => actions.info.startReview()}
                      >
                        Start Review
                      </button>
                    </div>
                    {info.workspaceSummary.loading ? (
                      <div className="config-help">Building summary…</div>
                    ) : null}
                    {info.workspaceSummary.error ? (
                      <div className="config-help">{info.workspaceSummary.error}</div>
                    ) : null}
                    {info.workspaceSummary.content ? (
                      <pre className="info-code-block">{info.workspaceSummary.content}</pre>
                    ) : null}
                    {info.gitDiff.loading ? (
                      <div className="config-help">Loading git diff…</div>
                    ) : null}
                    {info.gitDiff.error ? (
                      <div className="config-help">{info.gitDiff.error}</div>
                    ) : null}
                    {info.gitDiff.content ? (
                      <pre className="info-code-block">{info.gitDiff.content}</pre>
                    ) : null}
                    {thread.review.reviewThreadId ? (
                      <div className="info-tag active">
                        Review thread: {thread.review.reviewThreadId}
                      </div>
                    ) : null}
                    {thread.review.error ? (
                      <div className="config-help">{thread.review.error}</div>
                    ) : null}
                  </div>

                  <div className="info-section" id="info-section-apps" ref={appsRef} tabIndex={-1}>
                    <div className="info-section-title">Apps</div>
                    {appsAvailabilityHint ? (
                      <div className="config-help" style={{ marginBottom: '10px' }}>
                        {appsAvailabilityHint}
                      </div>
                    ) : null}
                    <div className="stack-actions" style={{ marginBottom: '10px' }}>
                      <button
                        type="button"
                        className="btn-sm btn-outline"
                        onClick={() => actions.info.loadApps(true)}
                        disabled={info.appsLoading}
                      >
                        {info.appsLoading ? 'Loading Apps…' : 'Retry Apps'}
                      </button>
                    </div>
                    {appsPendingMessage ? (
                      <div className="config-help">{appsPendingMessage}</div>
                    ) : null}
                    {info.appsError && !appsAvailabilityHint ? (
                      <div className="config-help">{info.appsError}</div>
                    ) : null}
                    {showAppsEmptyState ? (
                      <div className="empty-inline">The app list is empty.</div>
                    ) : info.apps.length > 0 ? (
                      info.apps.map((app, index) => (
                        <div key={app.id || app.name || `app-${index}`} className="info-card">
                          <div className="info-card-name">{app.name}</div>
                          <div className="info-card-sub">{app.description || app.id}</div>
                          <div className="info-card-meta">
                            {app.connected ? (
                              <span className="info-tag active">CONNECTED</span>
                            ) : null}
                            {app.enabled ? (
                              <span className="info-tag active">ENABLED</span>
                            ) : (
                              <span className="info-tag">DISABLED</span>
                            )}
                            {app.version ? <span className="info-tag">{app.version}</span> : null}
                          </div>
                        </div>
                      ))
                    ) : null}
                  </div>
                </div>

                <div className="info-section">
                  <div className="info-section-title">Fuzzy File Search</div>
                  <div className="stack-actions search-row">
                    <input
                      className="search-inline"
                      type="text"
                      value={searchQuery}
                      onChange={(event) => setSearchQuery(event.target.value)}
                      placeholder="Search for a file or path"
                    />
                    <button
                      type="button"
                      className="btn-sm btn-primary"
                      onClick={() => actions.info.runFuzzySearch(searchQuery)}
                    >
                      Search
                    </button>
                  </div>
                  {info.fuzzySearch.loading ? <div className="config-help">Searching…</div> : null}
                  {info.fuzzySearch.error ? (
                    <div className="config-help">{info.fuzzySearch.error}</div>
                  ) : null}
                  <div className="search-results">
                    {info.fuzzySearch.results.map((result) => (
                      <button
                        key={`${result.path}-${result.score ?? 'na'}`}
                        type="button"
                        className="search-result-card"
                        onClick={() => actions.info.openFuzzyResult(result.path)}
                      >
                        <strong>{result.path}</strong>
                        {typeof result.score === 'number' ? (
                          <span>score: {result.score.toFixed(2)}</span>
                        ) : null}
                        {result.preview ? <span>{result.preview}</span> : null}
                      </button>
                    ))}
                  </div>
                </div>
              </>
            ) : null}

            {shell.activeInfoCategory === 'integrations' ? (
              <>
                <div className="info-grid">
                  <div className="info-section" id="info-section-mcp" ref={mcpRef} tabIndex={-1}>
                    <div className="info-section-title">MCP Servers</div>
                    {info.infoMcpServers.length === 0 ? (
                      <div className="empty-inline">No MCP servers are visible.</div>
                    ) : (
                      info.infoMcpServers.map((server, index) => (
                        <div
                          key={`${server.id || server.name || 'mcp'}-${index}`}
                          className="mcp-item"
                        >
                          <div className={`mcp-dot ${getMcpStatusClass(server.status)}`} />
                          <div className="mcp-name">{server.name || server.id}</div>
                          <div className="mcp-status">{server.status || 'unknown'}</div>
                        </div>
                      ))
                    )}
                    <button
                      type="button"
                      className="btn-sm btn-outline"
                      style={{ marginTop: '6px' }}
                      onClick={actions.info.reloadMcp}
                    >
                      ↻ Reload MCP
                    </button>
                  </div>

                  <div className="info-section">
                    <div className="info-section-title">External Agents</div>
                    <div className="stack-actions">
                      <button
                        type="button"
                        className="btn-sm btn-primary"
                        onClick={() => actions.info.detectExternalAgents()}
                      >
                        Detect
                      </button>
                      <button
                        type="button"
                        className="btn-sm btn-outline"
                        onClick={() => actions.info.importExternalAgents()}
                      >
                        Import
                      </button>
                    </div>
                    {info.externalAgents.loading ? (
                      <div className="config-help">Scanning configuration…</div>
                    ) : null}
                    {info.externalAgents.error ? (
                      <div className="config-help">{info.externalAgents.error}</div>
                    ) : null}
                    {info.externalAgents.importedCount ? (
                      <div className="info-tag active">
                        Imported {info.externalAgents.importedCount} entries
                      </div>
                    ) : null}
                    <pre className="info-code-block">
                      {JSON.stringify(info.externalAgents.items, null, 2)}
                    </pre>
                  </div>
                </div>

                <div className="info-grid">
                  <div
                    className="info-section"
                    id="info-section-plugins"
                    ref={pluginsRef}
                    tabIndex={-1}
                  >
                    <div className="info-section-title">Plugins</div>
                    {info.plugins.length === 0 ? (
                      <div className="empty-inline">No plugins found.</div>
                    ) : (
                      info.plugins.map((plugin, index) => {
                        const pluginId = plugin.id || plugin.name || `plugin-${index}`;
                        const installed = plugin.installed !== false;
                        const enabled = installed && plugin.enabled !== false;
                        return (
                          <div key={pluginId} className="info-card">
                            <div className="info-card-name">{plugin.name || pluginId}</div>
                            <div className="info-card-sub">
                              {[plugin.marketplaceName, plugin.description]
                                .filter(Boolean)
                                .join(' · ')}
                            </div>
                            <div className="info-card-meta">
                              <span className={`info-tag${enabled ? ' active' : ''}`}>
                                {installed ? (enabled ? 'INSTALLED' : 'DISABLED') : 'AVAILABLE'}
                              </span>
                            </div>
                            <div className="stack-actions">
                              <button
                                type="button"
                                className={`btn-sm ${installed ? 'btn-outline' : 'btn-primary'}`}
                                onClick={() =>
                                  installed
                                    ? actions.info.removePlugin(pluginId)
                                    : actions.info.installPlugin(pluginId)
                                }
                              >
                                {installed ? 'Uninstall' : 'Install'}
                              </button>
                              <button
                                type="button"
                                className="btn-sm btn-outline"
                                onClick={() => actions.info.loadPluginDetail(pluginId)}
                              >
                                Details
                              </button>
                            </div>
                          </div>
                        );
                      })
                    )}
                  </div>

                  <div className="info-section">
                    <div className="info-section-title">Plugin Detail</div>
                    {info.pluginDetail ? (
                      <div className="info-card">
                        <div className="info-card-name">{info.pluginDetail.name}</div>
                        <div className="info-card-sub">{info.pluginDetail.description}</div>
                        {info.pluginDetail.apps.length ? (
                          <div className="capability-list">
                            {info.pluginDetail.apps.map((app, index) => (
                              <span
                                key={app.id || app.name || `plugin-app-${index}`}
                                className="info-tag"
                              >
                                {app.name}
                              </span>
                            ))}
                          </div>
                        ) : null}
                        {info.pluginDetail.mcpServers.length ? (
                          <pre className="info-code-block">
                            {info.pluginDetail.mcpServers.join('\n')}
                          </pre>
                        ) : null}
                      </div>
                    ) : (
                      <div className="empty-inline">
                        Plugin details will appear here after you select one.
                      </div>
                    )}
                  </div>
                </div>
              </>
            ) : null}

            {shell.activeInfoCategory === 'settings' ? (
              <>
                <div className="info-grid">
                  <div className="info-section">
                    <div className="info-section-title">Skills Guide</div>
                    <div className="info-card">
                      <div className="info-card-name">How skills work in Codex</div>
                      <div className="info-card-sub">
                        Skills package instructions, optional resources, and helper scripts so Codex
                        can apply repeatable workflows in the app, CLI, and IDE extension.
                      </div>
                      <div className="capability-list">
                        <span className="info-tag active">SKILL.md</span>
                        <span className="info-tag">scripts/</span>
                        <span className="info-tag">references/</span>
                        <span className="info-tag">assets/</span>
                      </div>
                      <pre className="info-code-block">{`my-skill/
├── SKILL.md
├── scripts/
├── references/
└── assets/`}</pre>
                    </div>
                    <div className="info-card">
                      <div className="info-card-name">Usage model</div>
                      <div className="info-card-sub">
                        Codex can use a skill when you explicitly ask for it, or automatically when
                        the task matches the skill description.
                      </div>
                      <div className="capability-list">
                        <span className="info-tag active">Explicit invocation</span>
                        <span className="info-tag active">Automatic matching</span>
                        <span className="info-tag">Shared across app / CLI / IDE</span>
                      </div>
                    </div>
                  </div>

                  <div
                    className="info-section"
                    id="info-section-skills"
                    ref={skillsRef}
                    tabIndex={-1}
                  >
                    <div className="info-section-title">Skills</div>
                    <div className="config-help" style={{ marginBottom: '10px' }}>
                      Toggle the skills currently available to this Codex environment.
                    </div>
                    {info.skills.length === 0 ? (
                      <div className="empty-inline">No skills found.</div>
                    ) : (
                      info.skills.map((skill, index) => {
                        const skillId = skill.id || skill.name || `skill-${index}`;
                        const enabled = skill.enabled !== false;
                        return (
                          <div key={skillId} className="info-card">
                            <div className="info-card-name">{skill.name || skillId}</div>
                            <div className="info-card-sub">
                              {skill.description || 'No description available.'}
                            </div>
                            <label className="toggle-row">
                              <input
                                type="checkbox"
                                checked={enabled}
                                onChange={(event) =>
                                  actions.info.setSkillEnabled(
                                    skillId,
                                    skill.name,
                                    event.target.checked,
                                  )
                                }
                              />
                              <span>{enabled ? 'Enabled' : 'Disabled'}</span>
                            </label>
                          </div>
                        );
                      })
                    )}
                  </div>

                  <div className="info-section">
                    <div className="info-section-title">Experimental</div>
                    {info.experimentalFeatures.length === 0 ? (
                      <div className="empty-inline">No experimental features are available.</div>
                    ) : (
                      <>
                        <div className="config-help" style={{ marginBottom: '10px' }}>
                          Documented feature flags can be toggled here. Backend-only or structured
                          feature entries are shown separately to avoid writing invalid config
                          shapes.
                        </div>
                        {documentedExperimentalFeatures.length > 0 ? (
                          <>
                            <div className="info-card-name" style={{ marginBottom: '8px' }}>
                              Documented config flags
                            </div>
                            {documentedExperimentalFeatures.map((feature, index) => {
                              const featureKey = getExperimentalFeatureKey(feature, index);
                              const toggleValue = feature.enabled ?? feature.value;
                              const isBooleanFeature = typeof toggleValue === 'boolean';
                              const enabled = isBooleanFeature ? toggleValue : false;
                              const featureName = getExperimentalFeatureDisplayName(
                                feature,
                                featureKey,
                              );
                              return (
                                <div key={featureKey} className="info-card">
                                  <div className="info-card-name">{featureName}</div>
                                  <div className="info-card-sub">
                                    {feature.description || 'Experimental feature'}
                                  </div>
                                  <div className="info-card-meta">
                                    {feature.stage ? (
                                      <span className="info-tag">
                                        {feature.stage.toUpperCase()}
                                      </span>
                                    ) : null}
                                    {typeof feature.defaultEnabled === 'boolean' ? (
                                      <span className="info-tag">
                                        Default {feature.defaultEnabled ? 'ON' : 'OFF'}
                                      </span>
                                    ) : null}
                                    <span className="info-tag">features.{featureKey}</span>
                                  </div>
                                  {isBooleanFeature ? (
                                    <label className="toggle-row">
                                      <input
                                        type="checkbox"
                                        checked={enabled}
                                        onChange={(event) =>
                                          actions.info.setExperimentalFeatureEnabled(
                                            featureKey,
                                            event.target.checked,
                                          )
                                        }
                                      />
                                      <span>{enabled ? 'On' : 'Off'}</span>
                                    </label>
                                  ) : (
                                    <>
                                      <div className="info-card-meta">
                                        <span className="info-tag">STRUCTURED CONFIG</span>
                                      </div>
                                      <div className="config-help">
                                        This setting uses a structured value and should be edited
                                        from the Config panel instead of a simple toggle.
                                      </div>
                                    </>
                                  )}
                                </div>
                              );
                            })}
                          </>
                        ) : null}
                        {backendOnlyExperimentalFeatures.length > 0 ? (
                          <>
                            <div
                              className="info-card-name"
                              style={{
                                marginTop: documentedExperimentalFeatures.length ? '14px' : 0,
                              }}
                            >
                              Backend-only entries
                            </div>
                            <div className="config-help" style={{ marginBottom: '8px' }}>
                              These entries came from the backend feature list but are not currently
                              in the public config reference. Treat them as informational unless you
                              have a specific rollout note for them.
                            </div>
                            {backendOnlyExperimentalFeatures.map((feature, index) => {
                              const featureKey = getExperimentalFeatureKey(feature, index);
                              const featureName = getExperimentalFeatureDisplayName(
                                feature,
                                featureKey,
                              );
                              return (
                                <div key={featureKey} className="info-card">
                                  <div className="info-card-name">{featureName}</div>
                                  <div className="info-card-sub">
                                    {feature.description || 'Backend-discovered feature entry'}
                                  </div>
                                  <div className="info-card-meta">
                                    <span className="info-tag">BACKEND ONLY</span>
                                    <span className="info-tag">{featureKey}</span>
                                    {feature.stage ? (
                                      <span className="info-tag">
                                        {feature.stage.toUpperCase()}
                                      </span>
                                    ) : null}
                                  </div>
                                </div>
                              );
                            })}
                          </>
                        ) : null}
                      </>
                    )}
                  </div>
                </div>

                <div className="info-section">
                  <div className="info-section-title">Coverage Snapshot</div>
                  <div className="metrics-grid">
                    <div className="metric-card">
                      <span className="metric-label">Requests</span>
                      <strong>
                        {info.protocolCoverage.requests.implemented}/
                        {info.protocolCoverage.requests.total}
                      </strong>
                    </div>
                    <div className="metric-card">
                      <span className="metric-label">Notifications</span>
                      <strong>
                        {info.protocolCoverage.notifications.implemented}/
                        {info.protocolCoverage.notifications.total}
                      </strong>
                    </div>
                    <div className="metric-card">
                      <span className="metric-label">Server Requests</span>
                      <strong>
                        {info.protocolCoverage.serverRequests.implemented}/
                        {info.protocolCoverage.serverRequests.total}
                      </strong>
                    </div>
                  </div>
                </div>

                <div className="info-section">
                  <div className="info-section-title">Runtime Logs</div>
                  <div className="info-card">
                    <div className="info-card-name">Live browser/runtime log stream</div>
                    <div className="info-card-sub">
                      Captures client-side Codex UI and runtime events. Server logs still flow to
                      the terminal via <code>CODEX_LOG_LEVEL</code>.
                    </div>
                    <div
                      className="stack-actions"
                      style={{ marginTop: '10px', marginBottom: '10px' }}
                    >
                      <select
                        className="config-value"
                        style={{ maxWidth: '180px' }}
                        value={logFilter}
                        onChange={(event) => setLogFilter(event.target.value as LogLevel)}
                      >
                        <option value="trace">Trace+</option>
                        <option value="debug">Debug+</option>
                        <option value="info">Info+</option>
                        <option value="warn">Warn+</option>
                        <option value="error">Error only</option>
                      </select>
                      <button
                        type="button"
                        className="btn-sm btn-outline"
                        onClick={() => clearBrowserLogs()}
                      >
                        Clear logs
                      </button>
                    </div>
                    {filteredLogs.length === 0 ? (
                      <div className="empty-inline">No logs at this level yet.</div>
                    ) : (
                      <div className="runtime-log-list">
                        {filteredLogs.map((entry) => (
                          <div key={entry.id} className={`runtime-log-entry level-${entry.level}`}>
                            <div className="runtime-log-head">
                              <span className={`runtime-log-level level-${entry.level}`}>
                                {entry.level.toUpperCase()}
                              </span>
                              <span className="runtime-log-scope">{entry.scope}</span>
                              <span className="runtime-log-time">{entry.timestamp}</span>
                            </div>
                            <div className="runtime-log-message">{entry.message}</div>
                            {entry.details.length ? (
                              <pre className="runtime-log-details">
                                {entry.details.join('\n\n')}
                              </pre>
                            ) : null}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              </>
            ) : null}
          </>
        )}
      </div>
    </div>
  );
}
