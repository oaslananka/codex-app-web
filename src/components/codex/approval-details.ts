'use client';

import type { ApprovalRequestState } from '../../lib/codex-ui-runtime';

export type ApprovalDetailSection = {
  title: string;
  items: Array<{
    label: string;
    value: string;
  }>;
};

function toSentenceCase(value: string) {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

function humanizeKey(value: string) {
  const expanded = value.replace(/([a-z0-9])([A-Z])/g, '$1 $2').replaceAll('_', ' ');
  return toSentenceCase(expanded.toLowerCase());
}

function formatCodeValue(value: unknown) {
  if (value == null) return 'None';
  if (typeof value === 'string') return value;
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

function formatDecisionLabel(decision: unknown) {
  if (typeof decision === 'string') {
    return humanizeKey(decision);
  }
  if (decision && typeof decision === 'object') {
    const entries = Object.entries(decision as Record<string, unknown>);
    if (entries.length === 1) {
      const [key] = entries[0] ?? ['decision', decision];
      return humanizeKey(key);
    }
  }
  return formatCodeValue(decision);
}

function flattenRecordItems(
  title: string,
  value: Record<string, unknown> | null | undefined,
): ApprovalDetailSection | null {
  if (!value) return null;
  return {
    title,
    items: Object.entries(value).map(([label, entryValue]) => ({
      label: humanizeKey(label),
      value: formatCodeValue(entryValue),
    })),
  };
}

function flattenIndexedRecords(
  title: string,
  values: Array<Record<string, unknown>> | null | undefined,
): ApprovalDetailSection | null {
  if (!values?.length) return null;
  return {
    title,
    items: values.flatMap((value, index) =>
      Object.entries(value).map(([label, entryValue]) => ({
        label: `Amendment ${index + 1} ${label}`,
        value: formatCodeValue(entryValue),
      })),
    ),
  };
}

export function buildApprovalDetailSections(
  request: ApprovalRequestState | null,
): ApprovalDetailSection[] {
  if (!request) return [];

  const sections: ApprovalDetailSection[] = [];

  if (request.commandActions?.length) {
    sections.push({
      title: 'Command actions',
      items: request.commandActions.map((action, index) => ({
        label: action.kind ? String(action.kind) : `Action ${index + 1}`,
        value: action.value ? String(action.value) : formatCodeValue(action),
      })),
    });
  }

  if (request.availableDecisions?.length) {
    sections.push({
      title: 'Available decisions',
      items: request.availableDecisions.map((decision, index) => ({
        label: `Decision ${index + 1}`,
        value: formatDecisionLabel(decision),
      })),
    });
  }

  if (request.requestedPermissions) {
    sections.push({
      title: 'Requested permissions',
      items: Object.entries(request.requestedPermissions).map(([label, value]) => ({
        label: humanizeKey(label),
        value: formatCodeValue(value),
      })),
    });
  }

  if (request.additionalPermissions) {
    sections.push({
      title: 'Additional permissions',
      items: Object.entries(request.additionalPermissions).map(([label, value]) => ({
        label: humanizeKey(label),
        value: formatCodeValue(value),
      })),
    });
  }

  const networkContextSection = flattenRecordItems(
    'Network context',
    request.networkApprovalContext,
  );
  if (networkContextSection) {
    sections.push(networkContextSection);
  }

  const execPolicySection = flattenRecordItems(
    'Exec policy amendment',
    request.proposedExecpolicyAmendment,
  );
  if (execPolicySection) {
    sections.push(execPolicySection);
  }

  const networkPolicySection = flattenIndexedRecords(
    'Network policy amendments',
    request.proposedNetworkPolicyAmendments,
  );
  if (networkPolicySection) {
    sections.push(networkPolicySection);
  }

  return sections;
}
