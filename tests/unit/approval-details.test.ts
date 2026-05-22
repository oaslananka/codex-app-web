import { describe, expect, it } from 'vitest';
import { buildApprovalDetailSections } from '../../src/components/codex/approval-details';
import type { ApprovalRequestState } from '../../src/lib/codex-runtime/types';

function createRequest(overrides: Partial<ApprovalRequestState> = {}): ApprovalRequestState {
  return {
    requestId: 'approval-1',
    method: 'item/commandExecution/requestApproval',
    variant: 'command',
    title: 'Command approval required',
    badge: 'COMMAND',
    detail: 'npm publish',
    confirmLabel: 'Approve',
    denyLabel: 'Deny',
    ...overrides,
  };
}

describe('buildApprovalDetailSections', () => {
  it('renders advanced approval payloads into structured sections instead of raw blobs', () => {
    const sections = buildApprovalDetailSections(
      createRequest({
        availableDecisions: [
          'accept',
          'acceptForSession',
          { applyNetworkPolicyAmendment: { host: 'registry.npmjs.org', mode: 'allow' } },
        ],
        commandActions: [{ kind: 'network', value: 'registry.npmjs.org' }],
        additionalPermissions: { network: { mode: 'open' } },
        proposedExecpolicyAmendment: { mode: 'allow', reason: 'publish workflow' },
        proposedNetworkPolicyAmendments: [{ host: 'registry.npmjs.org', mode: 'allow' }],
      }),
    );

    expect(sections).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ title: 'Command actions' }),
        expect.objectContaining({ title: 'Available decisions' }),
        expect.objectContaining({ title: 'Additional permissions' }),
        expect.objectContaining({ title: 'Exec policy amendment' }),
        expect.objectContaining({ title: 'Network policy amendments' }),
      ]),
    );

    const decisionsSection = sections.find((section) => section.title === 'Available decisions');
    expect(decisionsSection?.items).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ value: 'Accept' }),
        expect.objectContaining({ value: 'Accept for session' }),
        expect.objectContaining({ value: 'Apply network policy amendment' }),
      ]),
    );

    const networkAmendmentsSection = sections.find(
      (section) => section.title === 'Network policy amendments',
    );
    expect(networkAmendmentsSection?.items).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ label: 'Amendment 1 host', value: 'registry.npmjs.org' }),
        expect.objectContaining({ label: 'Amendment 1 mode', value: 'allow' }),
      ]),
    );
  });

  it('returns an empty list when no request is active', () => {
    expect(buildApprovalDetailSections(null)).toEqual([]);
  });
});
