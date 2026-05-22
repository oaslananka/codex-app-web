import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { afterEach, describe, expect, it } from 'vitest';

const require = createRequire(import.meta.url);
const uploads = require('../../src/lib/server/uploads.cjs') as Record<string, any>;

const createdRoots: string[] = [];

afterEach(() => {
  for (const root of createdRoots.splice(0)) {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

function makeRoot() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'codex-upload-test-'));
  createdRoots.push(root);
  return root;
}

describe('upload temp directory helpers', () => {
  it('creates a per-process upload directory inside the configured root', () => {
    const rootDir = makeRoot();
    const runtime = uploads.createUploadRuntime({
      rootDir,
      processId: 1234,
      randomId: 'abc',
    });

    expect(runtime.rootDir).toBe(path.resolve(rootDir));
    expect(runtime.processId).toBe(1234);
    expect(runtime.randomId).toBe('abc');
    expect(runtime.uploadDir).toBe(path.join(path.resolve(rootDir), '1234-abc'));
    expect(uploads.isPathInsideDirectory(runtime.uploadDir, rootDir)).toBe(true);
    expect(
      uploads.isPathInsideDirectory(
        path.join(path.parse(rootDir).root, 'tmp'),
        path.parse(rootDir).root,
      ),
    ).toBe(true);
  });

  it('cleans only stale app-owned runtime directories contained by the upload root', async () => {
    const rootDir = makeRoot();
    const staleRuntime = uploads.createUploadRuntime({
      rootDir,
      processId: 999999,
      randomId: 'stale',
    });
    const freshRuntime = uploads.createUploadRuntime({
      rootDir,
      processId: 999999,
      randomId: 'fresh',
    });
    const unrelatedDir = path.join(rootDir, 'unrelated');
    uploads.ensureUploadDir(staleRuntime.uploadDir, staleRuntime);
    uploads.ensureUploadDir(freshRuntime.uploadDir, freshRuntime);
    fs.mkdirSync(unrelatedDir);
    const now = Date.now();
    fs.utimesSync(staleRuntime.uploadDir, new Date(now - 120_000), new Date(now - 120_000));
    fs.utimesSync(freshRuntime.uploadDir, new Date(now), new Date(now));
    fs.utimesSync(unrelatedDir, new Date(now - 120_000), new Date(now - 120_000));

    const removed = await uploads.cleanupStaleUploadDirs(rootDir, 60_000, now);

    expect(removed).toBe(1);
    expect(fs.existsSync(staleRuntime.uploadDir)).toBe(false);
    expect(fs.existsSync(freshRuntime.uploadDir)).toBe(true);
    expect(fs.existsSync(unrelatedDir)).toBe(true);
    expect(uploads.removePathInsideRoot(path.dirname(rootDir), rootDir)).toBe(false);
  });

  it('preserves the active upload directory while cleaning stale children inside it', async () => {
    const rootDir = makeRoot();
    const activeDir = path.join(rootDir, 'active');
    fs.mkdirSync(activeDir);
    const staleFile = path.join(activeDir, 'old.png');
    const freshFile = path.join(activeDir, 'new.png');
    fs.writeFileSync(staleFile, 'old');
    fs.writeFileSync(freshFile, 'new');
    const now = Date.now();
    fs.utimesSync(activeDir, new Date(now - 120_000), new Date(now - 120_000));
    fs.utimesSync(staleFile, new Date(now - 120_000), new Date(now - 120_000));
    fs.utimesSync(freshFile, new Date(now), new Date(now));

    await expect(
      uploads.cleanupStaleUploadDirs(rootDir, 60_000, now, new Set([activeDir])),
    ).resolves.toBe(0);
    expect(fs.existsSync(activeDir)).toBe(true);
    await expect(uploads.cleanupStaleUploadChildren(activeDir, 60_000, now)).resolves.toBe(1);
    expect(fs.existsSync(staleFile)).toBe(false);
    expect(fs.existsSync(freshFile)).toBe(true);
  });

  it('preserves stale runtime directories while their owner process is still alive', async () => {
    const rootDir = makeRoot();
    const runtime = uploads.createUploadRuntime({
      rootDir,
      processId: process.pid,
      randomId: 'active-process',
    });
    uploads.ensureUploadDir(runtime.uploadDir, runtime);
    const now = Date.now();
    fs.utimesSync(runtime.uploadDir, new Date(now - 120_000), new Date(now - 120_000));

    await expect(uploads.cleanupStaleUploadDirs(rootDir, 60_000, now)).resolves.toBe(0);
    expect(fs.existsSync(runtime.uploadDir)).toBe(true);
  });

  it('treats missing upload roots as best-effort cleanup misses', async () => {
    const rootDir = makeRoot();
    fs.rmSync(rootDir, { recursive: true, force: true });

    await expect(uploads.cleanupStaleUploadDirs(rootDir, 60_000)).resolves.toBe(0);
    await expect(
      uploads.cleanupStaleUploadChildren(path.join(rootDir, 'missing'), 60_000),
    ).resolves.toBe(0);
  });
});
