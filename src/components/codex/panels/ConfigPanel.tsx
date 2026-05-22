'use client';

import { memo, useCallback, useEffect, useMemo, useState } from 'react';
import { Skeleton } from '../../ui';
import {
  useChatState,
  useConfigState,
  useControlCenterActions,
  useShellState,
} from '../ControlCenterContext';
import {
  applyConfigDraftChange,
  buildConfigFieldSections,
  buildConfigSavePayload,
  buildDescriptorMap,
  buildInitialConfigDraftState,
  countDirtyConfigFields,
  type ConfigFieldDescriptor,
  type ConfigDraftValue,
  reconcileConfigDraftState,
} from './config-panel-state';

type ConfigValueFieldProps = {
  descriptor: ConfigFieldDescriptor;
  draftValue: ConfigDraftValue;
  error?: string;
  onDraftChange: (key: string, value: ConfigDraftValue) => void;
};

function ConfigValueField({ descriptor, draftValue, error, onDraftChange }: ConfigValueFieldProps) {
  const { configKey, meta } = descriptor;

  if (meta.type === 'boolean') {
    return (
      <>
        <input
          className="config-checkbox"
          type="checkbox"
          name={`config-${configKey}`}
          autoComplete="off"
          checked={Boolean(draftValue)}
          onChange={(event) => onDraftChange(configKey, event.target.checked)}
        />
        {error ? <div className="config-field-error">{error}</div> : null}
      </>
    );
  }

  if (meta.type === 'json') {
    return (
      <>
        <textarea
          className={`config-value${error ? ' has-error' : ''}`}
          name={`config-${configKey}`}
          value={String(draftValue)}
          rows={3}
          autoComplete="off"
          autoCorrect="off"
          autoCapitalize="none"
          spellCheck={false}
          onChange={(event) => onDraftChange(configKey, event.target.value)}
        />
        {error ? <div className="config-field-error">{error}</div> : null}
      </>
    );
  }

  if (meta.type === 'select') {
    return (
      <>
        <select
          className={`config-value${error ? ' has-error' : ''}`}
          name={`config-${configKey}`}
          autoComplete="off"
          value={String(draftValue ?? '')}
          onChange={(event) => onDraftChange(configKey, event.target.value)}
        >
          <option value="">— select —</option>
          {meta.options?.map((option) => {
            const optionValue = typeof option === 'string' ? option : option.value;
            const optionLabel = typeof option === 'string' ? option : option.label;
            return (
              <option key={optionValue} value={optionValue}>
                {optionLabel}
              </option>
            );
          })}
        </select>
        {error ? <div className="config-field-error">{error}</div> : null}
      </>
    );
  }

  return (
    <>
      <input
        className={`config-value${error ? ' has-error' : ''}`}
        type={meta.type === 'number' ? 'number' : 'text'}
        name={`config-${configKey}`}
        value={String(draftValue)}
        autoComplete="off"
        autoCorrect="off"
        autoCapitalize="none"
        spellCheck={false}
        onChange={(event) => onDraftChange(configKey, event.target.value)}
      />
      {error ? <div className="config-field-error">{error}</div> : null}
    </>
  );
}

const MemoConfigValueField = memo(ConfigValueField);

type ConfigRowProps = {
  descriptor: ConfigFieldDescriptor;
  draftValue: ConfigDraftValue;
  error?: string;
  isDirty: boolean;
  onDraftChange: (key: string, value: ConfigDraftValue) => void;
};

const ConfigRow = memo(function ConfigRow({
  descriptor,
  draftValue,
  error,
  isDirty,
  onDraftChange,
}: ConfigRowProps) {
  return (
    <div className={`config-row${isDirty ? ' is-dirty' : ''}`}>
      <div className="config-key">
        <div className="config-label">
          {descriptor.meta.label}
          {isDirty ? <span className="config-dirty-indicator">Unsaved</span> : null}
        </div>
        {descriptor.meta.help ? <div className="config-help">{descriptor.meta.help}</div> : null}
      </div>
      <div className="config-value-wrap">
        <MemoConfigValueField
          descriptor={descriptor}
          draftValue={draftValue}
          error={error}
          onDraftChange={onDraftChange}
        />
      </div>
    </div>
  );
});

export function JsonCard({ title, content }: { title: string; content: string }) {
  return (
    <div className="info-card">
      <div className="info-card-name">{title}</div>
      <pre className="info-code-block">{content}</pre>
    </div>
  );
}

export function ConfigPanel() {
  const chat = useChatState();
  const config = useConfigState();
  const actions = useControlCenterActions();
  const shell = useShellState();
  const integrationWarnings = config.integrationWarnings.filter(
    (warning) => warning.context === 'config',
  );
  const isInitialConfigLoading =
    shell.activeTab === 'config' && !config.configHydrated && !config.configError;
  const sections = useMemo(
    () => buildConfigFieldSections(config.configData, chat.models),
    [chat.models, config.configData],
  );
  const descriptorMap = useMemo(() => buildDescriptorMap(sections), [sections]);
  const [draftState, setDraftState] = useState(() => buildInitialConfigDraftState(sections));
  const [saveState, setSaveState] = useState<'idle' | 'saving'>('idle');

  useEffect(() => {
    if (!sections.length) {
      setDraftState(buildInitialConfigDraftState([]));
      return;
    }

    setDraftState((current) =>
      Object.keys(current.baselineDrafts).length
        ? reconcileConfigDraftState(current, sections)
        : buildInitialConfigDraftState(sections),
    );
  }, [sections]);

  const dirtyCount = useMemo(
    () => countDirtyConfigFields(draftState.dirtyMap),
    [draftState.dirtyMap],
  );
  const hasValidationErrors = Object.keys(draftState.validationErrors).length > 0;

  const handleDraftChange = useCallback(
    (configKey: string, nextValue: ConfigDraftValue) => {
      const descriptor = descriptorMap[configKey];
      if (!descriptor) return;
      setDraftState((current) => applyConfigDraftChange(current, descriptor, nextValue));
    },
    [descriptorMap],
  );

  const resetDrafts = useCallback(() => {
    setDraftState(buildInitialConfigDraftState(sections));
  }, [sections]);

  const saveDrafts = useCallback(async () => {
    if (!dirtyCount || hasValidationErrors) return;
    const values = buildConfigSavePayload(descriptorMap, draftState);

    setSaveState('saving');
    try {
      await actions.config.saveConfig(values);
    } finally {
      setSaveState('idle');
    }
  }, [actions.config, descriptorMap, dirtyCount, draftState, hasValidationErrors]);

  return (
    <div className={`panel${shell.activeTab === 'config' ? ' active' : ''}`} id="panel-config">
      <div id="config-panel">
        {config.configLoading || isInitialConfigLoading ? (
          <div className="loading">
            <Skeleton lines={4} />
            <div>Loading configuration…</div>
          </div>
        ) : config.configError ? (
          <div className="panel-error">Could not load config: {config.configError}</div>
        ) : (
          <>
            {integrationWarnings.length ? (
              <div className="integration-warning-card" role="status" aria-live="polite">
                <div className="integration-warning-title">
                  Some config integrations are unavailable. Core Codex features can still run.
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
            <div className="config-section">
              <div className="config-section-title">Config reference</div>
              <div className="backend-status-card">
                <div className="config-help">
                  Codex uses <code>config.toml</code>, not YAML. The official config reference also
                  supports live schema diagnostics in editors with:
                </div>
                <pre className="info-code-block">
                  {'#:schema https://developers.openai.com/codex/config-schema.json'}
                </pre>
              </div>
            </div>

            <div className="config-toolbar">
              <div className="config-toolbar-copy">
                <strong>
                  {dirtyCount ? `${dirtyCount} pending changes` : 'No pending changes'}
                </strong>
                <span>Fields no longer auto-save. Review your edits, then save them.</span>
              </div>
              <div className="config-toolbar-actions">
                <button
                  type="button"
                  className="btn-sm btn-outline"
                  disabled={!dirtyCount || saveState === 'saving'}
                  onClick={resetDrafts}
                >
                  Reset
                </button>
                <button
                  type="button"
                  className="btn-sm btn-primary"
                  disabled={!dirtyCount || hasValidationErrors || saveState === 'saving'}
                  onClick={() => void saveDrafts()}
                >
                  {saveState === 'saving' ? 'Saving…' : 'Save changes'}
                </button>
              </div>
            </div>

            <div className="config-section">
              <div className="config-section-title">Backend status</div>
              <div className="backend-status-card">
                <div className="backend-status-row">
                  <span>Target</span>
                  <code>{shell.connectionBanner.target}</code>
                </div>
                <div className="backend-status-row">
                  <span>Connection</span>
                  <span
                    className={`backend-status-pill ${config.connected ? 'online' : 'offline'}`}
                  >
                    {config.connected ? 'ONLINE' : 'OFFLINE'}
                  </span>
                </div>
                <button
                  type="button"
                  className="btn-sm btn-primary"
                  style={{ width: 'fit-content' }}
                  onClick={actions.config.reconnect}
                >
                  Reconnect
                </button>
              </div>
            </div>

            {sections.map(([sectionName, entries]) => (
              <div key={sectionName} className="config-section">
                <div className="config-section-title">{sectionName}</div>
                {entries.map((descriptor) => (
                  <ConfigRow
                    key={descriptor.configKey}
                    descriptor={descriptor}
                    draftValue={
                      draftState.drafts[descriptor.configKey] ?? descriptor.serializedValue
                    }
                    error={draftState.validationErrors[descriptor.configKey]}
                    isDirty={Boolean(draftState.dirtyMap[descriptor.configKey])}
                    onDraftChange={handleDraftChange}
                  />
                ))}
              </div>
            ))}

            <div className="config-grid">
              <div className="config-section">
                <div className="config-section-title">MCP servers</div>
                {config.configMcpServers.length === 0 ? (
                  <div className="config-help">No MCP servers are configured.</div>
                ) : (
                  config.configMcpServers.map((server, index) => (
                    <div
                      key={`${server.id || server.name || 'mcp'}-${index}`}
                      className="backend-status-card"
                    >
                      <div className="backend-status-row">
                        <span>{server.name || server.id || 'MCP'}</span>
                        <span>{server.status || 'unknown'}</span>
                      </div>
                      <div className="config-help">{server.command || server.url || ''}</div>
                    </div>
                  ))
                )}
                <button
                  type="button"
                  className="btn-sm btn-outline"
                  style={{ marginTop: '12px' }}
                  onClick={actions.config.reloadMcp}
                >
                  Reload MCP servers
                </button>
              </div>

              <div className="config-section">
                <div className="config-section-title">Config requirements</div>
                {config.configRequirements ? (
                  <JsonCard
                    title="Requirements"
                    content={JSON.stringify(config.configRequirements, null, 2)}
                  />
                ) : (
                  <div className="config-help">
                    This can stay empty when the server does not support `configRequirements/read`.
                  </div>
                )}
              </div>
            </div>

            <div className="config-grid">
              <div className="config-section">
                <div className="config-section-title">Protocol coverage</div>
                <div className="metrics-grid">
                  <div className="metric-card">
                    <span className="metric-label">Requests</span>
                    <strong>
                      {config.protocolCoverage.requests.implemented}/
                      {config.protocolCoverage.requests.total}
                    </strong>
                  </div>
                  <div className="metric-card">
                    <span className="metric-label">Notifications</span>
                    <strong>
                      {config.protocolCoverage.notifications.implemented}/
                      {config.protocolCoverage.notifications.total}
                    </strong>
                  </div>
                  <div className="metric-card">
                    <span className="metric-label">Server Requests</span>
                    <strong>
                      {config.protocolCoverage.serverRequests.implemented}/
                      {config.protocolCoverage.serverRequests.total}
                    </strong>
                  </div>
                </div>
              </div>

              <div className="config-section">
                <div className="config-section-title">Capability support</div>
                <div className="capability-list">
                  {Object.entries(config.capabilities.requests)
                    .filter(([, status]) => status !== 'unknown')
                    .slice(0, 8)
                    .map(([method, status]) => (
                      <span
                        key={method}
                        className={`info-tag ${status === 'supported' ? 'active' : ''}`}
                      >
                        {status === 'supported' ? '✓' : '!'} {method}
                      </span>
                    ))}
                </div>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
