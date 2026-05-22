#!/usr/bin/env node
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const upstreamRepository = 'https://github.com/openai/codex.git';
const upstreamRawBase = 'https://raw.githubusercontent.com/openai/codex';
const metadataPath = path.join(repoRoot, 'codex-official-docs', 'upstream-metadata.json');

const args = new Map();
for (let index = 2; index < process.argv.length; index += 1) {
  const arg = process.argv[index];
  if (!arg.startsWith('--')) continue;
  const key = arg.slice(2);
  const next = process.argv[index + 1];
  if (next && !next.startsWith('--')) {
    args.set(key, next);
    index += 1;
  } else {
    args.set(key, 'true');
  }
}

function quoteShell(value) {
  return `"${String(value).replaceAll('"', '\\"')}"`;
}

function run(command, commandArgs = [], options = {}) {
  const executable = process.platform === 'win32' && command === 'pnpm' ? 'pnpm.cmd' : command;
  const useShellLine = process.platform === 'win32' && command === 'pnpm' && !options.shell;
  const result = spawnSync(
    useShellLine ? `${executable} ${commandArgs.map(quoteShell).join(' ')}` : executable,
    useShellLine ? [] : commandArgs,
    {
      cwd: repoRoot,
      encoding: 'utf8',
      stdio: options.capture ? 'pipe' : 'inherit',
      shell: useShellLine ? true : (options.shell ?? false),
      env: { ...process.env, ...options.env },
    },
  );

  if (result.status !== 0) {
    throw new Error(`${executable} ${commandArgs.join(' ')} failed with exit ${result.status}`);
  }

  return result.stdout?.trim() ?? '';
}

function runCodex(commandArgs, options = {}) {
  const executable =
    process.env.CODEX_BIN || (process.platform === 'win32' ? 'codex.cmd' : 'codex');
  if (executable.includes(' ') || process.platform === 'win32') {
    return run(`${executable} ${commandArgs.map(quoteShell).join(' ')}`, [], {
      ...options,
      shell: true,
    });
  }
  return run(executable, commandArgs, options);
}

function getCodexVersion() {
  const output = runCodex(['--version'], { capture: true });
  const match = output.match(/(\d+\.\d+\.\d+(?:[-+][\w.-]+)?)/);
  if (!match) throw new Error(`Unable to parse Codex version from: ${output}`);
  return match[1];
}

function resolveRef(ref) {
  if (/^[0-9a-f]{40}$/i.test(ref)) return { ref, commit: ref };

  const candidates = [`refs/tags/${ref}^{}`, `refs/tags/${ref}`, `refs/heads/${ref}`, ref];

  for (const candidate of candidates) {
    const result = spawnSync('git', ['ls-remote', upstreamRepository, candidate], {
      cwd: repoRoot,
      encoding: 'utf8',
    });
    if (result.status !== 0 || !result.stdout.trim()) continue;
    const [commit] = result.stdout.trim().split(/\s+/);
    if (/^[0-9a-f]{40}$/i.test(commit)) return { ref, commit };
  }

  throw new Error(`Unable to resolve upstream ref ${ref}`);
}

async function fetchUpstreamReadme(commit) {
  const response = await fetch(`${upstreamRawBase}/${commit}/codex-rs/app-server/README.md`);
  if (!response.ok) {
    throw new Error(`Failed to fetch upstream README at ${commit}: HTTP ${response.status}`);
  }
  return response.text();
}

function writeJson(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`);
}

const schemaKeyOrder = new Map(
  [
    '$schema',
    '$id',
    'title',
    'description',
    'type',
    'enum',
    'const',
    'default',
    'required',
    'properties',
    'additionalProperties',
    'items',
    'prefixItems',
    'anyOf',
    'oneOf',
    'allOf',
    'not',
    '$ref',
    'definitions',
    '$defs',
  ].map((key, index) => [key, index]),
);

function compareJsonKeys(left, right) {
  const leftRank = schemaKeyOrder.get(left);
  const rightRank = schemaKeyOrder.get(right);

  if (leftRank !== undefined || rightRank !== undefined) {
    return (leftRank ?? Number.MAX_SAFE_INTEGER) - (rightRank ?? Number.MAX_SAFE_INTEGER);
  }

  return left < right ? -1 : left > right ? 1 : 0;
}

function normalizeJsonValue(value) {
  if (Array.isArray(value)) {
    return value.map(normalizeJsonValue);
  }

  if (value === null || typeof value !== 'object') {
    return value;
  }

  return Object.fromEntries(
    Object.entries(value)
      .sort(([left], [right]) => compareJsonKeys(left, right))
      .map(([key, entry]) => [key, normalizeJsonValue(entry)]),
  );
}

function listJsonFiles(directory) {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const entryPath = path.join(directory, entry.name);
    if (entry.isDirectory()) return listJsonFiles(entryPath);
    return entry.isFile() && entry.name.endsWith('.json') ? [entryPath] : [];
  });
}

function normalizeJsonDirectory(directory) {
  for (const filePath of listJsonFiles(directory)) {
    const value = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    writeJson(filePath, normalizeJsonValue(value));
  }
}

const codexCliVersion = getCodexVersion();
const defaultRef = `rust-v${codexCliVersion}`;
const upstreamRef = args.get('upstream-ref') || process.env.UPSTREAM_REF || defaultRef;
const experimental = args.has('experimental') || process.env.CODEX_EXPERIMENTAL_API === '1';
const resolved = resolveRef(upstreamRef);
const readme = await fetchUpstreamReadme(resolved.commit);
const existingMetadata = fs.existsSync(metadataPath)
  ? JSON.parse(fs.readFileSync(metadataPath, 'utf8'))
  : null;

const tsArgs = ['app-server', 'generate-ts', '--out', 'codex-official-docs/generate-ts'];
const jsonArgs = [
  'app-server',
  'generate-json-schema',
  '--out',
  'codex-official-docs/generate-json-schema',
];

if (experimental) {
  tsArgs.push('--experimental');
  jsonArgs.push('--experimental');
}

runCodex(tsArgs);
runCodex(jsonArgs);
normalizeJsonDirectory(path.join(repoRoot, 'codex-official-docs', 'generate-json-schema'));
run('pnpm', ['protocol:manifest:generate']);

const generationCommands = [
  `codex ${tsArgs.join(' ')}`,
  `codex ${jsonArgs.join(' ')}`,
  'pnpm protocol:manifest:generate',
];
const generatedAt =
  existingMetadata?.upstreamCommit === resolved.commit &&
  existingMetadata?.codexCliVersion === codexCliVersion &&
  existingMetadata?.experimentalApi === experimental
    ? existingMetadata.generatedAt
    : new Date().toISOString();

writeJson(metadataPath, {
  upstreamRepository: 'openai/codex',
  upstreamRef,
  upstreamCommit: resolved.commit,
  upstreamPathsInspected: ['codex-rs/app-server/README.md'],
  upstreamReadmeSha256: crypto.createHash('sha256').update(readme).digest('hex'),
  codexCliVersion,
  codexSourceRef: defaultRef,
  generatedAt,
  experimentalApi: experimental,
  generationCommands,
});

run('pnpm', ['exec', 'prettier', '--write', 'codex-official-docs/upstream-metadata.json']);
run('pnpm', ['protocol:manifest:check']);
run('pnpm', ['protocol:drift:check']);

process.stdout.write(
  `Synced OpenAI Codex app-server artifacts from ${upstreamRef} (${resolved.commit}).\n`,
);
