import { isInitializationPendingError, normalizeError } from '../errors';
import type { RuntimeStore } from '../store';

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

export class AuthService {
  constructor(
    private readonly store: RuntimeStore,
    private readonly deps: ServiceDeps,
  ) {}

  async loadAccount() {
    try {
      const response = (await this.deps.requestCompat('account/read', {
        refresh: false,
      })) as Record<string, unknown>;
      const account = (response.account ?? null) as Record<string, unknown> | null;
      this.store.patch({
        loggedIn: Boolean(account),
        loginInProgress: false,
        accountEmail:
          account && typeof account.email === 'string' ? account.email : 'Not connected',
        accountPlan:
          account && typeof account.planType === 'string' ? account.planType.toUpperCase() : '',
      });
      this.deps.markRequestSupported('account/read');
    } catch (error) {
      if (isInitializationPendingError(error)) {
        this.store.patch({
          loggedIn: false,
          loginInProgress: false,
          accountEmail: 'Waiting for backend session',
          accountPlan: '',
        });
        return;
      }
      this.deps.markRequestUnsupported('account/read');
      this.deps.toast(`Account read failed: ${normalizeError(error)}`, 'error');
    }
  }

  async startLogin() {
    this.store.patch({ loginInProgress: true });
    try {
      const response = (await this.deps.requestCompat('account/login/start', { type: 'chatgpt' }, [
        'loginAccount',
        'account/login',
      ])) as Record<string, unknown>;
      if (response.type === 'chatgpt' && typeof response.authUrl === 'string') {
        window.open(response.authUrl, '_blank', 'noopener,noreferrer');
      }
      if (response.type === 'chatgptAuthTokens') {
        this.deps.toast('Server expects ChatGPT auth tokens from the client', 'info');
      } else {
        this.deps.toast('Login flow started', 'info');
      }
      this.deps.markRequestSupported('account/login/start');
    } catch (error) {
      this.deps.markRequestUnsupported('account/login/start');
      this.store.patch({ loginInProgress: false });
      this.deps.toast(`Login unavailable: ${normalizeError(error)}`, 'info');
    }
  }

  async cancelLogin() {
    try {
      await this.deps.requestCompat('account/login/cancel', {}, [
        'cancelLoginAccount',
        'account/login/cancel',
      ]);
      this.store.patch({ loginInProgress: false });
      this.deps.markRequestSupported('account/login/cancel');
      this.deps.toast('Login flow cancelled', 'info');
    } catch (error) {
      this.deps.markRequestUnsupported('account/login/cancel');
      this.deps.toast(`Unable to cancel login: ${normalizeError(error)}`, 'info');
    }
  }

  async logout() {
    try {
      await this.deps.requestCompat('account/logout', {});
      this.deps.markRequestSupported('account/logout');
      this.store.patch({
        loggedIn: false,
        accountEmail: 'Not connected',
        accountPlan: '',
      });
      this.deps.toast('Logged out', 'info');
    } catch (error) {
      this.deps.markRequestUnsupported('account/logout');
      this.deps.toast(`Logout failed: ${normalizeError(error)}`, 'error');
    }
  }

  async loadRateLimits() {
    try {
      await this.deps.requestCompat('account/rateLimits/read', {});
      this.deps.markRequestSupported('account/rateLimits/read');
    } catch {
      this.deps.markRequestUnsupported('account/rateLimits/read');
    }
  }

  async refreshAuthStatus() {
    this.store.patch((state) => ({
      authStatus: {
        ...state.authStatus,
        loading: true,
        error: '',
      },
    }));
    try {
      const response = await this.deps.requestCompat('getAuthStatus', {});
      this.store.patch({
        authStatus: {
          content: JSON.stringify(response, null, 2),
          loading: false,
          error: '',
        },
      });
      this.deps.markRequestSupported('getAuthStatus');
    } catch (error) {
      this.deps.markRequestUnsupported('getAuthStatus');
      this.store.patch({
        authStatus: {
          content: '',
          loading: false,
          error: normalizeError(error),
        },
      });
    }
  }
}
