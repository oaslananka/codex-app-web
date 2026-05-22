import { describe, expect, it, vi } from 'vitest';
import { buildInitialState } from '../../src/lib/codex-runtime/runtime-state';
import { RuntimeStore } from '../../src/lib/codex-runtime/store';
import { FeatureService } from '../../src/lib/codex-runtime/services/feature-service';

type RequestCompat = <T = unknown>(
  canonicalMethod: string,
  params?: unknown,
  fallbacks?: readonly string[],
) => Promise<T>;

function createService(requestCompat: RequestCompat) {
  const store = new RuntimeStore(buildInitialState());
  const deps = {
    requestCompat,
    markRequestSupported: vi.fn(),
    markRequestUnsupported: vi.fn(),
    toast: vi.fn(),
  };
  const service = new FeatureService(store, deps);

  return { deps, store, service };
}

describe('FeatureService', () => {
  it('throttles repeated apps retries after an upstream auth/challenge failure', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-04-06T10:00:00Z'));

    const requestCompat = vi.fn(async () => {
      throw new Error(
        'Request failed with status 403 Forbidden: remote service returned an HTML challenge page instead of API JSON. This usually means auth expired or the request was blocked upstream.',
      );
    });
    const { deps, service } = createService(requestCompat as RequestCompat);

    await service.loadApps();
    await service.loadApps(true);

    expect(requestCompat).toHaveBeenCalledTimes(1);
    expect(deps.toast).toHaveBeenCalledWith('Apps retry is cooling down for 10s.', 'info');

    vi.useRealTimers();
  });

  it('creates stable unique warning ids for config loading failures', async () => {
    const requestCompat = vi.fn(async () => {
      throw new Error('unsupported');
    }) as RequestCompat;
    const { store, service } = createService(requestCompat);

    await service.loadConfig();

    const ids = store.getState().integrationWarnings.map((warning) => warning.id);
    expect(ids).toContain('config:config-read');
    expect(ids).toContain('config:config-requirements');
    expect(ids).toContain('config:mcp-status');
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('keeps info warning ids unique even when multiple warnings share the same source', async () => {
    const requestCompat = vi.fn(async () => {
      throw new Error('unsupported');
    }) as RequestCompat;
    const { store, service } = createService(requestCompat);

    await service.loadInfo();

    const ids = store.getState().integrationWarnings.map((warning) => warning.id);
    expect(ids).toContain('info:experimental-features');
    expect(ids).toContain('info:collaboration-modes');
    expect(ids).not.toContain('info:apps');
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('does not fetch apps during the general info bootstrap', async () => {
    const requestCompat = vi.fn(async (method: string) => {
      if (method === 'mcpServerStatus/list') return { servers: [] };
      if (method === 'skills/list') return { skills: [] };
      if (method === 'experimentalFeature/list') return { features: [] };
      if (method === 'plugin/list') return { plugins: [] };
      if (method === 'collaborationMode/list') return { data: [] };
      throw new Error(`Unexpected method: ${method}`);
    }) as RequestCompat;
    const { service } = createService(requestCompat);

    await service.loadInfo();

    expect(requestCompat).not.toHaveBeenCalledWith('app/list', expect.anything());
  });

  it('loads apps lazily and stores app-specific upstream errors separately', async () => {
    const requestCompat = vi.fn(async () => {
      throw new Error(
        'Request failed with status 403 Forbidden: remote service returned an HTML challenge page instead of API JSON. This usually means auth expired or the request was blocked upstream.',
      );
    }) as RequestCompat;
    const { store, service } = createService(requestCompat);

    await service.loadApps();

    expect(store.getState().appsHydrated).toBe(true);
    expect(store.getState().appsLoading).toBe(false);
    expect(store.getState().appsError).toContain('403 Forbidden');
    expect(store.getState().integrationWarnings).toContainEqual(
      expect.objectContaining({
        id: 'info:apps',
        source: 'apps',
      }),
    );
  });

  it('keeps an existing apps warning when loadInfo refreshes unrelated panels', async () => {
    const requestCompat = vi.fn(async (method: string) => {
      if (method === 'app/list') {
        throw new Error(
          'Request failed with status 403 Forbidden: remote service returned an HTML challenge page instead of API JSON. This usually means auth expired or the request was blocked upstream.',
        );
      }
      if (method === 'mcpServerStatus/list') return { servers: [] };
      if (method === 'skills/list') return { skills: [] };
      if (method === 'experimentalFeature/list') return { features: [] };
      if (method === 'plugin/list') return { plugins: [] };
      if (method === 'collaborationMode/list') return { data: [] };
      throw new Error(`Unexpected method: ${method}`);
    }) as RequestCompat;
    const { store, service } = createService(requestCompat);

    await service.loadApps();
    await service.loadInfo();

    expect(store.getState().integrationWarnings).toContainEqual(
      expect.objectContaining({
        id: 'info:apps',
        source: 'apps',
      }),
    );
  });

  it('refreshes apps after plugin install when apps were already hydrated', async () => {
    const requestCompat = vi.fn(async (method: string) => {
      if (method === 'plugin/install') return {};
      if (method === 'plugin/list') {
        return {
          plugins: [{ id: 'plugin-1', name: 'Plugin One', marketplacePath: 'market/path' }],
        };
      }
      if (method === 'app/list') {
        return {
          data: [{ id: 'app-1', name: 'App One', enabled: true }],
        };
      }
      if (method === 'mcpServerStatus/list') return { servers: [] };
      if (method === 'skills/list') return { skills: [] };
      if (method === 'experimentalFeature/list') return { features: [] };
      if (method === 'collaborationMode/list') return { data: [] };
      throw new Error(`Unexpected method: ${method}`);
    });
    const { store, service } = createService(requestCompat as RequestCompat);

    store.patch({
      plugins: [{ id: 'plugin-1', name: 'Plugin One', marketplacePath: 'market/path' }],
      appsHydrated: true,
    });

    await service.installPlugin('plugin-1');

    expect(
      (requestCompat.mock.calls as Array<unknown[]>).some((call) => {
        const method = call[0];
        const params = call[1];
        return (
          method === 'app/list' && JSON.stringify(params) === JSON.stringify({ forceRefetch: true })
        );
      }),
    ).toBe(true);
    expect(store.getState().apps).toHaveLength(1);
  });

  it('refreshes apps after plugin uninstall when apps were already hydrated', async () => {
    const requestCompat = vi.fn(async (method: string) => {
      if (method === 'plugin/uninstall') return {};
      if (method === 'plugin/list') return { plugins: [] };
      if (method === 'app/list') return { data: [] };
      if (method === 'mcpServerStatus/list') return { servers: [] };
      if (method === 'skills/list') return { skills: [] };
      if (method === 'experimentalFeature/list') return { features: [] };
      if (method === 'collaborationMode/list') return { data: [] };
      throw new Error(`Unexpected method: ${method}`);
    });
    const { service, store } = createService(requestCompat as RequestCompat);

    store.patch({ appsHydrated: true });

    await service.uninstallPlugin('plugin-1');

    expect(requestCompat).toHaveBeenCalledWith('plugin/uninstall', { pluginId: 'plugin-1' }, [
      'plugin/uninstall',
    ]);
    expect(
      (requestCompat.mock.calls as Array<unknown[]>).some((call) => {
        const method = call[0];
        const params = call[1];
        return (
          method === 'app/list' && JSON.stringify(params) === JSON.stringify({ forceRefetch: true })
        );
      }),
    ).toBe(true);
  });
});
