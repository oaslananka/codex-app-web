import { isMissingPathError, normalizeError } from '../errors';
import { normalizeFileContent, normalizeFileEntries, normalizeFileMetadata } from '../normalizers';
import type { RuntimeStore } from '../store';
import type { RuntimeState } from '../types';
import { decodeBase64Utf8, encodeBase64Utf8 } from '../utf8-base64';

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

function normalizePath(path: string | null | undefined) {
  if (!path) return '/';
  let nextValue = path.replace(/\\/g, '/').trim();
  nextValue = nextValue.replace(/^\/([A-Za-z]:\/)/, '$1');
  const isWindowsAbsolutePath = /^[A-Za-z]:($|\/)/.test(nextValue);
  if (!isWindowsAbsolutePath && !nextValue.startsWith('/')) {
    nextValue = `/${nextValue}`;
  }
  return nextValue.replace(/\/+/g, '/');
}

function isAbsolutePath(path: string | null | undefined) {
  if (!path) return false;
  const normalized = path.replace(/\\/g, '/').trim();
  return normalized.startsWith('/') || /^[A-Za-z]:($|\/)/.test(normalized);
}

function joinPath(base: string, child: string) {
  return normalizePath(`${base.replace(/\/$/, '')}/${child.replace(/^\//, '')}`);
}

function parentPath(path: string) {
  const normalized = normalizePath(path);
  if (normalized === '/') return '/';
  if (/^[A-Za-z]:\/?$/.test(normalized)) {
    return normalized.endsWith('/') ? normalized : `${normalized}/`;
  }
  const segments = normalized.split('/').filter(Boolean);
  segments.pop();
  if (!segments.length) return '/';
  if (/^[A-Za-z]:$/.test(segments[0] ?? '')) {
    return segments.length === 1
      ? `${segments[0]}/`
      : `${segments[0]}/${segments.slice(1).join('/')}`;
  }
  return `/${segments.join('/')}`;
}

function resolvePathAgainstBase(base: string, target: string) {
  const normalizedBase = normalizePath(base);
  const normalizedTarget = target.replace(/\\/g, '/').trim();
  if (!normalizedTarget) {
    return normalizedBase;
  }

  const baseSegments = normalizedBase.split('/').filter(Boolean);
  const targetSegments = normalizedTarget.split('/').filter(Boolean);
  const segments = normalizedTarget.startsWith('/')
    ? []
    : /^[A-Za-z]:($|\/)/.test(normalizedTarget)
      ? []
      : baseSegments;

  for (const segment of targetSegments) {
    if (segment === '.') {
      continue;
    }
    if (segment === '..') {
      segments.pop();
      continue;
    }
    segments.push(segment);
  }

  if (/^[A-Za-z]:$/.test(segments[0] ?? '')) {
    const [drive, ...rest] = segments;
    return rest.length ? `${drive}/${rest.join('/')}` : `${drive}/`;
  }

  return `/${segments.join('/')}`.replace(/\/+/g, '/');
}

function resolveRequestedPath(state: RuntimeState, path: string) {
  if (isAbsolutePath(path)) {
    return normalizePath(path);
  }

  const basePath =
    state.activeThread?.cwd ||
    state.fileBrowserPath ||
    (state.currentFilePath ? parentPath(state.currentFilePath) : '/');
  return resolvePathAgainstBase(basePath, path);
}

export class FileService {
  constructor(
    private readonly store: RuntimeStore,
    private readonly deps: ServiceDeps,
  ) {}

  setRootPath(path: string) {
    const normalized = normalizePath(path);
    this.store.patch({
      fileBrowserPath: normalized,
      fileBreadcrumb: [{ label: normalized, path: normalized }],
    });
  }

  async browse(path?: string) {
    const state = this.store.getState();
    const normalized = normalizePath(path ?? state.fileBrowserPath);
    this.store.patch({
      fileBrowserPath: normalized,
      fileBreadcrumb: [{ label: normalized, path: normalized }],
      fileLoading: true,
      fileError: '',
      currentFilePath: null,
      fileMetadata: null,
      fileTreeExpanded: [normalized],
    });

    try {
      const response = await this.deps.requestCompat('fs/readDirectory', { path: normalized });
      const entries = normalizeFileEntries(response, normalized);
      this.store.patch((current) => ({
        fileLoading: false,
        fileTreeCache: {
          ...current.fileTreeCache,
          [normalized]: entries,
        },
      }));
      this.rebuildFileTree();
      this.deps.markRequestSupported('fs/readDirectory');
    } catch (error) {
      this.deps.markRequestUnsupported('fs/readDirectory');
      this.store.patch({
        fileLoading: false,
        fileError: normalizeError(error),
      });
    }
  }

  async toggleDirectory(path: string) {
    const normalized = normalizePath(path);
    const state = this.store.getState();
    const expanded = new Set(state.fileTreeExpanded);
    if (expanded.has(normalized) && normalized !== state.fileBrowserPath) {
      expanded.delete(normalized);
      this.store.patch({ fileTreeExpanded: [...expanded] });
      this.rebuildFileTree();
      return;
    }

    try {
      const response = await this.deps.requestCompat('fs/readDirectory', { path: normalized });
      const entries = normalizeFileEntries(response, normalized);
      expanded.add(normalized);
      this.store.patch((current) => ({
        fileTreeExpanded: [...expanded],
        fileTreeCache: {
          ...current.fileTreeCache,
          [normalized]: entries,
        },
      }));
      this.rebuildFileTree();
    } catch (error) {
      this.deps.toast(`Folder open failed: ${normalizeError(error)}`, 'error');
    }
  }

  async openFile(path: string, name?: string) {
    const state = this.store.getState();
    const normalized = resolveRequestedPath(state, path);
    this.store.patch({
      currentFilePath: normalized,
      fileEditorName: name ?? normalized.split('/').pop() ?? normalized,
      fileEditorContent: 'Loading…',
      fileEditorReadOnly: true,
      fileLoading: true,
      fileError: '',
    });

    try {
      const [fileResponse, metadataResponse] = await Promise.allSettled([
        this.deps.requestCompat('fs/readFile', { path: normalized }),
        this.deps.requestCompat('fs/getMetadata', { path: normalized }),
      ]);

      const metadata =
        metadataResponse.status === 'fulfilled'
          ? normalizeFileMetadata(metadataResponse.value)
          : null;

      if (metadataResponse.status === 'fulfilled') {
        this.store.patch({
          fileMetadata: metadata,
        });
        this.deps.markRequestSupported('fs/getMetadata');
      } else {
        this.deps.markRequestUnsupported('fs/getMetadata');
        this.store.patch({ fileMetadata: null });
      }

      if (metadata?.type === 'directory') {
        this.store.patch({
          currentFilePath: null,
          fileEditorContent: '',
          fileEditorReadOnly: true,
          fileLoading: false,
          fileError: '',
        });
        await this.browse(normalized);
        return;
      }

      if (fileResponse.status === 'fulfilled') {
        const encoded = normalizeFileContent(fileResponse.value);
        this.store.patch({
          fileEditorContent: decodeBase64Utf8(encoded),
          fileEditorReadOnly: false,
          fileLoading: false,
        });
        this.deps.markRequestSupported('fs/readFile');
      } else {
        throw fileResponse.reason;
      }
    } catch (error) {
      this.deps.markRequestUnsupported('fs/readFile');
      const missingPath = isMissingPathError(error);
      const errorMessage = missingPath
        ? 'File no longer exists. Refresh the folder and choose another file.'
        : normalizeError(error);
      this.store.patch({
        currentFilePath: missingPath ? null : normalized,
        fileMetadata: null,
        fileEditorContent: missingPath ? errorMessage : `File load failed: ${errorMessage}`,
        fileEditorReadOnly: true,
        fileLoading: false,
        fileError: errorMessage,
      });
      if (missingPath) {
        this.deps.toast(errorMessage, 'info');
        await this.browse(parentPath(normalized));
      }
    }
  }

  setEditorContent(content: string) {
    this.store.patch({ fileEditorContent: content });
  }

  async saveCurrentFile() {
    const state = this.store.getState();
    if (!state.currentFilePath) return;
    try {
      const dataBase64 = encodeBase64Utf8(state.fileEditorContent);
      await this.deps.requestCompat('fs/writeFile', {
        path: state.currentFilePath,
        dataBase64,
        content: dataBase64,
      });
      this.deps.toast('File saved', 'success');
      this.deps.markRequestSupported('fs/writeFile');
    } catch (error) {
      this.deps.markRequestUnsupported('fs/writeFile');
      this.deps.toast(`Save failed: ${normalizeError(error)}`, 'error');
    }
  }

  async createFile(name: string) {
    if (!name.trim()) return;
    const state = this.store.getState();
    const path = joinPath(state.fileBrowserPath, name.trim());
    try {
      const emptyContent = encodeBase64Utf8('');
      await this.deps.requestCompat('fs/writeFile', {
        path,
        dataBase64: emptyContent,
        content: emptyContent,
      });
      this.deps.toast('File created', 'success');
      await this.browse(state.fileBrowserPath);
      await this.openFile(path, name.trim());
    } catch (error) {
      this.deps.toast(`Create file failed: ${normalizeError(error)}`, 'error');
    }
  }

  async createDirectory(name: string) {
    if (!name.trim()) return;
    const state = this.store.getState();
    const path = joinPath(state.fileBrowserPath, name.trim());
    try {
      await this.deps.requestCompat('fs/createDirectory', { path });
      this.deps.markRequestSupported('fs/createDirectory');
      this.deps.toast('Directory created', 'success');
      await this.browse(state.fileBrowserPath);
    } catch (error) {
      this.deps.markRequestUnsupported('fs/createDirectory');
      this.deps.toast(`Create directory failed: ${normalizeError(error)}`, 'error');
    }
  }

  async copyPath(sourcePath: string, destinationPath: string) {
    if (!sourcePath || !destinationPath) return;
    try {
      await this.deps.requestCompat('fs/copy', {
        sourcePath,
        destinationPath,
        recursive: true,
      });
      this.deps.markRequestSupported('fs/copy');
      this.deps.toast('Path copied', 'success');
      await this.browse(parentPath(destinationPath));
    } catch (error) {
      this.deps.markRequestUnsupported('fs/copy');
      this.deps.toast(`Copy unavailable: ${normalizeError(error)}`, 'info');
    }
  }

  async removePath(path: string) {
    if (!path) return;
    try {
      await this.deps.requestCompat('fs/remove', { path, recursive: true, force: true });
      this.deps.markRequestSupported('fs/remove');
      this.deps.toast('Path removed', 'success');
      await this.browse(parentPath(path));
    } catch (error) {
      this.deps.markRequestUnsupported('fs/remove');
      this.deps.toast(`Remove unavailable: ${normalizeError(error)}`, 'info');
    }
  }

  private rebuildFileTree() {
    const state = this.store.getState();
    const expanded = new Set(state.fileTreeExpanded);

    const buildNodes = (path: string, depth = 0, isRoot = false) => {
      const entries = state.fileTreeCache[path] ?? [];
      const nodes: Array<{
        path: string;
        name: string;
        type: 'directory' | 'file';
        depth: number;
        expanded?: boolean;
        selected: boolean;
        isRoot?: boolean;
      }> = [
        {
          path,
          name: isRoot ? path : (path.split('/').filter(Boolean).pop() ?? path),
          type: 'directory' as const,
          depth,
          expanded: expanded.has(path),
          selected: state.currentFilePath === path,
          isRoot,
        },
      ];

      if (!expanded.has(path)) return nodes;

      entries.forEach((entry) => {
        const childPath = normalizePath(entry.path);
        if (entry.type === 'directory') {
          nodes.push(...buildNodes(childPath, depth + 1));
          return;
        }
        nodes.push({
          path: childPath,
          name: entry.name,
          type: 'file' as const,
          depth: depth + 1,
          selected: state.currentFilePath === childPath,
        });
      });

      return nodes;
    };

    this.store.patch({
      fileTree: buildNodes(state.fileBrowserPath, 0, true),
      fileBreadcrumb: buildBreadcrumb(state.currentFilePath ?? state.fileBrowserPath),
    });
  }
}

function buildBreadcrumb(path: string) {
  const normalized = normalizePath(path);
  if (normalized === '/') return [{ label: '/', path: '/' }];
  const windowsDriveRoot = normalized.match(/^([A-Za-z]:)(?:\/(.*))?$/);
  if (windowsDriveRoot) {
    const drive = windowsDriveRoot[1];
    const remainder = windowsDriveRoot[2]?.split('/').filter(Boolean) ?? [];
    const crumbs = [{ label: `${drive}/`, path: `${drive}/` }];
    let current = `${drive}`;
    remainder.forEach((part) => {
      current = `${current}/${part}`;
      crumbs.push({ label: part, path: current });
    });
    return crumbs;
  }
  const parts = normalized.split('/').filter(Boolean);
  const crumbs = [{ label: '/', path: '/' }];
  let current = '';
  parts.forEach((part) => {
    current = `${current}/${part}`;
    crumbs.push({ label: part, path: current });
  });
  return crumbs;
}
