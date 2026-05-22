import { describe, expect, it } from 'vitest';
import {
  getErrorTelemetry,
  isInitializationPendingError,
  isMethodUnavailable,
  isRolloutUnavailableError,
  normalizeError,
  RpcMethodUnavailableError,
} from '../../src/lib/codex-runtime/errors';

describe('runtime error helpers', () => {
  it('detects initialization-pending backend errors', () => {
    expect(isInitializationPendingError(new Error('Not initialized'))).toBe(true);
    expect(isInitializationPendingError({ message: 'Backend is initializing' })).toBe(true);
    expect(isInitializationPendingError(new Error('Permission denied'))).toBe(false);
  });

  it('detects unavailable methods and normalizes messages', () => {
    expect(isMethodUnavailable(new RpcMethodUnavailableError('thread/list'))).toBe(true);
    expect(normalizeError({ message: 'Readable failure' })).toBe('Readable failure');
  });

  it('condenses HTML challenge pages into readable upstream auth/network errors', () => {
    const message = normalizeError({
      message:
        'failed to list apps: Request failed with status 403 Forbidden: <html><body><span id="challenge-error-text">Enable JavaScript and cookies to continue</span></body></html>',
    });

    expect(message).toBe(
      'Request failed with status 403 Forbidden: remote service returned an HTML challenge page instead of API JSON. This usually means auth expired or the request was blocked upstream.',
    );
  });

  it('extracts structured telemetry for upstream HTML challenge failures', () => {
    const telemetry = getErrorTelemetry({
      message:
        'failed to list apps: Request failed with status 403 Forbidden: <html><body><span id="challenge-error-text">Enable JavaScript and cookies to continue</span></body></html>',
    });

    expect(telemetry.statusCode).toBe(403);
    expect(telemetry.isHtmlResponse).toBe(true);
    expect(telemetry.isUpstreamAuthChallenge).toBe(true);
    expect(telemetry.normalizedMessage).toContain('HTML challenge page');
  });

  it('detects rollout/session loss errors that should use thread/read fallback', () => {
    expect(
      isRolloutUnavailableError({
        message: 'no rollout found for thread id 019d3144-50cf-75d2-95d5-7eda39430211',
      }),
    ).toBe(true);
    expect(isRolloutUnavailableError(new Error('permission denied'))).toBe(false);
  });
});
