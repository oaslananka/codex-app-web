'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import type { FileTreeNode } from '../../../lib/codex-ui-runtime';
import { Modal, Skeleton } from '../../ui';
import { useControlCenterActions, useFilesState, useShellState } from '../ControlCenterContext';

function formatTimestamp(value?: string | number) {
  if (!value) return '';
  const date =
    typeof value === 'number' ? new Date(value < 1e12 ? value * 1000 : value) : new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return new Intl.DateTimeFormat('en-US', {
    hour: '2-digit',
    minute: '2-digit',
    month: 'short',
    day: 'numeric',
  }).format(date);
}

function getFileIcon(name: string, type: FileTreeNode['type'], isRoot?: boolean) {
  if (type === 'directory') return isRoot ? '🗂' : '📁';

  const extension = name.split('.').pop()?.toLowerCase() || '';
  const icons: Record<string, string> = {
    js: '📜',
    ts: '📘',
    py: '🐍',
    json: '📋',
    md: '📝',
    html: '🌐',
    css: '🎨',
    sh: '⚙',
    txt: '📄',
    png: '🖼',
    jpg: '🖼',
    jpeg: '🖼',
    svg: '🎭',
    yaml: '⚙',
    yml: '⚙',
    rs: '🦀',
  };

  return icons[extension] || '📄';
}

export function FilesPanel() {
  const actions = useControlCenterActions();
  const files = useFilesState();
  const shell = useShellState();
  const [focusedPath, setFocusedPath] = useState<string | null>(null);
  const [confirmDeletePath, setConfirmDeletePath] = useState<string | null>(null);
  const itemRefs = useRef<Record<string, HTMLButtonElement | null>>({});

  const treeMetadata = useMemo(() => {
    const indexByPath = new Map<string, number>();
    const parentByPath = new Map<string, string | null>();

    files.fileTree.forEach((node, index) => {
      indexByPath.set(node.path, index);
      let parentPath: string | null = null;
      for (let cursor = index - 1; cursor >= 0; cursor -= 1) {
        const candidate = files.fileTree[cursor];
        if (!candidate) continue;
        if (candidate.depth < node.depth) {
          parentPath = candidate.path;
          break;
        }
      }
      parentByPath.set(node.path, parentPath);
    });

    return { indexByPath, parentByPath };
  }, [files.fileTree]);

  useEffect(() => {
    if (files.fileTree.length === 0) {
      setFocusedPath(null);
      return;
    }

    const selectedNode = files.fileTree.find((node) => node.selected);
    const preferredPath = selectedNode?.path || files.currentFilePath || files.fileTree[0]?.path;
    setFocusedPath((current) => {
      if (current && treeMetadata.indexByPath.has(current)) {
        return current;
      }
      return preferredPath ?? null;
    });
  }, [files.currentFilePath, files.fileTree, treeMetadata.indexByPath]);

  useEffect(() => {
    if (!focusedPath) return;
    itemRefs.current[focusedPath]?.focus();
  }, [focusedPath]);

  const moveFocusToIndex = (index: number) => {
    const target = files.fileTree[index];
    if (!target) return;
    setFocusedPath(target.path);
  };

  const handleTreeAction = (node: FileTreeNode) => {
    setFocusedPath(node.path);
    if (node.type === 'directory') {
      void actions.files.toggleDirectory(node.path);
      return;
    }
    void actions.files.openFile(node.path, node.name);
  };

  const handleTreeKeyDown = (event: React.KeyboardEvent<HTMLButtonElement>, node: FileTreeNode) => {
    const currentIndex = treeMetadata.indexByPath.get(node.path);
    if (currentIndex == null) return;

    switch (event.key) {
      case 'ArrowDown':
        event.preventDefault();
        moveFocusToIndex(Math.min(currentIndex + 1, files.fileTree.length - 1));
        return;
      case 'ArrowUp':
        event.preventDefault();
        moveFocusToIndex(Math.max(currentIndex - 1, 0));
        return;
      case 'Home':
        event.preventDefault();
        moveFocusToIndex(0);
        return;
      case 'End':
        event.preventDefault();
        moveFocusToIndex(files.fileTree.length - 1);
        return;
      case 'ArrowRight':
        event.preventDefault();
        if (node.type === 'directory') {
          if (!node.expanded) {
            void actions.files.toggleDirectory(node.path);
            return;
          }
          const nextNode = files.fileTree[currentIndex + 1];
          if (nextNode && nextNode.depth > node.depth) {
            setFocusedPath(nextNode.path);
            return;
          }
        } else {
          void actions.files.openFile(node.path, node.name);
        }
        return;
      case 'ArrowLeft':
        event.preventDefault();
        if (node.type === 'directory' && node.expanded) {
          void actions.files.toggleDirectory(node.path);
          return;
        }
        {
          const parentPath = treeMetadata.parentByPath.get(node.path);
          if (parentPath) {
            setFocusedPath(parentPath);
          }
        }
        return;
      case 'Enter':
      case ' ':
        event.preventDefault();
        handleTreeAction(node);
        return;
      default:
        return;
    }
  };

  return (
    <div className={`panel${shell.activeTab === 'files' ? ' active' : ''}`} id="panel-files">
      <div id="files-panel">
        <div className="files-toolbar">
          <input
            type="text"
            className="files-path"
            id="files-path"
            name="files-path"
            value={files.fileBrowserPath}
            placeholder="/path/to/browse"
            autoComplete="off"
            autoCorrect="off"
            autoCapitalize="none"
            spellCheck={false}
            onChange={(event) => actions.files.setFilesPath(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                void actions.files.browseFiles(files.fileBrowserPath);
              }
            }}
          />
          <button
            type="button"
            className="btn-sm btn-primary"
            id="btn-browse"
            onClick={() => actions.files.browseFiles(files.fileBrowserPath)}
          >
            Browse
          </button>
          <button
            type="button"
            className="btn-sm btn-outline"
            id="btn-new-file"
            onClick={actions.files.createFile}
          >
            ＋ File
          </button>
          <button
            type="button"
            className="btn-sm btn-outline"
            id="btn-new-dir"
            onClick={actions.files.createDirectory}
          >
            ＋ Folder
          </button>
        </div>

        <div id="files-breadcrumb">
          {files.fileBreadcrumb.map((segment, index) => (
            <span key={`${segment.path}-${index}`}>
              <button
                type="button"
                className={`files-crumb${index === files.fileBreadcrumb.length - 1 ? ' active' : ''}`}
                onClick={() => actions.files.browseFiles(segment.path)}
              >
                {segment.label}
              </button>
              {index < files.fileBreadcrumb.length - 1 ? (
                <span className="files-crumb-sep">›</span>
              ) : null}
            </span>
          ))}
        </div>

        <div id="files-split">
          <div id="file-tree" role="tree" aria-label="Workspace files">
            {files.fileLoading ? (
              <div className="loading">
                <Skeleton lines={4} />
                <div>Loading directory…</div>
              </div>
            ) : files.fileError ? (
              <div className="panel-error">Could not read directory: {files.fileError}</div>
            ) : files.fileTree.length === 0 ? (
              <div className="file-tree-empty">
                Files will appear here when you open a workspace or thread.
              </div>
            ) : (
              files.fileTree.map((node) => {
                const isDirectory = node.type === 'directory';
                const isFocused = focusedPath === node.path;
                return (
                  <button
                    ref={(element) => {
                      itemRefs.current[node.path] = element;
                    }}
                    type="button"
                    key={node.path}
                    role="treeitem"
                    aria-expanded={isDirectory ? Boolean(node.expanded) : undefined}
                    aria-level={node.depth + 1}
                    tabIndex={isFocused ? 0 : -1}
                    className={`file-entry${isDirectory ? ' file-entry-dir' : ''}${node.selected ? ' selected' : ''}`}
                    style={{ paddingLeft: `${12 + node.depth * 16}px` }}
                    data-path={node.path}
                    onClick={() => handleTreeAction(node)}
                    onFocus={() => setFocusedPath(node.path)}
                    onKeyDown={(event) => handleTreeKeyDown(event, node)}
                  >
                    {isDirectory ? (
                      <span className="file-entry-toggle">{node.expanded ? '▾' : '▸'}</span>
                    ) : (
                      <span className="file-entry-spacer" />
                    )}
                    <span className="file-icon">
                      {getFileIcon(node.name, node.type, node.isRoot)}
                    </span>
                    <span className="file-name">{node.name}</span>
                  </button>
                );
              })
            )}
          </div>

          <div id="file-editor-wrap">
            <div id="file-editor-bar">
              <span id="file-editor-name">{files.fileEditorName}</span>
              {files.fileMetadata ? (
                <div className="file-meta-strip">
                  {typeof files.fileMetadata.size === 'number' ? (
                    <span>{files.fileMetadata.size} B</span>
                  ) : null}
                  {files.fileMetadata.modifiedAt ? (
                    <span>{formatTimestamp(files.fileMetadata.modifiedAt)}</span>
                  ) : null}
                  {files.fileMetadata.readOnly ? <span>Read only</span> : null}
                </div>
              ) : null}
              {files.currentFilePath ? (
                <>
                  <button
                    type="button"
                    className="btn-sm btn-outline"
                    onClick={() =>
                      actions.files.openInputModal({
                        title: 'Copy File',
                        label: 'Destination path',
                        placeholder: `${files.currentFilePath}.copy`,
                        defaultValue: `${files.currentFilePath}.copy`,
                        confirmLabel: 'Copy',
                        onConfirm: (destination) => {
                          void actions.files.copyPath(files.currentFilePath!, destination);
                        },
                      })
                    }
                  >
                    Copy
                  </button>
                  <button
                    type="button"
                    className="btn-sm btn-outline danger"
                    onClick={() => setConfirmDeletePath(files.currentFilePath)}
                  >
                    Remove
                  </button>
                </>
              ) : null}
              <button
                type="button"
                className="btn-sm btn-primary"
                id="btn-save-file"
                disabled={!files.currentFilePath || files.fileEditorReadOnly}
                onClick={() => actions.files.saveFile()}
              >
                Save
              </button>
            </div>
            <textarea
              id="file-editor"
              name="file-editor"
              placeholder="Select a file to view or edit it…"
              readOnly={files.fileEditorReadOnly}
              autoComplete="off"
              autoCorrect="off"
              autoCapitalize="none"
              spellCheck={false}
              value={files.fileEditorContent}
              onChange={(event) => actions.files.setEditorContent(event.target.value)}
            />
          </div>
        </div>
      </div>
      <Modal
        isOpen={Boolean(confirmDeletePath)}
        onClose={() => setConfirmDeletePath(null)}
        role="alertdialog"
        layer="dialog"
        ariaLabelledBy="delete-file-title"
      >
        <div className="confirm-modal">
          <div className="confirm-modal-title" id="delete-file-title">
            Remove file
          </div>
          <div className="confirm-modal-body">
            Are you sure you want to remove <code>{confirmDeletePath}</code>?
          </div>
          <div className="confirm-modal-actions">
            <button
              type="button"
              className="btn-sm btn-outline danger"
              onClick={() => {
                if (confirmDeletePath) {
                  void actions.files.removePath(confirmDeletePath);
                }
                setConfirmDeletePath(null);
              }}
            >
              Remove
            </button>
            <button
              type="button"
              className="btn-sm btn-primary"
              onClick={() => setConfirmDeletePath(null)}
            >
              Cancel
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
