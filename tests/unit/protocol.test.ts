import { describe, expect, it } from 'vitest';
import {
  OFFICIAL_CONFIG_FIELDS,
  OFFICIAL_NOTIFICATION_METHODS,
  OFFICIAL_REQUEST_METHODS,
  OFFICIAL_SERVER_REQUEST_METHODS,
  REQUEST_COMPATIBILITY_MAP,
  buildProtocolCoverage,
  createAvailabilityMap,
} from '../../src/lib/codex-runtime/protocol';

describe('protocol coverage helpers', () => {
  it('builds coverage against the official method sets', () => {
    const coverage = buildProtocolCoverage({
      requests: ['thread/start', 'thread/list', 'account/login/start'],
      notifications: ['thread/started', 'turn/completed'],
      serverRequests: ['item/commandExecution/requestApproval'],
    });

    expect(coverage.requests.total).toBe(OFFICIAL_REQUEST_METHODS.length);
    expect(coverage.notifications.total).toBe(OFFICIAL_NOTIFICATION_METHODS.length);
    expect(coverage.serverRequests.total).toBe(OFFICIAL_SERVER_REQUEST_METHODS.length);
    expect(coverage.requests.implemented).toBe(3);
    expect(coverage.notifications.implemented).toBe(2);
    expect(coverage.serverRequests.implemented).toBe(1);
    expect(coverage.requests.missing).toContain('thread/read');
  });

  it('creates an unknown availability map for every official method', () => {
    const availability = createAvailabilityMap(OFFICIAL_REQUEST_METHODS);

    expect(availability['thread/start']).toBe('unknown');
    expect(Object.keys(availability)).toHaveLength(OFFICIAL_REQUEST_METHODS.length);
    expect(REQUEST_COMPATIBILITY_MAP['account/login/start']).toContain('loginAccount');
  });

  it('includes docs-driven overrides and config schema metadata', () => {
    expect(OFFICIAL_REQUEST_METHODS).toContain('collaborationMode/list');
    expect(OFFICIAL_REQUEST_METHODS).toContain('mcpServer/tool/call');
    expect(OFFICIAL_REQUEST_METHODS).toContain('thread/inject_items');
    expect(OFFICIAL_NOTIFICATION_METHODS).toContain('thread/realtime/transcript/delta');
    expect(OFFICIAL_NOTIFICATION_METHODS).toContain('thread/realtime/transcript/done');
    expect(OFFICIAL_NOTIFICATION_METHODS).not.toContain('thread/realtime/transcriptUpdated');
    expect(OFFICIAL_CONFIG_FIELDS.approval_policy?.enumValues).toContain('on-request');
    expect(OFFICIAL_CONFIG_FIELDS.approvals_reviewer?.enumValues).toContain('guardian_subagent');
  });
});
