'use client';

import { type ClipboardEvent, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { getReasoningEffortsForModel } from '../../../lib/codex-runtime/reasoning';
import { sanitizeBackendThreadId } from '../../../lib/codex-runtime/thread-ids';
import type { ChatEntry, RuntimeSnapshot } from '../../../lib/codex-ui-runtime';
import { Modal } from '../../ui';
import {
  useChatState,
  useControlCenterActions,
  useShellState,
  useThreadState,
} from '../ControlCenterContext';
import type { TabName } from './types';

function escapeHtml(value: string) {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function getPlainMessageHtml(content: string) {
  return escapeHtml(content).replaceAll('\n', '<br />');
}

function isFilesystemHref(href: string | null) {
  if (!href) return false;

  return (
    href.startsWith('/home/') ||
    href.startsWith('/Users/') ||
    href.startsWith('/root/') ||
    href.startsWith('/tmp/') ||
    href.startsWith('/var/') ||
    href.startsWith('/opt/') ||
    href.startsWith('/mnt/') ||
    href.startsWith('/workspace/') ||
    href.startsWith('file://') ||
    /^[a-zA-Z]:[\\/]/.test(href)
  );
}

function stripIdeContextBlock(content: string) {
  const marker = 'My request for Codex:';
  if (!content.includes('Context from my IDE setup:')) {
    return content;
  }

  const markerIndex = content.indexOf(marker);
  if (markerIndex === -1) {
    return '';
  }

  return content.slice(markerIndex + marker.length).trim();
}

let markdownRendererPromise: Promise<(content: string) => string> | null = null;

function loadMarkdownRenderer() {
  if (!markdownRendererPromise) {
    markdownRendererPromise = Promise.all([import('marked'), import('dompurify')]).then(
      ([markedModule, domPurifyModule]) => {
        const { marked } = markedModule;
        const DOMPurify = domPurifyModule.default;

        return (content: string) => {
          const rendered = marked.parse(content, {
            async: false,
            breaks: true,
            gfm: true,
          });

          return DOMPurify.sanitize(String(rendered), {
            USE_PROFILES: { html: true },
          });
        };
      },
    );
  }

  return markdownRendererPromise;
}

function RichMessageBody({ content, isStreaming }: { content: string; isStreaming?: boolean }) {
  const [html, setHtml] = useState(() => getPlainMessageHtml(content));

  useEffect(() => {
    if (!content) {
      setHtml('');
      return;
    }

    if (isStreaming) {
      setHtml(getPlainMessageHtml(content));
      return;
    }

    let cancelled = false;
    void loadMarkdownRenderer()
      .then((renderMarkdown) => {
        if (!cancelled) {
          setHtml(renderMarkdown(content));
        }
      })
      .catch(() => {
        if (!cancelled) {
          setHtml(getPlainMessageHtml(content));
        }
      });

    return () => {
      cancelled = true;
    };
  }, [content, isStreaming]);

  return (
    <div
      className={`msg-body markdown-body${isStreaming ? ' streaming' : ''}`}
      onClick={(event) => {
        const target = event.target;
        if (!(target instanceof HTMLElement)) {
          return;
        }

        const anchor = target.closest('a');
        if (!(anchor instanceof HTMLAnchorElement)) {
          return;
        }

        const rawHref = anchor.getAttribute('href');
        if (!isFilesystemHref(rawHref)) {
          return;
        }

        event.preventDefault();
        event.stopPropagation();
      }}
      dangerouslySetInnerHTML={{ __html: html || '&hellip;' }}
    />
  );
}

function getThreadStatusCopy(
  activeThreadStatus: RuntimeSnapshot['activeThreadStatus'],
  turnActive: boolean,
) {
  if (turnActive || activeThreadStatus?.type === 'active') {
    if (activeThreadStatus?.activeFlags?.includes('waitingOnApproval')) {
      return 'Waiting for approval';
    }
    if (activeThreadStatus?.activeFlags?.includes('waitingOnUserInput')) {
      return 'Waiting for user input';
    }
    return 'Turn in progress';
  }

  if (activeThreadStatus?.type === 'systemError') return 'System error';
  return 'Ready';
}

function formatReasoningEffortLabel(value: string) {
  const labels: Record<string, string> = {
    none: 'None',
    minimal: 'Minimal',
    low: 'Low',
    medium: 'Medium',
    high: 'High',
    xhigh: 'Extra High',
  };
  return labels[value] ?? value;
}

function formatServiceTierLabel(value: string) {
  const labels: Record<string, string> = {
    fast: 'Fast',
    flex: 'Flex',
  };
  return labels[value] ?? value;
}

function formatSandboxModeLabel(value: string) {
  const labels: Record<string, string> = {
    'read-only': 'Read only',
    'workspace-write': 'Workspace write',
    'danger-full-access': 'Full access',
  };
  return labels[value] ?? value;
}

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

function getRoleLabel(entry: ChatEntry) {
  if (entry.role === 'user') return 'YOU';
  if (entry.role === 'assistant') return 'CODEX';
  if (entry.role === 'commentary') return 'COMMENTARY';
  if (entry.kind === 'tool') return 'TOOL';
  if (entry.kind === 'reasoning') return 'REASONING';
  return 'SYSTEM';
}

function getRoleClass(entry: ChatEntry) {
  if (entry.role === 'user') return 'user';
  if (entry.role === 'assistant') return 'agent';
  if (entry.role === 'commentary') return 'system';
  return 'system';
}

function getEntryStatusClass(entry: ChatEntry) {
  if (entry.status === 'running') return 'is-running';
  if (entry.status === 'error') return 'is-error';
  if (entry.status === 'waiting') return 'is-waiting';
  return 'is-done';
}

function getClipboardImageFiles(event: ClipboardEvent<HTMLTextAreaElement>) {
  const clipboardData = event.clipboardData;
  if (!clipboardData) return [] as File[];

  const files = Array.from(clipboardData.files || []).filter((file) =>
    file.type.startsWith('image/'),
  );
  if (files.length > 0) {
    return files;
  }

  return Array.from(clipboardData.items || [])
    .filter((item) => item.kind === 'file' && item.type.startsWith('image/'))
    .map((item, index) => {
      const file = item.getAsFile();
      if (!file) return null;

      const extension = file.type.split('/')[1] || 'png';
      return new File([file], file.name || `pasted-image-${Date.now()}-${index}.${extension}`, {
        type: file.type,
      });
    })
    .filter((file): file is File => file instanceof File);
}

function hasMeaningfulEntryContent(entry: ChatEntry) {
  return Boolean(entry.content.trim() || entry.attachments?.length);
}

function shouldRenderChatEntry(entry: ChatEntry, showCommentary: boolean) {
  if (!showCommentary && (entry.role === 'commentary' || entry.kind === 'reasoning')) {
    return false;
  }

  if (
    (entry.kind === 'tool' || entry.kind === 'reasoning' || entry.isCollapsible) &&
    !hasMeaningfulEntryContent(entry) &&
    entry.status !== 'running' &&
    entry.status !== 'waiting' &&
    entry.status !== 'error'
  ) {
    return false;
  }

  return true;
}

const CHAT_AUTO_SCROLL_THRESHOLD_PX = 48;

export function ThreadHeader() {
  const shell = useShellState();
  const thread = useThreadState();
  const actions = useControlCenterActions();
  const activeThread = thread.activeThread;
  const hasBackendThreadId = Boolean(sanitizeBackendThreadId(activeThread?.id));
  const [isEditing, setIsEditing] = useState(false);
  const [mobileActionsCollapsed, setMobileActionsCollapsed] = useState(false);
  const [draftName, setDraftName] = useState('');
  const [isHydrated, setIsHydrated] = useState(false);

  useEffect(() => {
    setIsHydrated(true);
  }, []);

  useEffect(() => {
    setDraftName(activeThread?.title || activeThread?.name || '');
    setIsEditing(false);
  }, [activeThread?.id, activeThread?.name, activeThread?.title]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (window.matchMedia('(max-width: 768px)').matches) {
      setMobileActionsCollapsed(true);
    }
  }, []);

  const statusCopy = getThreadStatusCopy(thread.activeThreadStatus, shell.turnActive);
  const threadTitle =
    activeThread?.title || activeThread?.name || 'Select a thread or start a new one';
  const showThreadActions = isHydrated && Boolean(activeThread);
  const threadActionsDisabled = !isHydrated || !hasBackendThreadId;

  return (
    <div id="thread-header">
      <div className="thread-header-copy">
        <span id="thread-title">{threadTitle}</span>
        {activeThread?.cwd ? <span className="thread-cwd">{activeThread.cwd}</span> : null}
      </div>

      {isEditing ? (
        <form
          className="thread-rename-form"
          onSubmit={(event) => {
            event.preventDefault();
            void actions.thread.renameThread(draftName);
            setIsEditing(false);
          }}
        >
          <input
            type="text"
            id="thread-title-edit"
            name="thread-title-edit"
            value={draftName}
            placeholder="Thread name"
            autoComplete="off"
            autoCorrect="off"
            autoCapitalize="none"
            spellCheck={false}
            onChange={(event) => setDraftName(event.target.value)}
          />
          <button type="submit" className="th-btn success">
            Save
          </button>
          <button type="button" className="th-btn" onClick={() => setIsEditing(false)}>
            Cancel
          </button>
        </form>
      ) : null}

      <div className="th-spacer" />
      <span className="thread-status-pill">{statusCopy}</span>
      <div
        className={`thread-actions-wrap${mobileActionsCollapsed ? ' is-collapsed' : ''}`}
        style={{ display: showThreadActions ? 'flex' : 'none' }}
      >
        <button
          type="button"
          className="thread-actions-toggle"
          onClick={() => setMobileActionsCollapsed((current) => !current)}
          aria-expanded={!mobileActionsCollapsed}
          aria-controls="thread-actions"
        >
          <span>Actions</span>
          <span className="thread-actions-toggle-icon">{mobileActionsCollapsed ? '▾' : '▴'}</span>
        </button>
        <div
          id="thread-actions"
          style={{
            display: showThreadActions ? 'flex' : 'none',
            gap: '6px',
            alignItems: 'center',
          }}
        >
          <button
            type="button"
            className="th-btn"
            id="btn-rename"
            disabled={threadActionsDisabled}
            onClick={() => setIsEditing(true)}
          >
            ✏ Rename
          </button>
          <button
            type="button"
            className="th-btn"
            id="btn-fork"
            disabled={threadActionsDisabled}
            onClick={() => activeThread && actions.thread.forkThread(activeThread.id)}
          >
            ⑂ Fork
          </button>
          <button
            type="button"
            className="th-btn"
            id="btn-rollback"
            disabled={threadActionsDisabled}
            onClick={() => actions.thread.rollbackThread()}
          >
            ↩ Rollback
          </button>
          <button
            type="button"
            className="th-btn"
            id="btn-compact"
            disabled={threadActionsDisabled}
            onClick={() => actions.thread.compactThread()}
          >
            ⊞ Compact
          </button>
          <button
            type="button"
            className={`th-btn${activeThread?.archived ? '' : ' danger'}`}
            id="btn-archive"
            disabled={threadActionsDisabled}
            onClick={() =>
              activeThread && actions.thread.archiveThread(activeThread.id, activeThread.archived)
            }
          >
            {activeThread?.archived ? '↑ Unarchive' : '⊘ Archive'}
          </button>
        </div>
      </div>
    </div>
  );
}

type AccountLoginBannerProps = {
  loggedIn: boolean;
  loginInProgress: boolean;
};

export function AccountLoginBanner({ loggedIn, loginInProgress }: AccountLoginBannerProps) {
  const actions = useControlCenterActions();
  const isVisible = !loggedIn || loginInProgress;
  const copy = loginInProgress
    ? 'Complete the sign-in flow in your browser to continue.'
    : 'Your Codex account is not connected. Sign in to use account, plugin, and auth features.';

  return (
    <div id="account-login-banner" className={isVisible ? 'is-visible' : ''}>
      <div className="account-login-copy" id="account-login-copy">
        {copy}
      </div>
      <div className="account-login-actions">
        <button
          type="button"
          className="btn-sm btn-primary"
          id="btn-account-login"
          onClick={actions.info.startLogin}
        >
          Sign In
        </button>
        {loginInProgress ? (
          <button
            type="button"
            className="btn-sm btn-outline"
            id="btn-account-login-cancel"
            onClick={actions.info.cancelLogin}
          >
            Cancel
          </button>
        ) : null}
      </div>
    </div>
  );
}

export function ContentTabs() {
  const shell = useShellState();
  const actions = useControlCenterActions();
  const tabs: Array<{ id: TabName; label: string }> = [
    { id: 'chat', label: 'Conversation' },
    { id: 'terminal', label: 'Terminal' },
    { id: 'files', label: 'Files' },
    { id: 'config', label: 'Config' },
    { id: 'info', label: 'Info' },
  ];

  return (
    <div id="content-tabs">
      {tabs.map((tab) => (
        <button
          key={tab.id}
          type="button"
          className={`ctab${shell.activeTab === tab.id ? ' active' : ''}`}
          data-tab={tab.id}
          onClick={() => actions.shell.setActiveTab(tab.id)}
        >
          {tab.label}
        </button>
      ))}
    </div>
  );
}

export function ChatPanel() {
  const chat = useChatState();
  const shell = useShellState();
  const thread = useThreadState();
  const actions = useControlCenterActions();
  const activeThread = thread.activeThread;
  const hasBackendThreadId = Boolean(sanitizeBackendThreadId(activeThread?.id));
  const isLocalOnlyThread = Boolean(activeThread && !hasBackendThreadId);
  const hasInterruptibleTurn = Boolean(activeThread && shell.turnActive);
  const statusCopy = getThreadStatusCopy(thread.activeThreadStatus, hasInterruptibleTurn);
  const messagesRef = useRef<HTMLDivElement | null>(null);
  const effortOptions = useMemo(
    () => getReasoningEffortsForModel(chat.models, chat.selectedModel),
    [chat.models, chat.selectedModel],
  );
  const [mobileControlsCollapsed, setMobileControlsCollapsed] = useState(false);
  const [expandedImage, setExpandedImage] = useState<{ src: string; alt: string } | null>(null);
  const [isHydrated, setIsHydrated] = useState(false);
  const autoScrollPinnedRef = useRef(true);
  const unreadMessagesRef = useRef(false);
  const [showJumpToLatest, setShowJumpToLatest] = useState(false);
  const visibleEntries = useMemo(
    () => chat.chatEntries.filter((entry) => shouldRenderChatEntry(entry, shell.showCommentary)),
    [chat.chatEntries, shell.showCommentary],
  );
  const serviceTier =
    chat.selectedServiceTier ||
    (typeof chat.configData?.service_tier === 'string' ? chat.configData.service_tier : '');
  const sandboxMode =
    chat.selectedSandboxMode ||
    (typeof chat.configData?.sandbox_mode === 'string' ? chat.configData.sandbox_mode : '');

  const setScrollState = useCallback((isPinned: boolean, hasUnreadMessages: boolean) => {
    autoScrollPinnedRef.current = isPinned;
    unreadMessagesRef.current = hasUnreadMessages;
    setShowJumpToLatest((current) => (current === hasUnreadMessages ? current : hasUnreadMessages));
  }, []);

  const scrollToBottom = useCallback(
    (behavior: ScrollBehavior = 'auto') => {
      const node = messagesRef.current;
      if (!node) return;
      node.scrollTo({ top: node.scrollHeight, behavior });
      setScrollState(true, false);
    },
    [setScrollState],
  );

  const updateScrollIntent = useCallback(() => {
    const node = messagesRef.current;
    if (!node) return true;

    const distanceFromBottom = node.scrollHeight - node.scrollTop - node.clientHeight;
    const isNearBottom = distanceFromBottom <= CHAT_AUTO_SCROLL_THRESHOLD_PX;
    setScrollState(isNearBottom, isNearBottom ? false : unreadMessagesRef.current);
    return isNearBottom;
  }, [setScrollState]);

  useEffect(() => {
    const frame = requestAnimationFrame(() => {
      scrollToBottom('auto');
    });

    return () => cancelAnimationFrame(frame);
  }, [activeThread?.id, scrollToBottom]);

  useEffect(() => {
    const node = messagesRef.current;
    let frame: number | null = null;

    if (!node) {
      return undefined;
    }

    if (autoScrollPinnedRef.current) {
      frame = requestAnimationFrame(() => {
        scrollToBottom('auto');
      });
    } else if (visibleEntries.length > 0) {
      setScrollState(false, true);
    }

    return () => {
      if (frame != null) {
        cancelAnimationFrame(frame);
      }
    };
  }, [scrollToBottom, setScrollState, visibleEntries]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (window.matchMedia('(max-width: 768px)').matches) {
      setMobileControlsCollapsed(true);
    }
  }, []);

  useEffect(() => {
    setIsHydrated(true);
  }, []);

  useEffect(() => {
    if (!expandedImage) {
      return;
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setExpandedImage(null);
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [expandedImage]);

  const handleComposerPaste = (event: ClipboardEvent<HTMLTextAreaElement>) => {
    const imageFiles = getClipboardImageFiles(event);
    if (!imageFiles.length) {
      return;
    }

    event.preventDefault();
    actions.chat.attachFiles(imageFiles);
  };

  return (
    <div
      className={`panel${shell.activeTab === 'chat' ? ' active' : ''}${!thread.activeThread ? ' is-empty-state' : ''}`}
      id="panel-chat"
    >
      <div id="connection-banner" className={shell.connectionBanner.visible ? 'is-visible' : ''}>
        <div className="connection-banner-copy">
          <div className="connection-banner-title">Codex backend connection issue</div>
          <div className="connection-banner-body" id="connection-banner-body">
            {shell.connectionBanner.message || `Target: ${shell.connectionBanner.target}`}
          </div>
        </div>
        <button
          type="button"
          className="btn-banner"
          id="btn-reconnect-banner"
          onClick={actions.chat.reconnect}
        >
          Reconnect
        </button>
      </div>

      <div id="chat-messages" ref={messagesRef} onScroll={updateScrollIntent}>
        {!thread.activeThread ? (
          <div className="empty-state">
            <div className="empty-icon">⟡</div>
            <div className="empty-title">Start a new session</div>
            <div className="empty-text">
              Write a message below to start a new thread, or pick one from the sidebar.
            </div>
          </div>
        ) : visibleEntries.length === 0 ? (
          <div className="empty-state">
            <div className="empty-icon">◎</div>
            <div className="empty-text">This thread is ready. Send your first message.</div>
          </div>
        ) : (
          visibleEntries.map((entry) => {
            const roleClass = getRoleClass(entry);
            const displayContent =
              entry.role === 'user' ? stripIdeContextBlock(entry.content || '') : entry.content;
            const header = (
              <div className="msg-header">
                <span className={`msg-role role-${roleClass}`}>
                  {entry.label || getRoleLabel(entry)}
                </span>
                {entry.title ? <span className="msg-title">{entry.title}</span> : null}
                {entry.status ? (
                  <span className={`item-status ${getEntryStatusClass(entry)}`}>
                    {entry.status.toUpperCase()}
                  </span>
                ) : null}
                {entry.createdAt ? (
                  <span className="msg-time">{formatTimestamp(entry.createdAt)}</span>
                ) : null}
              </div>
            );

            if (
              entry.kind === 'tool' ||
              entry.kind === 'reasoning' ||
              entry.kind === 'system' ||
              entry.isCollapsible
            ) {
              return (
                <details key={entry.id} className="item-card" open={entry.status === 'running'}>
                  <summary className="item-header">
                    <span
                      className={`item-type it-${
                        entry.kind === 'reasoning'
                          ? 'think'
                          : entry.kind === 'tool'
                            ? 'tool'
                            : 'file'
                      }`}
                    >
                      {entry.kind.toUpperCase()}
                    </span>
                    <span className="item-label">{entry.label || entry.title || entry.id}</span>
                    {entry.status ? (
                      <span className={`item-status ${getEntryStatusClass(entry)}`}>
                        {entry.status.toUpperCase()}
                      </span>
                    ) : null}
                  </summary>
                  <div className="item-body">{entry.content || 'No content available.'}</div>
                </details>
              );
            }

            return (
              <article key={entry.id} className={`msg role-${roleClass}`}>
                {header}
                {displayContent ? (
                  <RichMessageBody content={displayContent} isStreaming={entry.isStreaming} />
                ) : null}
                {entry.attachments?.length ? (
                  <div className="msg-attachments">
                    {entry.attachments.map((attachment, index) => (
                      <div
                        key={`${attachment.name}-${attachment.previewUrl || index}`}
                        className="msg-attachment-card"
                      >
                        {attachment.previewUrl ? (
                          <button
                            type="button"
                            className="msg-attachment-button"
                            onClick={() =>
                              setExpandedImage({
                                src: attachment.previewUrl || '',
                                alt: attachment.name,
                              })
                            }
                          >
                            <img
                              className="msg-attachment-image"
                              src={attachment.previewUrl}
                              alt={attachment.name}
                            />
                          </button>
                        ) : null}
                        <div className="msg-attachment-caption">{attachment.name}</div>
                      </div>
                    ))}
                  </div>
                ) : null}
                {!displayContent && !entry.attachments?.length ? (
                  <div className={`msg-body markdown-body${entry.isStreaming ? ' streaming' : ''}`}>
                    ...
                  </div>
                ) : null}
              </article>
            );
          })
        )}
      </div>
      <button
        type="button"
        id="btn-new-messages"
        className={showJumpToLatest ? 'visible' : ''}
        onClick={() => scrollToBottom('smooth')}
      >
        Jump to latest
      </button>

      <div id="input-area">
        <div
          className={`composer-session-controls${mobileControlsCollapsed ? ' is-collapsed' : ''}`}
        >
          <button
            type="button"
            className="session-controls-toggle"
            onClick={() => setMobileControlsCollapsed((current) => !current)}
            aria-expanded={!mobileControlsCollapsed}
            aria-controls="session-controls-body"
          >
            <span className="session-controls-toggle-copy">
              <strong>Session controls</strong>
              <span>
                {chat.selectedModel || 'default'} ·{' '}
                {chat.selectedEffort ? formatReasoningEffortLabel(chat.selectedEffort) : 'Default'}{' '}
                · {serviceTier ? formatServiceTierLabel(serviceTier) : 'Default'}
              </span>
            </span>
            <span className="session-controls-toggle-badge">{statusCopy}</span>
            <span className="session-controls-toggle-icon">
              {mobileControlsCollapsed ? '▾' : '▴'}
            </span>
          </button>

          <div id="session-controls-body" className="session-controls-body">
            <div
              className="quick-controls quick-controls--primary"
              aria-label="Quick session controls"
            >
              <label className="quick-field quick-field--mode">
                <span className="quick-label">Mode</span>
                <select
                  className="quick-select"
                  value={thread.collaborationMode}
                  onChange={(event) => actions.thread.setCollaborationMode(event.target.value)}
                >
                  {thread.collaborationModes.map((mode) => (
                    <option key={mode.id} value={mode.id} disabled={!mode.supported}>
                      {mode.label}
                    </option>
                  ))}
                </select>
              </label>
              <label className="quick-field quick-field--wide">
                <span className="quick-label">Model</span>
                <select
                  className="quick-select"
                  id="model-select"
                  name="model-select"
                  autoComplete="off"
                  value={chat.selectedModel}
                  onChange={(event) => actions.chat.selectModel(event.target.value)}
                >
                  <option value="">default</option>
                  {chat.models.map((model) => (
                    <option key={model.id} value={model.id}>
                      {model.displayName || model.id}
                    </option>
                  ))}
                </select>
              </label>
              <label className="quick-field">
                <span className="quick-label">Effort</span>
                <select
                  className="quick-select"
                  id="effort-select"
                  name="effort-select"
                  autoComplete="off"
                  value={chat.selectedEffort}
                  onChange={(event) => actions.chat.selectEffort(event.target.value)}
                >
                  <option value="">default</option>
                  {effortOptions.map((effort) => (
                    <option key={effort} value={effort}>
                      {formatReasoningEffortLabel(effort)}
                    </option>
                  ))}
                </select>
              </label>
            </div>

            <div
              className="quick-controls quick-controls--secondary"
              aria-label="Quick session controls"
            >
              <label className="quick-field">
                <span className="quick-label">Speed</span>
                <select
                  className="quick-select"
                  value={serviceTier}
                  onChange={(event) =>
                    actions.chat.changeQuickSession({ serviceTier: event.target.value })
                  }
                >
                  <option value="">Default</option>
                  <option value="fast">{formatServiceTierLabel('fast')}</option>
                  <option value="flex">{formatServiceTierLabel('flex')}</option>
                </select>
              </label>

              <label className="quick-field">
                <span className="quick-label">Access</span>
                <select
                  className="quick-select"
                  value={sandboxMode}
                  onChange={(event) =>
                    actions.chat.changeQuickSession({ sandboxMode: event.target.value })
                  }
                >
                  <option value="">Default</option>
                  <option value="read-only">{formatSandboxModeLabel('read-only')}</option>
                  <option value="workspace-write">
                    {formatSandboxModeLabel('workspace-write')}
                  </option>
                  <option value="danger-full-access">
                    {formatSandboxModeLabel('danger-full-access')}
                  </option>
                </select>
              </label>

              <span className="thread-status-inline quick-status">{statusCopy}</span>
            </div>
          </div>
        </div>

        <input
          id="chat-image-input"
          type="file"
          accept="image/png,image/jpeg,image/gif,image/webp,image/bmp,image/x-icon,image/avif"
          multiple
          hidden
          onChange={(event) => {
            if (event.target.files?.length) {
              actions.chat.attachFiles(event.target.files);
              event.target.value = '';
            }
          }}
        />

        {chat.pendingAttachments.length > 0 ? (
          <div className="composer-attachments">
            {chat.pendingAttachments.map((attachment) => (
              <div
                key={attachment.id}
                className={`attachment-chip${attachment.status === 'uploading' ? ' is-uploading' : ''}`}
              >
                {attachment.previewUrl ? (
                  <button
                    type="button"
                    className="attachment-chip-preview-button"
                    onClick={() =>
                      setExpandedImage({
                        src: attachment.previewUrl || '',
                        alt: attachment.name,
                      })
                    }
                  >
                    <img
                      className="attachment-chip-preview"
                      src={attachment.previewUrl}
                      alt={attachment.name}
                    />
                  </button>
                ) : null}
                <span className="attachment-chip-label">
                  {attachment.status === 'uploading' ? 'Uploading' : 'Image'}: {attachment.name}
                </span>
                <button
                  type="button"
                  className="attachment-chip-remove"
                  onClick={() => actions.chat.removeAttachment(attachment.id)}
                >
                  ✕
                </button>
              </div>
            ))}
          </div>
        ) : null}

        <div className="input-row">
          {isLocalOnlyThread ? (
            <div className="empty-inline">
              This local thread will continue in a new backend session when you send your next
              message.
            </div>
          ) : null}
          <div className="composer-shell">
            <button
              type="button"
              className="btn-attach"
              id="btn-attach-image"
              title="Add image"
              aria-label="Add image"
              disabled={
                !isHydrated ||
                !thread.activeThread ||
                hasInterruptibleTurn ||
                chat.attachmentUploadInProgress
              }
              onClick={actions.chat.openAttachmentPicker}
            >
              <span className="btn-attach-glyph" aria-hidden="true">
                +
              </span>
            </button>
            <textarea
              id="chat-input"
              name="chat-input"
              placeholder={
                thread.activeThread
                  ? isLocalOnlyThread
                    ? 'Write your message. A new backend thread will be created automatically.'
                    : 'Write your message. Shift+Enter adds a new line.'
                  : 'Write your message. A new thread will be created automatically.'
              }
              rows={1}
              disabled={false}
              autoComplete="off"
              autoCorrect="off"
              autoCapitalize="none"
              spellCheck={false}
              value={thread.messageDraft}
              onChange={(event) => actions.thread.setMessageDraft(event.target.value)}
              onPaste={handleComposerPaste}
              onKeyDown={(event) => {
                if (event.key === 'Enter' && !event.shiftKey) {
                  event.preventDefault();
                  if (hasInterruptibleTurn) {
                    void actions.chat.steerTurn();
                    return;
                  }
                  void actions.chat.sendMessage();
                }
              }}
            />
            <button
              type="button"
              className="btn-send"
              id="btn-send"
              title={hasInterruptibleTurn ? 'Steer current turn' : 'Send message'}
              aria-label={hasInterruptibleTurn ? 'Steer current turn' : 'Send message'}
              disabled={chat.attachmentUploadInProgress}
              onClick={() =>
                hasInterruptibleTurn ? actions.chat.steerTurn() : actions.chat.sendMessage()
              }
            >
              {hasInterruptibleTurn ? '⇢' : '➤'}
            </button>
          </div>
          {hasInterruptibleTurn ? (
            <div className="composer-secondary-actions">
              <button
                type="button"
                className="btn-interrupt"
                id="btn-interrupt"
                title="Interrupt"
                onClick={() => actions.chat.interruptTurn()}
              >
                ✕ Stop
              </button>
            </div>
          ) : null}
        </div>
      </div>
      <Modal
        isOpen={Boolean(expandedImage)}
        onClose={() => setExpandedImage(null)}
        layer="lightbox"
        panelClassName="image-lightbox-panel"
        overlayClassName="modal-overlay image-lightbox-overlay"
      >
        {expandedImage ? (
          <div className="image-lightbox">
            <img className="image-lightbox-image" src={expandedImage.src} alt={expandedImage.alt} />
            <div className="image-lightbox-caption">{expandedImage.alt}</div>
          </div>
        ) : null}
      </Modal>
    </div>
  );
}
