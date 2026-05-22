import { describe, expect, it, vi } from 'vitest';
import { buildInitialState } from '../../src/lib/codex-runtime/runtime-state';
import { RuntimeStore } from '../../src/lib/codex-runtime/store';
import { WorkspaceService } from '../../src/lib/codex-runtime/services/workspace-service';

type RequestCompat = <T = unknown>(
  canonicalMethod: string,
  params?: unknown,
  fallbacks?: readonly string[],
) => Promise<T>;

function createService(requestCompat: RequestCompat) {
  const store = new RuntimeStore(buildInitialState());
  const service = new WorkspaceService(store, {
    requestCompat,
    markRequestSupported: vi.fn(),
    markRequestUnsupported: vi.fn(),
    toast: vi.fn(),
  });

  return { store, service };
}

describe('WorkspaceService', () => {
  it('falls back to cwd summary when the active thread has no valid backend id', async () => {
    const requestCompat = vi.fn(async (method: string, params?: unknown) => {
      expect(method).toBe('getConversationSummary');
      expect(params).toEqual({ rolloutPath: '/workspace/project' });
      return { summary: 'cwd summary' };
    }) as RequestCompat;
    const { store, service } = createService(requestCompat);

    store.patch({
      activeThread: {
        id: 'thread:local-snapshot',
        cwd: '/workspace/project',
      },
    });

    await service.loadConversationSummary();

    expect(store.getState().workspaceSummary).toMatchObject({
      content: 'cwd summary',
      source: 'cwd',
      loading: false,
      error: '',
    });
  });

  it('blocks review start for local-only threads before hitting the backend', async () => {
    const requestCompat = vi.fn() as RequestCompat;
    const toast = vi.fn();
    const store = new RuntimeStore(buildInitialState());
    const service = new WorkspaceService(store, {
      requestCompat,
      markRequestSupported: vi.fn(),
      markRequestUnsupported: vi.fn(),
      toast,
    });

    store.patch({
      activeThread: {
        id: 'thread:local-snapshot',
        cwd: '/workspace/project',
      },
    });

    await service.startReview();

    expect(requestCompat).not.toHaveBeenCalled();
    expect(store.getState().review).toEqual({
      loading: false,
      error: 'Review requires an active backend thread.',
      reviewThreadId: null,
    });
    expect(toast).toHaveBeenCalledWith('Review requires an active backend thread.', 'info');
  });

  it('loads git diff for the active thread cwd', async () => {
    const requestCompat = vi.fn(async (method: string, params?: unknown) => {
      expect(method).toBe('gitDiffToRemote');
      expect(params).toEqual({ cwd: '/workspace/project' });
      return { diff: 'diff --git a/file.ts b/file.ts' };
    }) as RequestCompat;
    const { store, service } = createService(requestCompat);
    store.patch({
      activeThread: {
        id: 'thread-1',
        cwd: '/workspace/project',
      },
    });

    await service.loadGitDiff();

    expect(store.getState().gitDiff).toEqual({
      content: 'diff --git a/file.ts b/file.ts',
      loading: false,
      error: '',
    });
  });

  it('normalizes fuzzy search results and sends bounded root context', async () => {
    const requestCompat = vi.fn(async (method: string, params?: unknown) => {
      expect(method).toBe('fuzzyFileSearch');
      expect(params).toEqual({
        query: 'security',
        roots: ['/workspace/project'],
        cancellationToken: null,
      });
      return {
        files: [
          {
            root: '/workspace/project',
            path: 'src/server.ts',
            score: 0.9,
            preview: 'security header',
          },
        ],
      };
    }) as RequestCompat;
    const { store, service } = createService(requestCompat);
    store.patch({ fileBrowserPath: '/workspace/project' });

    await service.searchFiles('security');

    expect(store.getState().fuzzySearch).toEqual({
      query: 'security',
      loading: false,
      error: '',
      results: [
        {
          path: '/workspace/project/src/server.ts',
          score: 0.9,
          preview: 'security header',
        },
      ],
    });
  });

  it('starts detached review only for valid backend thread ids', async () => {
    const threadId = '018f65d2-0d3a-7c9a-b123-456789abcdef';
    const requestCompat = vi.fn(async (method: string, params?: unknown) => {
      expect(method).toBe('review/start');
      expect(params).toEqual({
        threadId,
        target: { type: 'uncommittedChanges' },
        delivery: 'detached',
      });
      return { reviewThreadId: 'review-1' };
    }) as RequestCompat;
    const { store, service } = createService(requestCompat);
    store.patch({
      activeThread: {
        id: threadId,
        cwd: '/workspace/project',
      },
    });

    await service.startReview();

    expect(store.getState().review).toEqual({
      loading: false,
      error: '',
      reviewThreadId: 'review-1',
    });
  });

  it('detects external agent config without losing the previous import count', async () => {
    const requestCompat = vi.fn(async (method: string, params?: unknown) => {
      expect(method).toBe('externalAgentConfig/detect');
      expect(params).toEqual({
        includeHome: true,
        cwds: ['/workspace/project'],
      });
      return {
        migrationItems: [{ path: '/workspace/project/.config/tool.json' }],
      };
    }) as RequestCompat;
    const { store, service } = createService(requestCompat);
    store.patch({
      fileBrowserPath: '/workspace/project',
      externalAgents: {
        ...store.getState().externalAgents,
        importedCount: 2,
      },
    });

    await service.detectExternalAgents();

    expect(store.getState().externalAgents).toEqual({
      loading: false,
      error: '',
      items: [{ path: '/workspace/project/.config/tool.json' }],
      importedCount: 2,
    });
  });

  it('imports only detected external agent items', async () => {
    const requestCompat = vi.fn(async () => ({})) as RequestCompat;
    const { store, service } = createService(requestCompat);
    store.patch({
      externalAgents: {
        loading: false,
        error: '',
        items: [{ id: 'item-1' }, { id: 'item-2' }],
        importedCount: 0,
      },
    });

    await service.importExternalAgents();

    expect(requestCompat).toHaveBeenCalledWith('externalAgentConfig/import', {
      migrationItems: [{ id: 'item-1' }, { id: 'item-2' }],
    });
    expect(store.getState().externalAgents.importedCount).toBe(2);
  });
});
