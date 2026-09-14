import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const root = process.cwd();
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), 'utf8');

describe('project license policy', () => {
  it('uses PolyForm Noncommercial for project-authored code and reserves commercial use', () => {
    expect(read('LICENSE')).toContain('PolyForm Noncommercial License 1.0.0');
    expect(read('REUSE.toml')).toContain(
      'SPDX-License-Identifier = "PolyForm-Noncommercial-1.0.0"',
    );
    expect(read('README.md')).toContain('Commercial use requires a separate written license');
    expect(read('CONTRIBUTING.md')).toContain('CONTRIBUTOR-LICENSING.md');
  });

  it('preserves upstream OpenAI Codex artifacts under Apache-2.0', () => {
    expect(read('src/lib/codex-runtime/REUSE.toml')).toContain(
      'SPDX-License-Identifier = "Apache-2.0"',
    );
    expect(read('codex-official-docs/REUSE.toml')).toContain(
      'SPDX-License-Identifier = "Apache-2.0"',
    );
  });
});
