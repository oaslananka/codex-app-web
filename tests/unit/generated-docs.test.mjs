import { describe, expect, it } from 'vitest';
import {
  changedStatusLines,
  gitDiffArgs,
  gitUntrackedArgs,
  renderGeneratedDocsFailure,
} from '../../scripts/check-generated-docs.mjs';

describe('generated docs checker', () => {
  it('builds scoped git commands', () => {
    expect(gitDiffArgs(['docs/api'])).toEqual(['diff', '--name-status', '--', 'docs/api']);
    expect(gitUntrackedArgs(['docs/api'])).toEqual([
      'ls-files',
      '--others',
      '--exclude-standard',
      '--',
      'docs/api',
    ]);
  });

  it('parses non-empty diff and untracked lines', () => {
    expect(changedStatusLines('M\tdocs/api/README.md\n', 'docs/api/protocol.md\n')).toEqual([
      'M\tdocs/api/README.md',
      '?? docs/api/protocol.md',
    ]);
  });

  it('renders an actionable stale-docs failure', () => {
    expect(renderGeneratedDocsFailure([' M docs/api/README.md'])).toContain('pnpm docs:build');
  });
});
