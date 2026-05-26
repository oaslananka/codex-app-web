#!/usr/bin/env node
import { spawnSync } from 'node:child_process';

export function gitDiffArgs(paths) {
  return ['diff', '--name-status', '--', ...paths];
}

export function gitUntrackedArgs(paths) {
  return ['ls-files', '--others', '--exclude-standard', '--', ...paths];
}

export function changedStatusLines(diffOutput, untrackedOutput = '') {
  const diffLines = diffOutput
    .split(/\r?\n/)
    .map((line) => line.trimEnd())
    .filter(Boolean);
  const untrackedLines = untrackedOutput
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => `?? ${line}`);
  return [...diffLines, ...untrackedLines];
}

export function renderGeneratedDocsFailure(lines) {
  return [
    'Generated documentation is stale. Run `pnpm docs:build` and commit the result.',
    ...lines.map((line) => `  ${line}`),
  ].join('\n');
}

function runGit(args) {
  const result = spawnSync('git', args, { encoding: 'utf8' });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(result.stderr || result.stdout);
  return result.stdout;
}

function runGitChanges(paths) {
  return changedStatusLines(runGit(gitDiffArgs(paths)), runGit(gitUntrackedArgs(paths)));
}

function main() {
  const paths = process.argv.slice(2);
  const lines = runGitChanges(paths.length > 0 ? paths : ['docs/api']);
  if (lines.length === 0) return;
  process.stderr.write(`${renderGeneratedDocsFailure(lines)}\n`);
  process.exit(1);
}

if (process.argv[1]?.endsWith('check-generated-docs.mjs')) {
  main();
}
