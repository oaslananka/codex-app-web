'use strict';

const fs = require('node:fs');
const path = require('node:path');

const NEXT_SOURCE_DIRECTORIES = ['app', 'pages', 'src', 'public'];
const NEXT_SOURCE_FILES = [
  'next.config.js',
  'next.config.mjs',
  'next.config.ts',
  'postcss.config.js',
  'postcss.config.mjs',
  'postcss.config.ts',
  'tailwind.config.js',
  'tailwind.config.mjs',
  'tailwind.config.ts',
  'tsconfig.json',
  'package.json',
  'pnpm-lock.yaml',
];
const IGNORED_SOURCE_DIRECTORIES = new Set([
  '.git',
  '.next',
  'build',
  'coverage',
  'dist',
  'node_modules',
  'out',
]);

function newestMtimeMs(filePath) {
  try {
    return fs.statSync(filePath).mtimeMs;
  } catch {
    return 0;
  }
}

function newestMtimeUnderDirectory(dirPath) {
  let newest = 0;
  let entries;
  try {
    entries = fs.readdirSync(dirPath, { withFileTypes: true });
  } catch {
    return newest;
  }

  for (const entry of entries) {
    if (IGNORED_SOURCE_DIRECTORIES.has(entry.name)) {
      continue;
    }

    const entryPath = path.join(dirPath, entry.name);
    if (entry.isDirectory()) {
      newest = Math.max(newest, newestMtimeUnderDirectory(entryPath));
      continue;
    }

    if (entry.isFile()) {
      newest = Math.max(newest, newestMtimeMs(entryPath));
    }
  }

  return newest;
}

function getNewestNextSourceMtime(rootDir) {
  const projectRoot = path.resolve(rootDir);
  let newest = 0;

  for (const dirName of NEXT_SOURCE_DIRECTORIES) {
    newest = Math.max(newest, newestMtimeUnderDirectory(path.join(projectRoot, dirName)));
  }

  for (const fileName of NEXT_SOURCE_FILES) {
    newest = Math.max(newest, newestMtimeMs(path.join(projectRoot, fileName)));
  }

  return newest;
}

function hasStaleNextBuildArtifacts({ rootDir, buildMarkerPath }) {
  const markerMtime = newestMtimeMs(buildMarkerPath);
  if (markerMtime <= 0) {
    return false;
  }

  return getNewestNextSourceMtime(rootDir) > markerMtime;
}

function resolveNextRuntimeMode({
  nodeEnv,
  hasBuildArtifacts,
  hasStaleBuildArtifacts = false,
  allowDevFallback = false,
}) {
  const normalizedEnv = nodeEnv || 'production';

  if (normalizedEnv !== 'production') {
    return { dev: true, reason: 'non-production' };
  }

  if (!hasBuildArtifacts) {
    return allowDevFallback
      ? { dev: true, fatal: false, reason: 'missing-build-artifacts-dev-fallback' }
      : {
          dev: false,
          fatal: true,
          reason: 'missing-build-artifacts',
          message:
            'Production start requires existing Next.js build artifacts. Run `pnpm build` first, or set ALLOW_NEXT_DEV_FALLBACK=1 only for local development.',
        };
  }

  if (hasStaleBuildArtifacts) {
    return allowDevFallback
      ? { dev: true, fatal: false, reason: 'stale-build-artifacts-dev-fallback' }
      : {
          dev: false,
          fatal: true,
          reason: 'stale-build-artifacts',
          message:
            'Production start refused stale Next.js build artifacts. Run `pnpm build` before starting production.',
        };
  }

  return { dev: false, reason: 'production' };
}

module.exports = { getNewestNextSourceMtime, hasStaleNextBuildArtifacts, resolveNextRuntimeMode };
