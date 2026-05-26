import { renderToStaticMarkup } from 'react-dom/server';
import type { ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { Overlays } from '../../src/components/codex/Overlays';
import type { ApprovalRequestState } from '../../src/lib/codex-runtime/types';

vi.mock('../../src/components/ui', () => ({
  Modal: ({
    children,
    isOpen,
    overlayId,
  }: {
    children: ReactNode;
    isOpen: boolean;
    overlayId?: string;
  }) => (isOpen ? <div id={overlayId}>{children}</div> : null),
}));

function renderOverlays(overrides: Partial<Parameters<typeof Overlays>[0]> = {}) {
  return renderToStaticMarkup(
    <Overlays
      activeApprovalRequest={null}
      connectionTarget="ws://127.0.0.1:41000"
      logSettings={{ level: 'info', timestamps: true }}
      onCloseSettings={vi.fn()}
      onDismissApproval={vi.fn()}
      onDismissToast={vi.fn()}
      onReconnect={vi.fn()}
      onResolveApproval={vi.fn()}
      onUpdateLogSettings={vi.fn()}
      settingsOpen={false}
      toasts={[]}
      {...overrides}
    />,
  );
}

const commandApproval: ApprovalRequestState = {
  requestId: 'approval-1',
  method: 'item/commandExecution/requestApproval',
  variant: 'command',
  title: 'Command approval required',
  badge: 'COMMAND',
  detail: 'pnpm publish --dry-run',
  confirmLabel: 'Approve',
  alternateLabel: 'Approve session',
  denyLabel: 'Deny',
  availableDecisions: ['accept', 'acceptForSession', 'decline'],
  commandActions: [{ kind: 'network', value: 'registry.npmjs.org' }],
  proposedNetworkPolicyAmendments: [{ host: 'registry.npmjs.org', mode: 'allow' }],
};

describe('Overlays', () => {
  it('renders command approval metadata and decisions', () => {
    const markup = renderOverlays({ activeApprovalRequest: commandApproval });

    expect(markup).toContain('Command approval required');
    expect(markup).toContain('pnpm publish --dry-run');
    expect(markup).toContain('registry.npmjs.org');
    expect(markup).toContain('Approve session');
  });

  it('renders settings and toast overlays', () => {
    const markup = renderOverlays({
      settingsOpen: true,
      toasts: [{ id: 'toast-1', message: 'Connected to Codex backend', type: 'success' }],
    });

    expect(markup).toContain('App Settings');
    expect(markup).toContain('ws://127.0.0.1:41000');
    expect(markup).toContain('Connected to Codex backend');
  });
});
