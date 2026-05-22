import { normalizeError } from '../errors';
import { normalizeFuzzyResults } from '../normalizers';
import { sanitizeBackendThreadId } from '../thread-ids';
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

export class WorkspaceService {
  constructor(
    private readonly store: RuntimeStore,
    private readonly deps: ServiceDeps,
  ) {}

  async loadConversationSummary() {
    const state = this.store.getState();
    const backendThreadId = sanitizeBackendThreadId(state.activeThread?.id);
    const rolloutPath = state.activeThread?.cwd ?? state.fileBrowserPath;
    if (!backendThreadId && !rolloutPath) return;
    this.store.patch((current) => ({
      workspaceSummary: { ...current.workspaceSummary, loading: true, error: '' },
    }));
    try {
      const response = await this.deps.requestCompat(
        'getConversationSummary',
        backendThreadId ? { conversationId: backendThreadId } : { rolloutPath },
      );
      this.store.patch({
        workspaceSummary: {
          content:
            typeof (response as Record<string, unknown>).summary === 'string'
              ? String((response as Record<string, unknown>).summary)
              : JSON.stringify(response, null, 2),
          source: backendThreadId ? 'thread' : 'cwd',
          loading: false,
          error: '',
        },
      });
      this.deps.markRequestSupported('getConversationSummary');
    } catch (error) {
      this.deps.markRequestUnsupported('getConversationSummary');
      this.store.patch({
        workspaceSummary: {
          content: '',
          source: 'idle',
          loading: false,
          error: normalizeError(error),
        },
      });
    }
  }

  async loadGitDiff() {
    const state = this.store.getState();
    const cwd = state.activeThread?.cwd ?? state.fileBrowserPath;
    this.store.patch((current) => ({
      gitDiff: { ...current.gitDiff, loading: true, error: '' },
    }));
    try {
      const response = await this.deps.requestCompat('gitDiffToRemote', { cwd });
      this.store.patch({
        gitDiff: {
          content:
            typeof (response as Record<string, unknown>).diff === 'string'
              ? String((response as Record<string, unknown>).diff)
              : JSON.stringify(response, null, 2),
          loading: false,
          error: '',
        },
      });
      this.deps.markRequestSupported('gitDiffToRemote');
    } catch (error) {
      this.deps.markRequestUnsupported('gitDiffToRemote');
      this.store.patch({
        gitDiff: {
          content: '',
          loading: false,
          error: normalizeError(error),
        },
      });
    }
  }

  async searchFiles(query: string) {
    const state = this.store.getState();
    const roots = [state.activeThread?.cwd ?? state.fileBrowserPath].filter(Boolean);
    this.store.patch({
      fuzzySearch: {
        query,
        loading: true,
        error: '',
        results: [],
      },
    });
    try {
      const response = await this.deps.requestCompat('fuzzyFileSearch', {
        query,
        roots,
        cancellationToken: null,
      });
      this.store.patch({
        fuzzySearch: {
          query,
          loading: false,
          error: '',
          results: normalizeFuzzyResults(response),
        },
      });
      this.deps.markRequestSupported('fuzzyFileSearch');
    } catch (error) {
      this.deps.markRequestUnsupported('fuzzyFileSearch');
      this.store.patch({
        fuzzySearch: {
          query,
          loading: false,
          error: normalizeError(error),
          results: [],
        },
      });
    }
  }

  async startReview() {
    const state = this.store.getState();
    const backendThreadId = sanitizeBackendThreadId(state.activeThread?.id);
    if (!backendThreadId) {
      this.store.patch((current) => ({
        review: {
          ...current.review,
          loading: false,
          error: 'Review requires an active backend thread.',
          reviewThreadId: null,
        },
      }));
      this.deps.toast('Review requires an active backend thread.', 'info');
      return;
    }
    this.store.patch((current) => ({
      review: { ...current.review, loading: true, error: '' },
    }));
    try {
      const response = (await this.deps.requestCompat('review/start', {
        threadId: backendThreadId,
        target: { type: 'uncommittedChanges' },
        delivery: 'detached',
      })) as Record<string, unknown>;
      this.store.patch({
        review: {
          loading: false,
          error: '',
          reviewThreadId:
            typeof response.reviewThreadId === 'string' ? response.reviewThreadId : null,
        },
      });
      this.deps.markRequestSupported('review/start');
      this.deps.toast('Review started', 'success');
    } catch (error) {
      this.deps.markRequestUnsupported('review/start');
      this.store.patch({
        review: {
          loading: false,
          error: normalizeError(error),
          reviewThreadId: null,
        },
      });
    }
  }

  async detectExternalAgents() {
    const state = this.store.getState();
    this.store.patch((current) => ({
      externalAgents: { ...current.externalAgents, loading: true, error: '' },
    }));
    try {
      const response = (await this.deps.requestCompat('externalAgentConfig/detect', {
        includeHome: true,
        cwds: [state.activeThread?.cwd ?? state.fileBrowserPath],
      })) as Record<string, unknown>;
      const items = Array.isArray(response.migrationItems)
        ? response.migrationItems
        : Array.isArray(response.items)
          ? response.items
          : [];
      this.store.patch({
        externalAgents: {
          loading: false,
          error: '',
          items,
          importedCount: state.externalAgents.importedCount,
        },
      });
      this.deps.markRequestSupported('externalAgentConfig/detect');
    } catch (error) {
      this.deps.markRequestUnsupported('externalAgentConfig/detect');
      this.store.patch({
        externalAgents: {
          loading: false,
          error: normalizeError(error),
          items: [],
          importedCount: state.externalAgents.importedCount,
        },
      });
    }
  }

  async importExternalAgents() {
    const state = this.store.getState();
    if (!state.externalAgents.items.length) return;
    try {
      await this.deps.requestCompat('externalAgentConfig/import', {
        migrationItems: state.externalAgents.items,
      });
      this.deps.markRequestSupported('externalAgentConfig/import');
      this.store.patch({
        externalAgents: {
          ...state.externalAgents,
          importedCount: state.externalAgents.items.length,
        },
      });
      this.deps.toast('External agent config imported', 'success');
    } catch (error) {
      this.deps.markRequestUnsupported('externalAgentConfig/import');
      this.deps.toast(`External config import unavailable: ${normalizeError(error)}`, 'info');
    }
  }
}
