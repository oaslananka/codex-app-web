import { describe, expect, it } from 'vitest';
import { sanitizeTerminalOutput } from '../../src/lib/codex-runtime/terminal-output';

describe('sanitizeTerminalOutput', () => {
  it('removes ANSI escape sequences and control characters', () => {
    const input = '\u001b[?25l\u001b[0m$ ls\r\nfolder\u001b[0m  \u0007file.txt\u001b[?25h';

    expect(sanitizeTerminalOutput(input)).toBe('$ ls\nfolder  file.txt');
  });
});
