import { describe, expect, it } from 'vitest';
import { decodeBase64Utf8, encodeBase64Utf8 } from '../../src/lib/codex-runtime/utf8-base64';

describe('utf8 base64 helpers', () => {
  it('round-trips Unicode text without deprecated escape conversion', () => {
    const value = 'Merhaba, Istanbul: ğüşöçıİ and emoji 🚀';

    expect(decodeBase64Utf8(encodeBase64Utf8(value))).toBe(value);
  });

  it('returns the original value when base64 decoding fails', () => {
    expect(decodeBase64Utf8('not valid base64!')).toBe('not valid base64!');
  });
});
