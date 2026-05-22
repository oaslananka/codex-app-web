import { getErrorTelemetry, isInitializationPendingError, normalizeError } from '../errors';
import { normalizeCollaborationModes, sanitizeCollaborationMode } from '../collaboration';
import { createBrowserLogger } from '../../logging/browser-logger';
import { sanitizeSelectedEffort } from '../reasoning';
import {
  normalizeApps,
  normalizeExperimentalFeatures,
  normalizeMcpServers,
  normalizeModelList,
  normalizePluginDetail,
  normalizePluginList,
  normalizeSkills,
} from '../normalizers';
import type { RuntimeStore } from '../store';
import type {
  IntegrationWarning,
  IntegrationWarningContext,
  IntegrationWarningSource,
} from '../types';

const logger = createBrowserLogger('runtime:features');
const APPS_RETRY_COOLDOWN_MS = 10_000;

type ServiceDeps = {
  requestCompat: <T = unknown>(
    canonicalMethod: string,
    params?: unknown,
    fallbacks?: readonly string[],
  ) => Promise<T>;
  markRequestSupported(method: string): void;
  markRequestUnsupported(method: string): void;
  toast(message: string, type?: 'info' | 'success' | 'error'): void;
};

export class FeatureService {
  private appsRetryCooldownUntil = 0;

  constructor(
    private readonly store: RuntimeStore,
    private readonly deps: ServiceDeps,
  ) {}

  private patchIntegrationWarnings(
    context: IntegrationWarningContext,
    warnings: IntegrationWarning[],
  ) {
    const currentWarnings = this.store.getState().integrationWarnings;
    this.store.patch({
      integrationWarnings: [
        ...currentWarnings.filter((warning) => warning.context !== context),
        ...warnings,
      ],
    });
  }

  private patchInfoWarnings(warnings: IntegrationWarning[]) {
    const currentWarnings = this.store.getState().integrationWarnings;
    const retainedAppsWarning = currentWarnings.find(
      (warning) => warning.context === 'info' && warning.source === 'apps',
    );
    const nextWarnings = retainedAppsWarning
      ? [...warnings.filter((warning) => warning.source !== 'apps'), retainedAppsWarning]
      : warnings;
    this.patchIntegrationWarnings('info', nextWarnings);
  }

  private patchSourceWarning(
    context: IntegrationWarningContext,
    source: IntegrationWarningSource,
    warning: IntegrationWarning | null,
  ) {
    const currentWarnings = this.store.getState().integrationWarnings;
    this.store.patch({
      integrationWarnings: [
        ...currentWarnings.filter(
          (entry) => !(entry.context === context && entry.source === source),
        ),
        ...(warning ? [warning] : []),
      ],
    });
  }

  private createWarning(
    context: IntegrationWarningContext,
    source: IntegrationWarningSource,
    idSuffix: string,
    label: string,
    reason: unknown,
  ): IntegrationWarning | null {
    if (isInitializationPendingError(reason)) {
      return null;
    }

    return {
      id: `${context}:${idSuffix}`,
      context,
      source,
      message: `${label} unavailable: ${normalizeError(reason)}`,
    };
  }

  private async refreshAppsIfHydrated() {
    if (this.store.getState().appsHydrated) {
      await this.loadApps(true);
    }
  }

  async loadModels() {
    try {
      const response = await this.deps.requestCompat('model/list', {});
      const models = normalizeModelList(response);
      const state = this.store.getState();
      this.store.patch({
        models,
        selectedEffort: sanitizeSelectedEffort(models, state.selectedModel, state.selectedEffort),
        selectedServiceTier:
          state.selectedServiceTier ||
          (typeof state.configData?.service_tier === 'string' ? state.configData.service_tier : ''),
        selectedSandboxMode:
          state.selectedSandboxMode ||
          (typeof state.configData?.sandbox_mode === 'string' ? state.configData.sandbox_mode : ''),
      });
      this.deps.markRequestSupported('model/list');
    } catch (error) {
      if (isInitializationPendingError(error)) {
        return;
      }
      this.deps.markRequestUnsupported('model/list');
    }
  }

  async loadConfig() {
    this.store.patch({ configLoading: true, configError: '' });
    try {
      const [config, mcpStatus, configRequirements] = await Promise.allSettled([
        this.deps.requestCompat('config/read', {}),
        this.deps.requestCompat('mcpServerStatus/list', {}),
        this.deps.requestCompat('configRequirements/read', {}),
      ]);
      const hasConfigPayload =
        config.status === 'fulfilled' ||
        mcpStatus.status === 'fulfilled' ||
        configRequirements.status === 'fulfilled';
      const warnings = [
        config.status === 'rejected'
          ? this.createWarning('config', 'config', 'config-read', 'Config', config.reason)
          : null,
        mcpStatus.status === 'rejected'
          ? this.createWarning('config', 'mcp', 'mcp-status', 'MCP server status', mcpStatus.reason)
          : null,
        configRequirements.status === 'rejected'
          ? this.createWarning(
              'config',
              'config',
              'config-requirements',
              'Config requirements',
              configRequirements.reason,
            )
          : null,
      ].filter((warning): warning is IntegrationWarning => Boolean(warning));

      this.store.patch({
        configHydrated: hasConfigPayload,
        configLoading: false,
        configData:
          config.status === 'fulfilled'
            ? (((config.value as Record<string, unknown>).config ?? {}) as Record<string, unknown>)
            : {},
        configMcpServers:
          mcpStatus.status === 'fulfilled' ? normalizeMcpServers(mcpStatus.value) : [],
        configRequirements:
          configRequirements.status === 'fulfilled'
            ? (((configRequirements.value as Record<string, unknown>).requirements ??
                null) as Record<string, unknown> | null)
            : null,
        selectedServiceTier:
          !this.store.getState().activeThreadId &&
          config.status === 'fulfilled' &&
          typeof (
            (config.value as Record<string, unknown>).config as Record<string, unknown> | undefined
          )?.service_tier === 'string'
            ? String(
                ((config.value as Record<string, unknown>).config as Record<string, unknown>)
                  .service_tier,
              )
            : this.store.getState().selectedServiceTier,
        selectedSandboxMode:
          !this.store.getState().activeThreadId &&
          config.status === 'fulfilled' &&
          typeof (
            (config.value as Record<string, unknown>).config as Record<string, unknown> | undefined
          )?.sandbox_mode === 'string'
            ? String(
                ((config.value as Record<string, unknown>).config as Record<string, unknown>)
                  .sandbox_mode,
              )
            : this.store.getState().selectedSandboxMode,
      });
      this.patchIntegrationWarnings('config', warnings);

      if (config.status === 'fulfilled') {
        this.deps.markRequestSupported('config/read');
      } else {
        this.deps.markRequestUnsupported('config/read');
      }
      if (mcpStatus.status === 'fulfilled') {
        this.deps.markRequestSupported('mcpServerStatus/list');
      } else {
        this.deps.markRequestUnsupported('mcpServerStatus/list');
      }
      if (configRequirements.status === 'fulfilled') {
        this.deps.markRequestSupported('configRequirements/read');
      } else {
        this.deps.markRequestUnsupported('configRequirements/read');
      }
    } catch (error) {
      if (isInitializationPendingError(error)) {
        this.store.patch({
          configHydrated: false,
          configLoading: false,
          configError: '',
        });
        this.patchIntegrationWarnings('config', []);
        return;
      }
      this.deps.markRequestUnsupported('config/read');
      this.store.patch({
        configHydrated: false,
        configLoading: false,
        configError: normalizeError(error),
      });
      this.patchIntegrationWarnings('config', [
        {
          id: 'config:config',
          context: 'config',
          source: 'config',
          message: `Config unavailable: ${normalizeError(error)}`,
        },
      ]);
    }
  }

  async loadInfo() {
    this.store.patch({ infoLoading: true, infoError: '' });
    const [mcpStatus, skills, features, plugins, collaborationModes] = await Promise.allSettled([
      this.deps.requestCompat('mcpServerStatus/list', {}),
      this.deps.requestCompat('skills/list', {}),
      this.deps.requestCompat('experimentalFeature/list', {}),
      this.deps.requestCompat('plugin/list', {}),
      this.deps.requestCompat('collaborationMode/list', {}),
    ]);

    const allRejected = [mcpStatus, skills, features, plugins, collaborationModes].every(
      (result) => result.status === 'rejected',
    );
    const initializationPending = [mcpStatus, skills, features, plugins, collaborationModes].some(
      (result) => result.status === 'rejected' && isInitializationPendingError(result.reason),
    );
    const hasInfoPayload = [mcpStatus, skills, features, plugins, collaborationModes].some(
      (result) => result.status === 'fulfilled',
    );
    const warnings = [
      mcpStatus.status === 'rejected'
        ? this.createWarning('info', 'mcp', 'mcp-servers', 'MCP servers', mcpStatus.reason)
        : null,
      skills.status === 'rejected'
        ? this.createWarning('info', 'skills', 'skills', 'Skills', skills.reason)
        : null,
      features.status === 'rejected'
        ? this.createWarning(
            'info',
            'features',
            'experimental-features',
            'Experimental features',
            features.reason,
          )
        : null,
      plugins.status === 'rejected'
        ? this.createWarning('info', 'plugins', 'plugins', 'Plugins', plugins.reason)
        : null,
      collaborationModes.status === 'rejected'
        ? this.createWarning(
            'info',
            'features',
            'collaboration-modes',
            'Collaboration modes',
            collaborationModes.reason,
          )
        : null,
    ].filter((warning): warning is IntegrationWarning => Boolean(warning));

    const nextModes =
      collaborationModes.status === 'fulfilled'
        ? normalizeCollaborationModes(collaborationModes.value)
        : normalizeCollaborationModes(null);
    const currentState = this.store.getState();

    this.store.patch({
      infoHydrated: hasInfoPayload,
      infoLoading: false,
      infoMcpServers: mcpStatus.status === 'fulfilled' ? normalizeMcpServers(mcpStatus.value) : [],
      skills: skills.status === 'fulfilled' ? normalizeSkills(skills.value) : [],
      experimentalFeatures:
        features.status === 'fulfilled' ? normalizeExperimentalFeatures(features.value) : [],
      plugins: plugins.status === 'fulfilled' ? normalizePluginList(plugins.value) : [],
      collaborationModes: nextModes,
      collaborationMode: sanitizeCollaborationMode(nextModes, currentState.collaborationMode),
      infoError: allRejected && !initializationPending ? 'Failed to load info panels' : '',
    });
    this.patchInfoWarnings(warnings);

    if (mcpStatus.status === 'fulfilled') {
      this.deps.markRequestSupported('mcpServerStatus/list');
    } else {
      this.deps.markRequestUnsupported('mcpServerStatus/list');
    }
    if (skills.status === 'fulfilled') {
      this.deps.markRequestSupported('skills/list');
    } else {
      this.deps.markRequestUnsupported('skills/list');
    }
    if (features.status === 'fulfilled') {
      this.deps.markRequestSupported('experimentalFeature/list');
    } else {
      this.deps.markRequestUnsupported('experimentalFeature/list');
    }
    if (plugins.status === 'fulfilled') {
      this.deps.markRequestSupported('plugin/list');
    } else {
      this.deps.markRequestUnsupported('plugin/list');
    }
    if (collaborationModes.status === 'fulfilled') {
      this.deps.markRequestSupported('collaborationMode/list');
    } else {
      this.deps.markRequestUnsupported('collaborationMode/list');
    }
  }

  async loadApps(force = false) {
    const remainingCooldownMs = this.appsRetryCooldownUntil - Date.now();
    if (remainingCooldownMs > 0) {
      logger.info('Apps load skipped during cooldown', {
        force,
        remainingCooldownMs,
      });
      this.deps.toast(
        `Apps retry is cooling down for ${Math.ceil(remainingCooldownMs / 1000)}s.`,
        'info',
      );
      return;
    }

    this.store.patch((current) => ({
      appsLoading: true,
      appsError: '',
      appsHydrated: current.appsHydrated,
    }));

    try {
      const response = await this.deps.requestCompat(
        'app/list',
        force ? { forceRefetch: true } : {},
      );
      this.store.patch({
        apps: normalizeApps(response),
        appsHydrated: true,
        appsLoading: false,
        appsError: '',
      });
      this.appsRetryCooldownUntil = 0;
      this.patchSourceWarning('info', 'apps', null);
      this.deps.markRequestSupported('app/list');
    } catch (error) {
      const telemetry = getErrorTelemetry(error);
      const shouldCooldown = telemetry.isUpstreamAuthChallenge;
      this.appsRetryCooldownUntil = shouldCooldown ? Date.now() + APPS_RETRY_COOLDOWN_MS : 0;
      logger.warn('Apps load failed', {
        force,
        statusCode: telemetry.statusCode,
        isHtmlResponse: telemetry.isHtmlResponse,
        isUpstreamAuthChallenge: telemetry.isUpstreamAuthChallenge,
        mentionsAuthExpiry: telemetry.mentionsAuthExpiry,
        mentionsUpstreamBlock: telemetry.mentionsUpstreamBlock,
        cooldownMs: shouldCooldown ? APPS_RETRY_COOLDOWN_MS : 0,
        message: telemetry.normalizedMessage,
      });
      const warning = this.createWarning('info', 'apps', 'apps', 'Apps', error);
      this.store.patch({
        apps: [],
        appsHydrated: true,
        appsLoading: false,
        appsError: normalizeError(error),
      });
      this.patchSourceWarning('info', 'apps', warning);
      this.deps.markRequestUnsupported('app/list');
    }
  }

  async loadPluginDetail(pluginId: string) {
    const state = this.store.getState();
    const plugin = state.plugins.find((item) => item.id === pluginId || item.name === pluginId);
    if (!plugin?.marketplacePath || !plugin.name) {
      this.store.patch({ pluginDetail: null });
      return;
    }

    try {
      const response = await this.deps.requestCompat('plugin/read', {
        marketplacePath: plugin.marketplacePath,
        pluginName: plugin.name,
      });
      this.store.patch({ pluginDetail: normalizePluginDetail(response) });
      this.deps.markRequestSupported('plugin/read');
    } catch (error) {
      this.deps.markRequestUnsupported('plugin/read');
      this.deps.toast(`Plugin detail unavailable: ${normalizeError(error)}`, 'info');
    }
  }

  async installPlugin(pluginId: string) {
    const state = this.store.getState();
    const plugin = state.plugins.find((item) => item.id === pluginId || item.name === pluginId);
    try {
      if (plugin?.marketplacePath && plugin.name) {
        await this.deps.requestCompat('plugin/install', {
          marketplacePath: plugin.marketplacePath,
          pluginName: plugin.name,
        });
      } else {
        await this.deps.requestCompat('plugin/install', { id: pluginId });
      }
      this.deps.markRequestSupported('plugin/install');
      this.deps.toast('Plugin installed', 'success');
      await this.loadInfo();
      await this.refreshAppsIfHydrated();
    } catch (error) {
      this.deps.markRequestUnsupported('plugin/install');
      this.deps.toast(`Plugin install failed: ${normalizeError(error)}`, 'error');
    }
  }

  async uninstallPlugin(pluginId: string) {
    try {
      await this.deps.requestCompat('plugin/uninstall', { pluginId }, ['plugin/uninstall']);
      this.deps.markRequestSupported('plugin/uninstall');
      this.deps.toast('Plugin removed', 'info');
      await this.loadInfo();
      await this.refreshAppsIfHydrated();
    } catch (error) {
      this.deps.markRequestUnsupported('plugin/uninstall');
      this.deps.toast(`Plugin removal failed: ${normalizeError(error)}`, 'error');
    }
  }

  async setSkillEnabled(id: string, name: string | undefined, enabled: boolean) {
    try {
      await this.deps.requestCompat('skills/config/write', { id, name, enabled });
      this.deps.markRequestSupported('skills/config/write');
      this.deps.toast(`Skill ${name ?? id} updated`, 'success');
      await this.loadInfo();
    } catch (error) {
      this.deps.markRequestUnsupported('skills/config/write');
      this.deps.toast(`Skill update failed: ${normalizeError(error)}`, 'error');
    }
  }

  async setExperimentalFeatureEnabled(key: string, enabled: boolean) {
    try {
      await this.deps.requestCompat('config/value/write', {
        keyPath: key,
        value: enabled,
        mergeStrategy: 'replace',
      });
      this.deps.markRequestSupported('config/value/write');
      this.deps.toast(`${key} updated`, 'success');
      await Promise.all([this.loadConfig(), this.loadInfo()]);
    } catch (error) {
      this.deps.markRequestUnsupported('config/value/write');
      this.deps.toast(`Feature update failed: ${normalizeError(error)}`, 'error');
    }
  }

  async writeConfigValue(key: string, value: unknown) {
    try {
      await this.deps.requestCompat('config/value/write', {
        keyPath: key,
        value,
        mergeStrategy: 'replace',
      });
      this.deps.markRequestSupported('config/value/write');
      this.deps.toast('Config updated', 'success');
      await this.loadConfig();
    } catch (error) {
      this.deps.markRequestUnsupported('config/value/write');
      this.deps.toast(`Config update failed: ${normalizeError(error)}`, 'error');
    }
  }

  async batchWriteConfig(values: Record<string, unknown>) {
    const edits = Object.entries(values).map(([keyPath, value]) => ({
      keyPath,
      value,
      mergeStrategy: 'replace' as const,
    }));

    try {
      await this.deps.requestCompat('config/batchWrite', { edits });
      this.deps.markRequestSupported('config/batchWrite');
      await this.loadConfig();
      this.deps.toast('Config batch applied', 'success');
    } catch (error) {
      try {
        for (const edit of edits) {
          await this.deps.requestCompat('config/value/write', edit);
        }
        this.deps.markRequestSupported('config/value/write');
        await this.loadConfig();
        this.deps.toast('Config changes applied', 'success');
      } catch (fallbackError) {
        this.deps.markRequestUnsupported('config/batchWrite');
        this.deps.toast(`Batch config unavailable: ${normalizeError(error)}`, 'info');
        this.deps.toast(`Config update failed: ${normalizeError(fallbackError)}`, 'error');
      }
    }
  }

  async reloadMcpServers() {
    try {
      await this.deps.requestCompat('config/mcpServer/reload', {});
      this.deps.markRequestSupported('config/mcpServer/reload');
      await Promise.all([this.loadConfig(), this.loadInfo()]);
      this.deps.toast('MCP servers reloaded', 'success');
    } catch (error) {
      this.deps.toast(`MCP reload failed: ${normalizeError(error)}`, 'error');
    }
  }

  handleAppsUpdated() {
    if (this.store.getState().appsHydrated) {
      void this.loadApps(true);
    }
  }
}
