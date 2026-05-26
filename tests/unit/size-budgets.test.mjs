import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  collectFiles,
  evaluateBudget,
  formatBytes,
  renderSizeReport,
} from '../../scripts/check-size-budgets.mjs';

const tempRoots = [];

afterEach(() => {
  for (const root of tempRoots.splice(0)) {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

function createTempRoot() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'codex-size-budget-'));
  tempRoots.push(root);
  return root;
}

describe('size budget helpers', () => {
  it('formats byte values with binary units', () => {
    expect(formatBytes(512)).toBe('512 B');
    expect(formatBytes(1536)).toBe('1.50 KiB');
    expect(formatBytes(1_572_864)).toBe('1.50 MiB');
  });

  it('collects only browser asset extensions recursively', () => {
    const root = createTempRoot();
    fs.mkdirSync(path.join(root, 'chunks'), { recursive: true });
    fs.writeFileSync(path.join(root, 'chunks', 'app.js'), '123');
    fs.writeFileSync(path.join(root, 'chunks', 'app.css'), '456');
    fs.writeFileSync(path.join(root, 'chunks', 'server.map'), '{}');

    const files = collectFiles(root)
      .map((filePath) => path.basename(filePath))
      .sort();

    expect(files).toEqual(['app.css', 'app.js']);
  });

  it('renders pass and fail states with artifact evidence', () => {
    const report = {
      tarballPath: path.join(process.cwd(), 'dist', 'quality-size', 'package.tgz'),
      checks: [
        evaluateBudget('built UI browser assets', 100, 200),
        evaluateBudget('release package tarball', 300, 200),
      ],
    };

    expect(renderSizeReport(report)).toContain('PASS built UI browser assets');
    expect(renderSizeReport(report)).toContain('FAIL release package tarball');
    expect(renderSizeReport(report)).toContain('artifact: dist/quality-size/package.tgz');
  });
});
