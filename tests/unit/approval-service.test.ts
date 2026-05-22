import { describe, expect, it } from 'vitest';
import { buildInitialState } from '../../src/lib/codex-runtime/runtime-state';
import { ApprovalService } from '../../src/lib/codex-runtime/services/approval-service';
import { RuntimeStore } from '../../src/lib/codex-runtime/store';

function createService() {
  const store = new RuntimeStore(buildInitialState());
  return {
    store,
    service: new ApprovalService(store),
  };
}

describe('ApprovalService', () => {
  it('preserves advanced command approval metadata and respects available decisions', async () => {
    const { store, service } = createService();
    const promise = service.requestApproval('item/commandExecution/requestApproval', {
      itemId: 'item-1',
      command: 'npm publish',
      availableDecisions: ['accept', 'acceptForSession', 'decline'],
      commandActions: [{ kind: 'network', value: 'registry.npmjs.org' }],
      networkApprovalContext: { hosts: ['registry.npmjs.org'] },
      additionalPermissions: { network: { mode: 'open' } },
      proposedExecpolicyAmendment: { mode: 'allow' },
    });

    expect(store.getState().activeApprovalRequest).toMatchObject({
      variant: 'command',
      alternateLabel: 'Approve session',
      commandActions: [{ kind: 'network', value: 'registry.npmjs.org' }],
      networkApprovalContext: { hosts: ['registry.npmjs.org'] },
      additionalPermissions: { network: { mode: 'open' } },
      proposedExecpolicyAmendment: { mode: 'allow' },
    });

    service.resolveApproval('alternate', {});
    await expect(promise).resolves.toEqual({ decision: 'acceptForSession' });
  });

  it('preserves advanced decision metadata for file and tool-call approvals too', async () => {
    const { store, service } = createService();

    const filePromise = service.requestApproval('item/fileChange/requestApproval', {
      itemId: 'file-1',
      diff: '--- a/file\n+++ b/file',
      availableDecisions: ['accept', 'decline'],
      proposedNetworkPolicyAmendments: [{ host: 'example.com' }],
    });

    expect(store.getState().activeApprovalRequest).toMatchObject({
      variant: 'file',
      availableDecisions: ['accept', 'decline'],
      proposedNetworkPolicyAmendments: [{ host: 'example.com' }],
    });

    service.resolveApproval('confirm', {});
    await expect(filePromise).resolves.toEqual({ decision: 'accept' });

    const toolPromise = service.requestApproval('item/tool/call', {
      itemId: 'tool-1',
      toolName: 'request_user_input',
      availableDecisions: ['acceptForSession', 'decline'],
    });

    expect(store.getState().activeApprovalRequest).toMatchObject({
      variant: 'tool-call',
      alternateLabel: 'Approve session',
      availableDecisions: ['acceptForSession', 'decline'],
    });

    service.resolveApproval('alternate', {});
    await expect(toolPromise).resolves.toEqual({ decision: 'acceptForSession' });
  });

  it('returns turn/session scoped permission grants without wildcard expansion', async () => {
    const { service } = createService();
    const requestPermissions = {
      network: { hosts: ['api.openai.com'] },
      fileSystem: { read: ['src'], write: ['tmp'] },
    };

    const oncePromise = service.requestApproval('item/permissions/requestApproval', {
      itemId: 'perm-1',
      permissions: requestPermissions,
      reason: 'Need scoped access',
    });
    service.resolveApproval('confirm', {});
    await expect(oncePromise).resolves.toEqual({
      permissions: requestPermissions,
      scope: 'turn',
    });

    const sessionPromise = service.requestApproval('item/permissions/requestApproval', {
      itemId: 'perm-2',
      permissions: requestPermissions,
      reason: 'Need scoped access',
    });
    service.resolveApproval('alternate', {});
    await expect(sessionPromise).resolves.toEqual({
      permissions: requestPermissions,
      scope: 'session',
    });
  });

  it('serializes requestUserInput answers as answer arrays', async () => {
    const { service } = createService();
    const promise = service.requestApproval('item/tool/requestUserInput', {
      itemId: 'input-1',
      questions: [
        {
          id: 'prompt',
          header: 'Prompt',
          question: 'What should we do?',
          isOther: false,
          isSecret: false,
          options: null,
        },
        {
          id: 'mode',
          header: 'Mode',
          question: 'Choose one',
          isOther: true,
          isSecret: false,
          options: [{ label: 'fast', description: 'Quick path' }],
        },
      ],
    });

    service.resolveApproval('confirm', {
      answers: {
        prompt: ['Ship it'],
        mode: ['fast', 'custom'],
      },
    });

    await expect(promise).resolves.toEqual({
      answers: {
        prompt: { answers: ['Ship it'] },
        mode: { answers: ['fast', 'custom'] },
      },
    });
  });

  it('preserves optional requestUserInput questions instead of forcing them required', async () => {
    const { store, service } = createService();
    const promise = service.requestApproval('item/tool/requestUserInput', {
      itemId: 'input-optional',
      questions: [
        {
          id: 'notes',
          question: 'Optional notes',
          required: false,
        },
      ],
    });

    expect(store.getState().activeApprovalRequest?.questions).toEqual([
      expect.objectContaining({
        id: 'notes',
        required: false,
      }),
    ]);

    service.resolveApproval('confirm', { answers: {} });
    await expect(promise).resolves.toEqual({ answers: {} });
  });

  it('rejects and clears an active approval when the transport disconnects', async () => {
    const { store, service } = createService();
    const promise = service.requestApproval('item/tool/call', {
      itemId: 'tool-1',
      toolName: 'request_user_input',
    });

    service.cancelPending('Connection lost');

    await expect(promise).rejects.toThrow('Connection lost');
    expect(store.getState().activeApprovalRequest).toBeNull();
  });
});
