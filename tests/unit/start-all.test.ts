import { createRequire } from 'node:module';
import { describe, expect, it } from 'vitest';

const require = createRequire(import.meta.url);
const launcher = require('../../start-all.cjs') as Record<string, any>;

describe('development service launcher', () => {
  it('formats Codex listen URLs without a path or trailing slash', () => {
    expect(launcher.formatListenUrl(new URL('ws://127.0.0.1:40000'), 40001)).toBe(
      'ws://127.0.0.1:40001',
    );
    expect(launcher.formatListenUrl(new URL('wss://127.0.0.1:40000'), 40001)).toBe(
      'wss://127.0.0.1:40001',
    );
  });

  it('keeps IPv6 listen URLs valid for the Codex CLI parser', () => {
    expect(launcher.formatListenUrl(new URL('ws://[::1]:40000'), 40001)).toBe('ws://[::1]:40001');
  });
});
