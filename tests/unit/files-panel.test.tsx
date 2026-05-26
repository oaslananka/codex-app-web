import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { FilesPanel } from '../../src/components/codex/panels/FilesPanel';
import type { RuntimeSnapshot } from '../../src/lib/codex-runtime/types';

const mockedShellState = vi.hoisted(() => ({
  activeTab: 'files',
}));

const mockedFilesState = vi.hoisted(() => ({
  currentFilePath: null as string | null,
  fileBreadcrumb: [{ label: '/', path: '/' }],
  fileBrowserPath: '/',
  fileEditorContent: '',
  fileEditorName: 'No file selected',
  fileEditorReadOnly: true,
  fileError: '',
  fileLoading: false,
  fileMetadata: null as RuntimeSnapshot['fileMetadata'],
  fileTree: [] as RuntimeSnapshot['fileTree'],
}));

const mockedActions = vi.hoisted(() => ({
  files: {
    browseFiles: () => undefined,
    copyPath: () => undefined,
    createDirectory: () => undefined,
    createFile: () => undefined,
    openFile: () => undefined,
    openInputModal: () => undefined,
    removePath: () => undefined,
    saveFile: () => undefined,
    setEditorContent: () => undefined,
    setFilesPath: () => undefined,
    toggleDirectory: () => undefined,
  },
}));

vi.mock('../../src/components/codex/ControlCenterContext', () => ({
  useControlCenterActions: () => mockedActions,
  useFilesState: () => mockedFilesState,
  useShellState: () => mockedShellState,
}));

describe('FilesPanel', () => {
  beforeEach(() => {
    mockedShellState.activeTab = 'files';
    mockedFilesState.currentFilePath = null;
    mockedFilesState.fileBreadcrumb = [{ label: '/', path: '/' }];
    mockedFilesState.fileBrowserPath = '/';
    mockedFilesState.fileEditorContent = '';
    mockedFilesState.fileEditorName = 'No file selected';
    mockedFilesState.fileEditorReadOnly = true;
    mockedFilesState.fileError = '';
    mockedFilesState.fileLoading = false;
    mockedFilesState.fileMetadata = null;
    mockedFilesState.fileTree = [];
  });

  it('renders an empty workspace file tree', () => {
    const markup = renderToStaticMarkup(<FilesPanel />);

    expect(markup).toContain('id="panel-files"');
    expect(markup).toContain('Files will appear here');
    expect(markup).toContain('No file selected');
  });

  it('renders file load errors without hiding the editor', () => {
    mockedFilesState.fileError = 'Permission denied';

    const markup = renderToStaticMarkup(<FilesPanel />);

    expect(markup).toContain('Could not read directory: Permission denied');
    expect(markup).toContain('id="file-editor"');
  });

  it('renders selected file metadata and tree entries', () => {
    mockedFilesState.currentFilePath = '/workspace/README.md';
    mockedFilesState.fileBrowserPath = '/workspace';
    mockedFilesState.fileEditorName = 'README.md';
    mockedFilesState.fileEditorReadOnly = false;
    mockedFilesState.fileEditorContent = 'fixture content';
    mockedFilesState.fileMetadata = {
      path: '/workspace/README.md',
      type: 'file',
      size: 15,
      modifiedAt: '2026-05-26T12:00:00.000Z',
      createdAt: null,
      readOnly: false,
    };
    mockedFilesState.fileTree = [
      {
        path: '/workspace',
        name: '/workspace',
        type: 'directory',
        depth: 0,
        expanded: true,
        selected: false,
        isRoot: true,
      },
      {
        path: '/workspace/README.md',
        name: 'README.md',
        type: 'file',
        depth: 1,
        selected: true,
      },
    ];

    const markup = renderToStaticMarkup(<FilesPanel />);

    expect(markup).toContain('README.md');
    expect(markup).toContain('15 B');
    expect(markup).toContain('fixture content');
    expect(markup).toContain('data-path="/workspace/README.md"');
  });
});
