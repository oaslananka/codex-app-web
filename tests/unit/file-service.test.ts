import { describe, expect, it, vi } from 'vitest';
import { FileService } from '../../src/lib/codex-runtime/services/file-service';
import { buildInitialState } from '../../src/lib/codex-runtime/runtime-state';
import { RuntimeStore } from '../../src/lib/codex-runtime/store';

describe('FileService', () => {
  it('preserves Windows absolute paths when browsing directories', async () => {
    const store = new RuntimeStore(buildInitialState());
    const requestCompatSpy = vi.fn();
    const requestCompat = async <T = unknown>(canonicalMethod: string, params?: unknown) => {
      requestCompatSpy(canonicalMethod, params);
      return { entries: [] } as unknown as T;
    };
    const service = new FileService(store, {
      requestCompat,
      markRequestSupported: vi.fn(),
      markRequestUnsupported: vi.fn(),
      toast: vi.fn(),
    });

    await service.browse('/c:/Users/Admin/Desktop/PROJECTS/codex-web-ui');

    expect(requestCompatSpy).toHaveBeenCalledWith('fs/readDirectory', {
      path: 'c:/Users/Admin/Desktop/PROJECTS/codex-web-ui',
    });

    const state = store.getState();
    expect(state.fileBrowserPath).toBe('c:/Users/Admin/Desktop/PROJECTS/codex-web-ui');
    expect(state.fileBreadcrumb[0]).toEqual({
      label: 'c:/',
      path: 'c:/',
    });
  });

  it('builds absolute child paths from fs/readDirectory fileName entries', async () => {
    const store = new RuntimeStore(buildInitialState());
    const requestCompat = vi.fn(async <T = unknown>() => {
      return {
        entries: [
          {
            fileName: 'azure-pipelines.yml',
            isDirectory: false,
            isFile: true,
          },
          {
            fileName: 'src',
            isDirectory: true,
            isFile: false,
          },
        ],
      } as T;
    }) as <T = unknown>(
      canonicalMethod: string,
      params?: unknown,
      fallbacks?: readonly string[],
    ) => Promise<T>;

    const service = new FileService(store, {
      requestCompat,
      markRequestSupported: vi.fn(),
      markRequestUnsupported: vi.fn(),
      toast: vi.fn(),
    });

    await service.browse('/home/msi/Desktop/PROJECTS/codex-app-web');

    const cachedEntries =
      store.getState().fileTreeCache['/home/msi/Desktop/PROJECTS/codex-app-web'];
    expect(cachedEntries).toEqual([
      {
        name: 'azure-pipelines.yml',
        path: '/home/msi/Desktop/PROJECTS/codex-app-web/azure-pipelines.yml',
        type: 'file',
      },
      {
        name: 'src',
        path: '/home/msi/Desktop/PROJECTS/codex-app-web/src',
        type: 'directory',
      },
    ]);
  });

  it('gracefully recovers when opening a file that no longer exists', async () => {
    const store = new RuntimeStore(buildInitialState());
    const toast = vi.fn();
    const requestCompat = vi.fn(async (canonicalMethod: string) => {
      if (canonicalMethod === 'fs/readFile' || canonicalMethod === 'fs/getMetadata') {
        const missing = Object.assign(new Error('No such file or directory (os error 2)'), {
          code: -32603,
        });
        throw missing;
      }

      if (canonicalMethod === 'fs/readDirectory') {
        return {
          entries: [
            {
              name: 'workspace',
              path: '/workspace',
              type: 'directory',
            },
          ],
        };
      }

      throw new Error(`Unexpected method: ${canonicalMethod}`);
    }) as <T = unknown>(
      canonicalMethod: string,
      params?: unknown,
      fallbacks?: readonly string[],
    ) => Promise<T>;

    const service = new FileService(store, {
      requestCompat,
      markRequestSupported: vi.fn(),
      markRequestUnsupported: vi.fn(),
      toast,
    });

    await service.openFile('/workspace/missing.ts', 'missing.ts');

    const state = store.getState();
    expect(state.currentFilePath).toBeNull();
    expect(state.fileBrowserPath).toBe('/workspace');
    expect(state.fileEditorContent).toBe(
      'File no longer exists. Refresh the folder and choose another file.',
    );
    expect(state.fileLoading).toBe(false);
    expect(toast).toHaveBeenCalledWith(
      'File no longer exists. Refresh the folder and choose another file.',
      'info',
    );
    expect(requestCompat).toHaveBeenCalledWith('fs/readDirectory', { path: '/workspace' });
  });

  it('resolves relative file paths against the active workspace root', async () => {
    const store = new RuntimeStore(buildInitialState());
    store.patch({
      activeThread: {
        id: 'thread-1',
        cwd: '/workspace/project',
        status: { type: 'idle' },
      },
      fileBrowserPath: '/workspace/project',
    });
    const requestCompat = vi.fn(async <T = unknown>(canonicalMethod: string) => {
      if (canonicalMethod === 'fs/readFile') {
        return { dataBase64: 'aGVsbG8=' } as T;
      }
      if (canonicalMethod === 'fs/getMetadata') {
        return {
          path: '/workspace/project/src/app.ts',
          type: 'file',
          size: 5,
        } as T;
      }
      throw new Error(`Unexpected method: ${canonicalMethod}`);
    }) as <T = unknown>(
      canonicalMethod: string,
      params?: unknown,
      fallbacks?: readonly string[],
    ) => Promise<T>;

    const service = new FileService(store, {
      requestCompat,
      markRequestSupported: vi.fn(),
      markRequestUnsupported: vi.fn(),
      toast: vi.fn(),
    });

    await service.openFile('src/app.ts', 'app.ts');

    expect(requestCompat).toHaveBeenCalledWith('fs/readFile', {
      path: '/workspace/project/src/app.ts',
    });
    expect(requestCompat).toHaveBeenCalledWith('fs/getMetadata', {
      path: '/workspace/project/src/app.ts',
    });
    expect(store.getState().fileEditorContent).toBe('hello');
  });

  it('opens directories in the file browser instead of reading them as files', async () => {
    const store = new RuntimeStore(buildInitialState());
    store.patch({
      activeThread: {
        id: 'thread-1',
        cwd: '/workspace/project',
        status: { type: 'idle' },
      },
      fileBrowserPath: '/workspace/project',
    });
    const requestCompat = vi.fn(async <T = unknown>(canonicalMethod: string, params?: unknown) => {
      if (canonicalMethod === 'fs/readFile') {
        const directoryError = Object.assign(new Error('Is a directory (os error 21)'), {
          code: -32603,
        });
        throw directoryError;
      }
      if (canonicalMethod === 'fs/getMetadata') {
        return {
          path: '/workspace/project/src',
          type: 'directory',
        } as T;
      }
      if (canonicalMethod === 'fs/readDirectory') {
        return {
          entries: [
            {
              name: 'app.ts',
              path: '/workspace/project/src/app.ts',
              type: 'file',
            },
          ],
        } as T;
      }
      throw new Error(`Unexpected method: ${canonicalMethod}`);
    }) as <T = unknown>(
      canonicalMethod: string,
      params?: unknown,
      fallbacks?: readonly string[],
    ) => Promise<T>;

    const service = new FileService(store, {
      requestCompat,
      markRequestSupported: vi.fn(),
      markRequestUnsupported: vi.fn(),
      toast: vi.fn(),
    });

    await service.openFile('src', 'src');

    const state = store.getState();
    expect(state.fileBrowserPath).toBe('/workspace/project/src');
    expect(state.currentFilePath).toBeNull();
    expect(state.fileError).toBe('');
    expect(requestCompat).toHaveBeenCalledWith('fs/readDirectory', {
      path: '/workspace/project/src',
    });
  });
});
