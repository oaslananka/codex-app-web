import { afterEach, describe, expect, it, vi } from 'vitest';
import { buildInitialState } from '../../src/lib/codex-runtime/runtime-state';
import { RuntimeStore } from '../../src/lib/codex-runtime/store';
import { AuthService } from '../../src/lib/codex-runtime/services/auth-service';

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
  const service = new AuthService(store, deps);

  return { deps, service, store };
}

describe('AuthService', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('loads account identity without exposing token-shaped fields to UI state', async () => {
    const requestCompat = vi.fn(async () => ({
      account: {
        email: 'user@example.test',
        planType: 'plus',
        accessToken: 'secret-token',
      },
    })) as RequestCompat;
    const { deps, service, store } = createService(requestCompat);

    await service.loadAccount();

    expect(requestCompat).toHaveBeenCalledWith('account/read', { refresh: false });
    expect(store.getState()).toMatchObject({
      loggedIn: true,
      loginInProgress: false,
      accountEmail: 'user@example.test',
      accountPlan: 'PLUS',
    });
    expect(JSON.stringify(store.getState())).not.toContain('secret-token');
    expect(deps.markRequestSupported).toHaveBeenCalledWith('account/read');
  });

  it('keeps account UI in a waiting state while backend initialization is pending', async () => {
    const requestCompat = vi.fn(async () => {
      throw new Error('Codex backend is still initializing');
    }) as RequestCompat;
    const { deps, service, store } = createService(requestCompat);

    await service.loadAccount();

    expect(store.getState()).toMatchObject({
      loggedIn: false,
      loginInProgress: false,
      accountEmail: 'Waiting for backend session',
      accountPlan: '',
    });
    expect(deps.markRequestUnsupported).not.toHaveBeenCalledWith('account/read');
    expect(deps.toast).not.toHaveBeenCalled();
  });

  it('opens browser login URLs and records login start support', async () => {
    const open = vi.fn();
    vi.stubGlobal('window', { open });
    const requestCompat = vi.fn(async () => ({
      type: 'chatgpt',
      authUrl: 'https://auth.example.test/start',
    })) as RequestCompat;
    const { deps, service, store } = createService(requestCompat);

    await service.startLogin();

    expect(store.getState().loginInProgress).toBe(true);
    expect(open).toHaveBeenCalledWith(
      'https://auth.example.test/start',
      '_blank',
      'noopener,noreferrer',
    );
    expect(deps.toast).toHaveBeenCalledWith('Login flow started', 'info');
    expect(deps.markRequestSupported).toHaveBeenCalledWith('account/login/start');
  });

  it('clears auth status loading and records normalized errors', async () => {
    const requestCompat = vi.fn(async () => {
      throw new Error('status 503 <html><body>service unavailable</body></html>');
    }) as RequestCompat;
    const { deps, service, store } = createService(requestCompat);

    await service.refreshAuthStatus();

    expect(store.getState().authStatus).toMatchObject({
      content: '',
      loading: false,
      error: 'Request failed: remote service returned HTML instead of API JSON.',
    });
    expect(deps.markRequestUnsupported).toHaveBeenCalledWith('getAuthStatus');
  });

  it('resets visible account state after logout succeeds', async () => {
    const requestCompat = vi.fn(async () => ({})) as RequestCompat;
    const { deps, service, store } = createService(requestCompat);
    store.patch({
      loggedIn: true,
      accountEmail: 'user@example.test',
      accountPlan: 'PLUS',
    });

    await service.logout();

    expect(requestCompat).toHaveBeenCalledWith('account/logout', {});
    expect(store.getState()).toMatchObject({
      loggedIn: false,
      accountEmail: 'Not connected',
      accountPlan: '',
    });
    expect(deps.toast).toHaveBeenCalledWith('Logged out', 'info');
  });
});
