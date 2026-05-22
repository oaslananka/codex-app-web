'use strict';

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');

const DEFAULT_UPLOAD_ROOT = path.join(os.tmpdir(), 'codex-app-web-uploads');
const UPLOAD_RUNTIME_MARKER = '.codex-app-web-upload-runtime';

function resolveUploadRoot(env = process.env) {
  return path.resolve(env.CODEX_UPLOAD_ROOT || DEFAULT_UPLOAD_ROOT);
}

function isPathInsideDirectory(candidatePath, rootDir) {
  const resolvedCandidate = path.resolve(candidatePath);
  const resolvedRoot = path.resolve(rootDir);
  const relativePath = path.relative(resolvedRoot, resolvedCandidate);
  return (
    relativePath === '' ||
    (relativePath !== '..' &&
      !relativePath.startsWith(`..${path.sep}`) &&
      !path.isAbsolute(relativePath))
  );
}

function createUploadRuntime(options = {}) {
  const env = options.env || process.env;
  const rootDir = path.resolve(options.rootDir || resolveUploadRoot(env));
  const processId = options.processId ?? process.pid;
  const randomId = options.randomId || crypto.randomUUID();
  const uploadDir = path.join(rootDir, `${processId}-${randomId}`);
  if (!isPathInsideDirectory(uploadDir, rootDir)) {
    throw new Error('Upload directory escaped upload root');
  }
  return {
    processId,
    randomId,
    rootDir,
    uploadDir,
    resolvedUploadDir: path.resolve(uploadDir),
  };
}

function ensureUploadDir(uploadDir, runtime = {}) {
  fs.mkdirSync(uploadDir, { recursive: true, mode: 0o700 });
  const marker = {
    version: 1,
    processId: runtime.processId ?? process.pid,
    randomId: runtime.randomId,
    createdAt: new Date().toISOString(),
  };
  fs.writeFileSync(path.join(uploadDir, UPLOAD_RUNTIME_MARKER), JSON.stringify(marker), {
    mode: 0o600,
  });
}

function removePathInsideRoot(targetPath, rootDir) {
  if (!isPathInsideDirectory(targetPath, rootDir)) {
    return false;
  }
  fs.rmSync(targetPath, { recursive: true, force: true });
  return true;
}

function readUploadRuntimeMarker(uploadDir) {
  try {
    const marker = JSON.parse(fs.readFileSync(path.join(uploadDir, UPLOAD_RUNTIME_MARKER), 'utf8'));
    return marker && typeof marker === 'object' ? marker : null;
  } catch {
    return null;
  }
}

function isProcessAlive(processId) {
  if (!Number.isInteger(processId) || processId <= 0) {
    return false;
  }
  try {
    process.kill(processId, 0);
    return true;
  } catch (err) {
    return err?.code === 'EPERM';
  }
}

async function readUploadRuntimeMarkerAsync(uploadDir) {
  try {
    const marker = JSON.parse(
      await fs.promises.readFile(path.join(uploadDir, UPLOAD_RUNTIME_MARKER), 'utf8'),
    );
    return marker && typeof marker === 'object' ? marker : null;
  } catch {
    return null;
  }
}

async function cleanupStaleUploadDirs(
  rootDir,
  maxAgeMs,
  now = Date.now(),
  excludedPaths = new Set(),
) {
  try {
    await fs.promises.access(rootDir);
  } catch {
    return 0;
  }

  const resolvedExcludedPaths = new Set([...excludedPaths].map((entry) => path.resolve(entry)));
  let removed = 0;
  let entries;
  try {
    entries = await fs.promises.readdir(rootDir, { withFileTypes: true });
  } catch {
    return 0;
  }

  for (const entry of entries) {
    const entryPath = path.join(rootDir, entry.name);
    const resolvedEntryPath = path.resolve(entryPath);
    if (resolvedExcludedPaths.has(resolvedEntryPath)) {
      continue;
    }
    if (!isPathInsideDirectory(entryPath, rootDir)) {
      continue;
    }
    try {
      if (!entry.isDirectory()) {
        continue;
      }
      const marker = await readUploadRuntimeMarkerAsync(entryPath);
      if (!marker || isProcessAlive(marker.processId)) {
        continue;
      }
      const stat = await fs.promises.stat(entryPath);
      if (now - stat.mtimeMs <= maxAgeMs) {
        continue;
      }
      await fs.promises.rm(entryPath, { recursive: true, force: true });
      removed++;
    } catch {
      // Cleanup is best-effort and must not prevent server startup.
    }
  }
  return removed;
}

async function cleanupStaleUploadChildren(uploadDir, maxAgeMs, now = Date.now()) {
  try {
    await fs.promises.access(uploadDir);
  } catch {
    return 0;
  }

  let removed = 0;
  let entries;
  try {
    entries = await fs.promises.readdir(uploadDir, { withFileTypes: true });
  } catch {
    return 0;
  }

  for (const entry of entries) {
    if (entry.name === UPLOAD_RUNTIME_MARKER) {
      continue;
    }
    const entryPath = path.join(uploadDir, entry.name);
    if (!isPathInsideDirectory(entryPath, uploadDir)) {
      continue;
    }
    try {
      const stat = await fs.promises.stat(entryPath);
      if (now - stat.mtimeMs <= maxAgeMs) {
        continue;
      }
      if (entry.isDirectory() || entry.isFile()) {
        await fs.promises.rm(entryPath, { recursive: true, force: true });
        removed++;
      }
    } catch {
      // Cleanup is best-effort and must not prevent server startup.
    }
  }
  return removed;
}

module.exports = {
  DEFAULT_UPLOAD_ROOT,
  UPLOAD_RUNTIME_MARKER,
  cleanupStaleUploadChildren,
  cleanupStaleUploadDirs,
  createUploadRuntime,
  ensureUploadDir,
  isProcessAlive,
  isPathInsideDirectory,
  readUploadRuntimeMarker,
  readUploadRuntimeMarkerAsync,
  removePathInsideRoot,
  resolveUploadRoot,
};
