import { useEffect, useMemo, useRef, useState } from 'react';
import type { ThreadSummary } from '../../lib/codex-ui-runtime';
import { sanitizeBackendThreadId } from '../../lib/codex-runtime/thread-ids';

const THREAD_ORDER_STORAGE_KEY = 'codex-ui.thread-order.v1';

type SidebarProps = {
  activeFilter: string;
  activeThreadId: string | null;
  isOpen: boolean;
  onArchiveThread: (threadId: string, isArchived?: boolean) => void;
  onClose: () => void;
  onFilterChange: (filter: string) => void;
  onForkThread: (threadId: string) => void;
  onNewThread: () => void;
  onRefreshThreads: () => void;
  onSearchChange: (searchTerm: string) => void;
  onSelectThread: (threadId: string) => void;
  searchTerm: string;
  threads: ThreadSummary[];
};

function readThreadOrder() {
  if (typeof window === 'undefined') return [];
  try {
    const raw = window.localStorage.getItem(THREAD_ORDER_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed)
      ? parsed.filter((value): value is string => typeof value === 'string')
      : [];
  } catch {
    return [];
  }
}

function formatTimeAgo(iso?: string | number) {
  if (!iso) return '';

  let timestamp: Date;
  if (typeof iso === 'number') {
    timestamp = new Date(iso < 1e12 ? iso * 1000 : iso);
  } else if (/^\d+$/.test(String(iso).trim())) {
    const numeric = Number(iso);
    timestamp = new Date(numeric < 1e12 ? numeric * 1000 : numeric);
  } else {
    timestamp = new Date(iso);
  }

  const diff = Date.now() - timestamp.getTime();
  if (diff < 60_000) return 'just now';
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h ago`;
  return `${Math.floor(diff / 86_400_000)}d ago`;
}

function getThreadStatus(status?: ThreadSummary['status']) {
  if (status?.type === 'active') {
    if (status.activeFlags?.includes('waitingOnApproval')) {
      return { className: 'ts-active', label: 'APPROVAL' };
    }

    if (status.activeFlags?.includes('waitingOnUserInput')) {
      return { className: 'ts-active', label: 'WAITING' };
    }

    return { className: 'ts-active', label: 'ACTIVE' };
  }

  if (status?.type === 'systemError') {
    return { className: 'ts-error', label: 'ERROR' };
  }

  return { className: 'ts-idle', label: 'IDLE' };
}

function reorderItems(order: string[], sourceId: string, targetId: string) {
  const nextOrder = [...order];
  const sourceIndex = nextOrder.indexOf(sourceId);
  const targetIndex = nextOrder.indexOf(targetId);
  if (sourceIndex === -1 || targetIndex === -1 || sourceIndex === targetIndex) {
    return order;
  }

  const [removed] = nextOrder.splice(sourceIndex, 1);
  if (!removed) return order;
  nextOrder.splice(targetIndex, 0, removed);
  return nextOrder;
}

function moveItem(order: string[], id: string, direction: -1 | 1) {
  const currentIndex = order.indexOf(id);
  if (currentIndex === -1) return order;
  const nextIndex = currentIndex + direction;
  if (nextIndex < 0 || nextIndex >= order.length) return order;

  const nextOrder = [...order];
  const [removed] = nextOrder.splice(currentIndex, 1);
  if (!removed) return order;
  nextOrder.splice(nextIndex, 0, removed);
  return nextOrder;
}

export function Sidebar({
  activeFilter,
  activeThreadId,
  isOpen,
  onArchiveThread,
  onClose,
  onFilterChange,
  onForkThread,
  onNewThread,
  onRefreshThreads,
  onSearchChange,
  onSelectThread,
  searchTerm,
  threads,
}: SidebarProps) {
  const [threadOrder, setThreadOrder] = useState<string[]>([]);
  const [draggedThreadId, setDraggedThreadId] = useState<string | null>(null);
  const [liveMessage, setLiveMessage] = useState('');
  const [isMobileViewport, setIsMobileViewport] = useState(false);
  const sidebarRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    setThreadOrder(readThreadOrder());
  }, []);

  useEffect(() => {
    setThreadOrder((current) => {
      const incomingIds = threads.map((thread) => thread.id);
      const newIds = incomingIds.filter((id) => !current.includes(id));
      const preserved = current.filter((id) => !newIds.includes(id));
      return [...newIds, ...preserved];
    });
  }, [threads]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const timer = window.setTimeout(() => {
      window.localStorage.setItem(THREAD_ORDER_STORAGE_KEY, JSON.stringify(threadOrder));
    }, 300);
    return () => {
      window.clearTimeout(timer);
    };
  }, [threadOrder]);

  useEffect(() => {
    if (typeof window === 'undefined') return;

    const mediaQuery = window.matchMedia('(max-width: 768px)');
    const updateViewportState = () => setIsMobileViewport(mediaQuery.matches);
    updateViewportState();

    mediaQuery.addEventListener('change', updateViewportState);
    return () => {
      mediaQuery.removeEventListener('change', updateViewportState);
    };
  }, []);

  useEffect(() => {
    const sidebar = sidebarRef.current;
    if (!sidebar) return;

    const shouldHideSidebar = isMobileViewport && !isOpen;
    if (shouldHideSidebar) {
      sidebar.setAttribute('aria-hidden', 'true');
      sidebar.setAttribute('inert', '');
      const activeElement = document.activeElement;
      if (activeElement instanceof HTMLElement && sidebar.contains(activeElement)) {
        activeElement.blur();
      }
      return;
    }

    sidebar.removeAttribute('aria-hidden');
    sidebar.removeAttribute('inert');
  }, [isMobileViewport, isOpen]);

  const orderedThreads = useMemo(() => {
    const rank = new Map(threadOrder.map((id, index) => [id, index]));
    return [...threads].sort((left, right) => {
      const leftRank = rank.get(left.id) ?? Number.MAX_SAFE_INTEGER;
      const rightRank = rank.get(right.id) ?? Number.MAX_SAFE_INTEGER;
      return leftRank - rightRank;
    });
  }, [threadOrder, threads]);

  const announceMove = (threadId: string, direction: 'up' | 'down') => {
    const thread = orderedThreads.find((item) => item.id === threadId);
    const title = thread?.title || thread?.name || 'Untitled thread';
    setLiveMessage(`Moved ${title} ${direction}.`);
  };

  const renderThreadItem = (thread: ThreadSummary, index: number) => {
    const status = getThreadStatus(thread.status);
    const hasBackendThreadId = Boolean(sanitizeBackendThreadId(thread.id));
    const title = thread.title || thread.name || 'Untitled Thread';
    const renderKey =
      thread.id || `thread-${thread.createdAt || thread.updatedAt || title}-${index}`;

    return (
      <div
        key={renderKey}
        className={`thread-item${thread.id === activeThreadId ? ' active' : ''}`}
        data-id={thread.id}
        role="button"
        tabIndex={0}
        draggable
        aria-selected={thread.id === activeThreadId}
        aria-label={`Thread: ${title}, Status: ${status.label}`}
        onClick={() => onSelectThread(thread.id)}
        onDragStart={() => setDraggedThreadId(thread.id)}
        onDragEnd={() => setDraggedThreadId(null)}
        onDragOver={(event) => event.preventDefault()}
        onDrop={(event) => {
          event.preventDefault();
          if (!draggedThreadId || draggedThreadId === thread.id) return;
          setThreadOrder((current) => reorderItems(current, draggedThreadId, thread.id));
          setDraggedThreadId(null);
        }}
        onKeyDown={(event) => {
          if (event.altKey && event.key === 'ArrowUp') {
            event.preventDefault();
            setThreadOrder((current) => moveItem(current, thread.id, -1));
            announceMove(thread.id, 'up');
            return;
          }

          if (event.altKey && event.key === 'ArrowDown') {
            event.preventDefault();
            setThreadOrder((current) => moveItem(current, thread.id, 1));
            announceMove(thread.id, 'down');
            return;
          }

          if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault();
            onSelectThread(thread.id);
          }
        }}
      >
        <div className="thread-item-name">{title}</div>
        <div className="thread-item-meta">
          <span className={`thread-status ${status.className}`}>{status.label}</span>
          <span className="thread-time">{formatTimeAgo(thread.createdAt)}</span>
        </div>
        <div className="thread-actions">
          <button
            type="button"
            className="thread-action-btn"
            data-action="archive"
            title={thread.archived ? 'Unarchive' : 'Archive'}
            disabled={!hasBackendThreadId}
            onClick={(event) => {
              event.stopPropagation();
              onArchiveThread(thread.id, thread.archived);
            }}
          >
            {thread.archived ? '↑' : '⊘'}
          </button>
          <button
            type="button"
            className="thread-action-btn"
            data-action="fork"
            title="Fork"
            disabled={!hasBackendThreadId}
            onClick={(event) => {
              event.stopPropagation();
              onForkThread(thread.id);
            }}
          >
            ⑂
          </button>
        </div>
      </div>
    );
  };

  return (
    <>
      <div
        id="sidebar-overlay"
        className={isOpen ? 'visible' : ''}
        onClick={onClose}
        role="presentation"
        aria-hidden="true"
      />

      <nav id="sidebar" ref={sidebarRef} className={isOpen ? 'open' : ''} aria-label="Thread list">
        <div className="sr-only" aria-live="polite">
          {liveMessage}
        </div>
        <div className="sidebar-top">
          <button
            type="button"
            className="btn-new-thread"
            id="btn-new-thread"
            aria-label="Start a new thread"
            onClick={onNewThread}
          >
            <span>＋</span> New Thread
          </button>
          <button
            type="button"
            className="btn-icon"
            id="btn-refresh-threads"
            title="Refresh threads"
            onClick={onRefreshThreads}
          >
            ↻
          </button>
        </div>
        <div className="search-wrap">
          <input
            type="text"
            id="thread-search"
            name="thread-search"
            placeholder="Search threads…"
            autoComplete="off"
            autoCorrect="off"
            autoCapitalize="none"
            spellCheck={false}
            data-lpignore="true"
            data-1p-ignore="true"
            value={searchTerm}
            onChange={(event) => onSearchChange(event.target.value)}
          />
        </div>
        <div className="thread-filter">
          <button
            type="button"
            className={`thread-filter-btn${activeFilter === 'active' ? ' active' : ''}`}
            data-filter="active"
            onClick={() => onFilterChange('active')}
          >
            Active
          </button>
          <button
            type="button"
            className={`thread-filter-btn${activeFilter === 'all' ? ' active' : ''}`}
            data-filter="all"
            onClick={() => onFilterChange('all')}
          >
            All
          </button>
          <button
            type="button"
            className={`thread-filter-btn${activeFilter === 'archived' ? ' active' : ''}`}
            data-filter="archived"
            onClick={() => onFilterChange('archived')}
          >
            Archived
          </button>
        </div>
        <div id="thread-list">
          {orderedThreads.length === 0 ? (
            <div className="thread-empty">
              No threads yet.
              <br />
              Start a new session above.
            </div>
          ) : (
            <>{orderedThreads.map((thread, index) => renderThreadItem(thread, index))}</>
          )}
        </div>
      </nav>
    </>
  );
}
