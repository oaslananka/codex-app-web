#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const packOutputDir = path.join(repoRoot, 'dist', 'quality-size');
const browserAssetExtensions = new Set(['.css', '.js']);
const windowsExecutableExtensions = ['.ps1', '.cmd', '.exe', ''];

export const sizeBudgets = Object.freeze({
  builtUiBytes: 1_500_000,
  releaseTarballBytes: 1_100_000,
});

const browserAssetRoots = Object.freeze(['.next/static', 'public/vendor']);

export function formatBytes(bytes) {
  const units = ['B', 'KiB', 'MiB'];
  let value = bytes;
  let unitIndex = 0;
  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024;
    unitIndex += 1;
  }
  return `${value.toFixed(unitIndex === 0 ? 0 : 2)} ${units[unitIndex]}`;
}

export function collectFiles(root, extensions = browserAssetExtensions) {
  if (!fs.existsSync(root)) {
    throw new Error(`Required size-budget input is missing: ${path.relative(repoRoot, root)}`);
  }

  const entries = fs.readdirSync(root, { withFileTypes: true });
  return entries.flatMap((entry) => {
    const absolutePath = path.join(root, entry.name);
    if (entry.isDirectory()) return collectFiles(absolutePath, extensions);
    if (!entry.isFile() || !extensions.has(path.extname(entry.name))) return [];
    return [absolutePath];
  });
}

export function sumFileBytes(files) {
  return files.reduce((total, filePath) => total + fs.statSync(filePath).size, 0);
}

export function evaluateBudget(name, actualBytes, maxBytes) {
  return {
    name,
    actualBytes,
    maxBytes,
    ok: actualBytes <= maxBytes,
  };
}

function findOnPath(commandName) {
  const pathEntries = (process.env.PATH || '').split(path.delimiter).filter(Boolean);
  const extensions = process.platform === 'win32' ? windowsExecutableExtensions : [''];

  for (const entry of pathEntries) {
    for (const extension of extensions) {
      const candidate = path.join(entry, `${commandName}${extension}`);
      if (fs.existsSync(candidate)) return candidate;
    }
  }

  return commandName;
}

function pnpmCommand() {
  const pnpmPath = findOnPath('pnpm');
  if (process.platform === 'win32' && pnpmPath.endsWith('.ps1')) {
    return {
      command: 'powershell.exe',
      args: ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', pnpmPath],
    };
  }

  return { command: pnpmPath, args: [] };
}

function runPnpmPack() {
  fs.rmSync(packOutputDir, { recursive: true, force: true });
  fs.mkdirSync(packOutputDir, { recursive: true });

  const pnpm = pnpmCommand();
  const result = spawnSync(
    pnpm.command,
    [...pnpm.args, 'pack', '--pack-destination', packOutputDir],
    {
      cwd: repoRoot,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    },
  );

  if (result.status !== 0) {
    throw new Error(`pnpm pack failed:\n${result.error || result.stderr || result.stdout}`);
  }
}

function findReleaseTarball() {
  const tarballs = fs.readdirSync(packOutputDir).filter((entry) => entry.endsWith('.tgz'));
  if (tarballs.length !== 1) {
    throw new Error(
      `Expected exactly one package tarball in ${packOutputDir}; found ${tarballs.length}`,
    );
  }
  return path.join(packOutputDir, tarballs[0]);
}

export function buildSizeReport() {
  const browserFiles = browserAssetRoots.flatMap((root) => collectFiles(path.join(repoRoot, root)));
  const builtUiBytes = sumFileBytes(browserFiles);

  runPnpmPack();
  const tarballPath = findReleaseTarball();
  const releaseTarballBytes = fs.statSync(tarballPath).size;

  return {
    tarballPath,
    checks: [
      evaluateBudget('built UI browser assets', builtUiBytes, sizeBudgets.builtUiBytes),
      evaluateBudget(
        'release package tarball',
        releaseTarballBytes,
        sizeBudgets.releaseTarballBytes,
      ),
    ],
  };
}

export function renderSizeReport(report) {
  return report.checks
    .map(
      (check) =>
        `${check.ok ? 'PASS' : 'FAIL'} ${check.name}: ${formatBytes(check.actualBytes)} / ${formatBytes(check.maxBytes)}`,
    )
    .concat(`artifact: ${path.relative(repoRoot, report.tarballPath).replaceAll('\\', '/')}`)
    .join('\n');
}

function main() {
  const report = buildSizeReport();
  process.stdout.write(`${renderSizeReport(report)}\n`);

  const failed = report.checks.filter((check) => !check.ok);
  if (failed.length > 0) {
    process.stderr.write(
      'Size budget check failed. Raise the explicit budget only with PR evidence.\n',
    );
    process.exit(1);
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main();
}
