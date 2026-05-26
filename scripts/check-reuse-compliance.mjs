#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const reuseVersion = '6.2.0';
const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const fallbackTarget = path.join(repoRoot, '.tools', 'reuse-python');

function parseArgs(args) {
  if (args.length === 0) return { reuseArgs: ['lint'] };
  if (args[0] === '--spdx-report' && args[1]) {
    return { reuseArgs: ['spdx', '-o', path.resolve(repoRoot, args[1])] };
  }
  throw new Error('Usage: node scripts/check-reuse-compliance.mjs [--spdx-report <path>]');
}

function run(command, args, options = {}) {
  return spawnSync(command, args, {
    cwd: repoRoot,
    encoding: 'utf8',
    stdio: 'inherit',
    ...options,
  });
}

function commandWorked(result) {
  return !result.error && result.status === 0;
}

function commandMissing(result) {
  return result.error?.code === 'ENOENT';
}

function pythonCandidates() {
  if (process.platform === 'win32') {
    return [
      { command: 'py', args: ['-3'] },
      { command: 'python', args: [] },
      { command: 'python3', args: [] },
    ];
  }
  return [
    { command: 'python3', args: [] },
    { command: 'python', args: [] },
  ];
}

function runWithPipx(reuseArgs) {
  for (const python of pythonCandidates()) {
    const result = run(python.command, [
      ...python.args,
      '-m',
      'pipx',
      'run',
      '--spec',
      `reuse==${reuseVersion}`,
      'reuse',
      ...reuseArgs,
    ]);
    if (commandWorked(result)) return true;
    if (!commandMissing(result)) return false;
  }
  return false;
}

function installReuseWithPip(python) {
  fs.mkdirSync(fallbackTarget, { recursive: true });
  return run(python.command, [
    ...python.args,
    '-m',
    'pip',
    'install',
    '--quiet',
    '--disable-pip-version-check',
    '--upgrade',
    '--target',
    fallbackTarget,
    `reuse==${reuseVersion}`,
  ]);
}

function runWithTargetPython(reuseArgs) {
  for (const python of pythonCandidates()) {
    const installed = installReuseWithPip(python);
    if (commandMissing(installed)) continue;
    if (!commandWorked(installed)) return false;
    const env = { ...process.env, PYTHONPATH: fallbackTarget };
    return commandWorked(
      run(python.command, [...python.args, '-m', 'reuse', ...reuseArgs], { env }),
    );
  }
  return false;
}

function main() {
  const { reuseArgs } = parseArgs(process.argv.slice(2));
  const nativeReuse = run('reuse', reuseArgs);
  if (commandWorked(nativeReuse)) return;
  if (!commandMissing(nativeReuse)) process.exit(nativeReuse.status ?? 1);
  if (runWithPipx(reuseArgs)) return;
  if (runWithTargetPython(reuseArgs)) return;
  process.stderr.write(`Unable to run reuse ${reuseVersion}. Install reuse or Python with pipx.\n`);
  process.exit(1);
}

main();
