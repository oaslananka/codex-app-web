import type { RuntimeStore } from '../store';
import type { ApprovalQuestion, ApprovalRequestState } from '../types';
import { createBrowserLogger } from '../../logging/browser-logger';

type Resolver = {
  resolve: (value: unknown) => void;
  reject: (error: unknown) => void;
};

type ResolveValues = {
  text?: string;
  answers?: Record<string, string[]>;
  accessToken?: string;
  chatgptAccountId?: string;
  chatgptPlanType?: string;
};

const logger = createBrowserLogger('runtime:approval');

function asRecord(value: unknown) {
  return value && typeof value === 'object' ? (value as Record<string, unknown>) : {};
}

function asArray<T = unknown>(value: unknown): T[] {
  return Array.isArray(value) ? (value as T[]) : [];
}

function stringifyPayload(payload: Record<string, unknown>) {
  return JSON.stringify(payload, null, 2);
}

function mapQuestions(rawQuestions: unknown): ApprovalQuestion[] {
  return asArray(rawQuestions).map((question) => {
    const item = asRecord(question);
    return {
      id: String(item.id ?? crypto.randomUUID()),
      header: typeof item.header === 'string' ? item.header : undefined,
      question: String(item.question ?? ''),
      required: typeof item.required === 'boolean' ? item.required : true,
      type: Array.isArray(item.options) && item.options.length > 0 ? 'select' : 'text',
      isOther: Boolean(item.isOther),
      isSecret: Boolean(item.isSecret),
      options: Array.isArray(item.options)
        ? item.options
            .map((option) => {
              const value = asRecord(option);
              if (typeof value.label !== 'string') return null;
              return {
                label: value.label,
                description: typeof value.description === 'string' ? value.description : undefined,
              };
            })
            .filter((option): option is NonNullable<typeof option> => Boolean(option))
        : undefined,
    };
  });
}

function mapDecisionMetadata(payload: Record<string, unknown>) {
  return {
    availableDecisions: asArray(payload.availableDecisions),
    commandActions: asArray(payload.commandActions).map((action) => asRecord(action)),
    networkApprovalContext: payload.networkApprovalContext
      ? asRecord(payload.networkApprovalContext)
      : null,
    additionalPermissions: payload.additionalPermissions
      ? (asRecord(payload.additionalPermissions) as ApprovalRequestState['additionalPermissions'])
      : null,
    proposedExecpolicyAmendment: payload.proposedExecpolicyAmendment
      ? asRecord(payload.proposedExecpolicyAmendment)
      : null,
    proposedNetworkPolicyAmendments: asArray(payload.proposedNetworkPolicyAmendments).map(
      (amendment) => asRecord(amendment),
    ),
  };
}

function resolveAlternateLabel(availableDecisions: unknown[]) {
  if (availableDecisions.some((decision) => isDecisionKind(decision, 'acceptForSession'))) {
    return 'Approve session';
  }

  if (
    availableDecisions.some(
      (decision) =>
        decision &&
        typeof decision === 'object' &&
        ('acceptWithExecpolicyAmendment' in decision || 'applyNetworkPolicyAmendment' in decision),
    )
  ) {
    return 'Apply suggested policy';
  }

  return undefined;
}

function isDecisionKind(
  decision: unknown,
  kind: 'accept' | 'acceptForSession' | 'decline' | 'cancel',
) {
  return typeof decision === 'string' && decision === kind;
}

function pickDecision(
  availableDecisions: unknown[] | undefined,
  action: 'confirm' | 'alternate' | 'deny',
) {
  if (!availableDecisions?.length) {
    if (action === 'alternate') return 'acceptForSession';
    if (action === 'deny') return 'decline';
    return 'accept';
  }

  const fallback = availableDecisions[0];
  if (action === 'deny') {
    return (
      availableDecisions.find((decision) => isDecisionKind(decision, 'decline')) ??
      availableDecisions.find((decision) => isDecisionKind(decision, 'cancel')) ??
      'decline'
    );
  }

  if (action === 'alternate') {
    return (
      availableDecisions.find((decision) => isDecisionKind(decision, 'acceptForSession')) ??
      availableDecisions.find(
        (decision) =>
          decision &&
          typeof decision === 'object' &&
          ('acceptWithExecpolicyAmendment' in decision ||
            'applyNetworkPolicyAmendment' in decision),
      ) ??
      fallback
    );
  }

  return (
    availableDecisions.find((decision) => isDecisionKind(decision, 'accept')) ??
    availableDecisions.find((decision) => !isDecisionKind(decision, 'decline')) ??
    fallback
  );
}

export class ApprovalService {
  private resolver: Resolver | null = null;

  constructor(private readonly store: RuntimeStore) {}

  async requestApproval(method: string, payload: Record<string, unknown>) {
    const request = this.mapRequest(method, payload);
    logger.info('Approval requested', {
      method,
      variant: request.variant,
      requestId: request.requestId,
    });
    this.store.patch({ activeApprovalRequest: request });

    try {
      return await new Promise<unknown>((resolve, reject) => {
        this.resolver = { resolve, reject };
      });
    } finally {
      this.resolver = null;
      this.store.patch({ activeApprovalRequest: null });
    }
  }

  resolveApproval(action: 'confirm' | 'alternate' | 'deny', values: ResolveValues) {
    const request = this.store.getState().activeApprovalRequest;
    if (!request || !this.resolver) return;
    logger.info('Approval resolved', {
      action,
      method: request.method,
      variant: request.variant,
      requestId: request.requestId,
    });
    this.resolver.resolve(this.buildResponse(request, action, values));
    this.store.patch({ activeApprovalRequest: null });
  }

  dismissApproval() {
    if (!this.resolver) return;
    logger.warn('Approval dismissed by user');
    this.resolver.reject(new Error('Approval dismissed'));
    this.resolver = null;
    this.store.patch({ activeApprovalRequest: null });
  }

  cancelPending(reason = 'Approval cancelled') {
    if (!this.resolver) return;
    logger.warn('Approval cancelled due to runtime state change', { reason });
    this.resolver.reject(new Error(reason));
    this.resolver = null;
    this.store.patch({ activeApprovalRequest: null });
  }

  private buildResponse(
    request: ApprovalRequestState,
    action: 'confirm' | 'alternate' | 'deny',
    values: ResolveValues,
  ) {
    if (
      request.variant === 'command' ||
      request.variant === 'file' ||
      request.variant === 'patch' ||
      request.variant === 'tool-call'
    ) {
      return { decision: pickDecision(request.availableDecisions, action) };
    }

    if (request.variant === 'permissions') {
      return action === 'deny'
        ? { permissions: {}, scope: 'turn' }
        : {
            permissions: request.requestedPermissions ?? {},
            scope: action === 'alternate' ? 'session' : 'turn',
          };
    }

    if (request.variant === 'user-input') {
      return {
        answers: Object.fromEntries(
          Object.entries(values.answers ?? {}).map(([key, answer]) => [key, { answers: answer }]),
        ),
      };
    }

    if (request.variant === 'mcp') {
      return action === 'deny' ? { cancelled: true } : { response: values.text ?? '' };
    }

    if (request.variant === 'auth-refresh') {
      return {
        accessToken: values.accessToken ?? '',
        chatgptAccountId: values.chatgptAccountId ?? '',
        chatgptPlanType: values.chatgptPlanType ?? null,
      };
    }

    return { cancelled: true };
  }

  private mapRequest(method: string, payload: Record<string, unknown>): ApprovalRequestState {
    switch (method) {
      case 'item/commandExecution/requestApproval':
      case 'execCommandApproval': {
        const decisionMetadata = mapDecisionMetadata(payload);
        return {
          requestId: String(payload.approvalId ?? payload.itemId ?? crypto.randomUUID()),
          method,
          variant: 'command',
          title: 'Command approval required',
          badge: 'COMMAND',
          detail:
            typeof payload.command === 'string' && payload.command
              ? payload.command
              : stringifyPayload(payload),
          confirmLabel: 'Approve',
          alternateLabel: resolveAlternateLabel(decisionMetadata.availableDecisions),
          denyLabel: 'Deny',
          ...decisionMetadata,
        };
      }
      case 'item/fileChange/requestApproval':
      case 'applyPatchApproval': {
        const decisionMetadata = mapDecisionMetadata(payload);
        return {
          requestId: String(payload.itemId ?? crypto.randomUUID()),
          method,
          variant: method === 'applyPatchApproval' ? 'patch' : 'file',
          title: 'File change approval required',
          badge: 'FILE',
          detail: typeof payload.diff === 'string' ? payload.diff : stringifyPayload(payload),
          confirmLabel: 'Approve',
          alternateLabel: resolveAlternateLabel(decisionMetadata.availableDecisions),
          denyLabel: 'Deny',
          ...decisionMetadata,
        };
      }
      case 'item/permissions/requestApproval':
        return {
          requestId: String(payload.itemId ?? crypto.randomUUID()),
          method,
          variant: 'permissions',
          title: 'Permission grant required',
          badge: 'PERMISSIONS',
          detail: stringifyPayload(payload),
          confirmLabel: 'Grant for turn',
          alternateLabel: 'Grant for session',
          denyLabel: 'Deny',
          requestedPermissions: payload.permissions
            ? (asRecord(payload.permissions) as ApprovalRequestState['requestedPermissions'])
            : null,
        };
      case 'item/tool/requestUserInput':
        return {
          requestId: String(payload.itemId ?? crypto.randomUUID()),
          method,
          variant: 'user-input',
          title: 'Tool requires user input',
          badge: 'INPUT',
          detail: typeof payload.prompt === 'string' ? payload.prompt : stringifyPayload(payload),
          confirmLabel: 'Submit',
          denyLabel: 'Cancel',
          questions: mapQuestions(payload.questions),
        };
      case 'mcpServer/elicitation/request':
        return {
          requestId: String(payload.requestId ?? crypto.randomUUID()),
          method,
          variant: 'mcp',
          title: 'MCP server request',
          badge: 'MCP',
          detail: typeof payload.message === 'string' ? payload.message : stringifyPayload(payload),
          confirmLabel: 'Submit',
          denyLabel: 'Cancel',
          needsTextInput: true,
          textInputLabel: 'Response',
          textInputPlaceholder: 'Type your response…',
        };
      case 'item/tool/call': {
        const decisionMetadata = mapDecisionMetadata(payload);
        return {
          requestId: String(payload.itemId ?? crypto.randomUUID()),
          method,
          variant: 'tool-call',
          title: 'Client tool call request',
          badge: 'TOOL',
          detail: stringifyPayload(payload),
          confirmLabel: 'Allow',
          alternateLabel: resolveAlternateLabel(decisionMetadata.availableDecisions),
          denyLabel: 'Deny',
          ...decisionMetadata,
        };
      }
      case 'account/chatgptAuthTokens/refresh':
        return {
          requestId: String(payload.previousAccountId ?? crypto.randomUUID()),
          method,
          variant: 'auth-refresh',
          title: 'Refresh ChatGPT auth tokens',
          badge: 'AUTH',
          detail: stringifyPayload(payload),
          confirmLabel: 'Submit tokens',
          denyLabel: 'Cancel',
          authFields: true,
        };
      default:
        return {
          requestId: crypto.randomUUID(),
          method,
          variant: 'mcp',
          title: 'Unhandled approval request',
          badge: 'REQUEST',
          detail: stringifyPayload(payload),
          confirmLabel: 'Confirm',
          denyLabel: 'Cancel',
        };
    }
  }
}
