#!/usr/bin/env node
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const manifestPath = 'src/lib/codex-runtime/official-manifest.generated.ts';
const schemaRoot = 'codex-official-docs/generate-json-schema';
const metadataPath = 'codex-official-docs/upstream-metadata.json';

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

const baseRef =
  args.get('base-ref') ??
  (process.env.GITHUB_BASE_REF ? `origin/${process.env.GITHUB_BASE_REF}` : 'HEAD');

function runGit(gitArgs, options = {}) {
  const result = spawnSync('git', gitArgs, {
    cwd: repoRoot,
    encoding: 'utf8',
    ...options,
  });

  if (result.status !== 0) {
    if (options.allowFailure) return null;
    throw new Error(`git ${gitArgs.join(' ')} failed with exit ${result.status}: ${result.stderr}`);
  }

  return result.stdout;
}

function readWorktree(relativePath) {
  const absolutePath = path.join(repoRoot, relativePath);
  return fs.existsSync(absolutePath) ? fs.readFileSync(absolutePath, 'utf8') : null;
}

function readFromGit(ref, relativePath) {
  return runGit(['show', `${ref}:${relativePath}`], { allowFailure: true });
}

function parseConstArray(source, name) {
  if (!source) return [];
  const match = source.match(new RegExp(`export const ${name} = (\\[[\\s\\S]*?\\]) as const;`));
  return match ? JSON.parse(match[1]) : [];
}

function parseConstObject(source, name) {
  if (!source) return {};
  const match = source.match(
    new RegExp(`export const ${name} = (\\{[\\s\\S]*?\\}) as const satisfies`),
  );
  return match ? JSON.parse(match[1]) : {};
}

function readManifest(ref = null) {
  const content = ref ? readFromGit(ref, manifestPath) : readWorktree(manifestPath);
  return {
    requests: parseConstArray(content, 'OFFICIAL_REQUEST_METHODS'),
    notifications: parseConstArray(content, 'OFFICIAL_NOTIFICATION_METHODS'),
    serverRequests: parseConstArray(content, 'OFFICIAL_SERVER_REQUEST_METHODS'),
    configFields: Object.keys(parseConstObject(content, 'OFFICIAL_CONFIG_FIELD_SCHEMAS')).sort(),
  };
}

function listSchemaFiles(ref = null) {
  if (ref) {
    const output = runGit(['ls-tree', '-r', '--name-only', ref, '--', schemaRoot], {
      allowFailure: true,
    });
    return output ? output.split(/\r?\n/).filter(Boolean).sort() : [];
  }

  const root = path.join(repoRoot, schemaRoot);
  if (!fs.existsSync(root)) return [];
  const files = [];
  const visit = (dir) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const absolutePath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        visit(absolutePath);
      } else if (entry.isFile() && entry.name.endsWith('.json')) {
        files.push(path.relative(repoRoot, absolutePath).replaceAll('\\', '/'));
      }
    }
  };
  visit(root);
  return files.sort();
}

function sortJson(value) {
  if (Array.isArray(value)) return value.map(sortJson);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(
    Object.entries(value)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, nested]) => [key, sortJson(nested)]),
  );
}

function hashSchema(ref, relativePath) {
  const content = ref ? readFromGit(ref, relativePath) : readWorktree(relativePath);
  if (!content) return null;
  let normalized = content;
  try {
    normalized = JSON.stringify(sortJson(JSON.parse(content)));
  } catch {
    normalized = content.replace(/\r\n/g, '\n');
  }
  return crypto.createHash('sha256').update(normalized).digest('hex');
}

function diffValues(before, after) {
  const beforeSet = new Set(before);
  const afterSet = new Set(after);
  return {
    added: after.filter((value) => !beforeSet.has(value)).sort(),
    removed: before.filter((value) => !afterSet.has(value)).sort(),
  };
}

function getChangedPaths() {
  const paths = new Set();
  const committed = runGit(['diff', '--name-only', `${baseRef}...HEAD`], { allowFailure: true });
  const worktree = runGit(['diff', '--name-only'], { allowFailure: true });
  const staged = runGit(['diff', '--cached', '--name-only'], { allowFailure: true });
  const status = runGit(['status', '--short'], { allowFailure: true });

  for (const output of [committed, worktree, staged]) {
    for (const line of output?.split(/\r?\n/) ?? []) {
      if (line.trim()) paths.add(line.trim().replaceAll('\\', '/'));
    }
  }

  for (const line of status?.split(/\r?\n/) ?? []) {
    const pathText = line.slice(3).trim();
    if (pathText) paths.add(pathText.replaceAll('\\', '/'));
  }

  return [...paths].sort();
}

const categoryMatchers = {
  approval: /approval|permission/i,
  terminal: /command|terminal|process|shell/i,
  file: /(^|\/)(fs|file)|filesystem/i,
  auth: /account|auth|login|devicekey|chatgpt/i,
  mcp: /mcp/i,
  appsPluginsSkills: /app|plugin|skill|marketplace/i,
  config: /config|settings|sandbox|profile/i,
  experimental: /experimental|realtime|guardian|hook|remotecontrol|goal|memory|warning/i,
};

function categorize(value) {
  const matches = Object.entries(categoryMatchers)
    .filter(([, matcher]) => matcher.test(value))
    .map(([name]) => name);
  return matches.length > 0 ? matches : ['other'];
}

function summarizePayloadDrift(beforeFiles, afterFiles) {
  const beforeSet = new Set(beforeFiles);
  const afterSet = new Set(afterFiles);
  const added = afterFiles.filter((file) => !beforeSet.has(file));
  const removed = beforeFiles.filter((file) => !afterSet.has(file));
  const changed = afterFiles.filter(
    (file) => beforeSet.has(file) && hashSchema(baseRef, file) !== hashSchema(null, file),
  );

  const categories = {};
  for (const file of [...added, ...removed, ...changed]) {
    for (const category of categorize(file)) {
      categories[category] ??= { added: 0, removed: 0, changed: 0 };
      if (added.includes(file)) categories[category].added += 1;
      if (removed.includes(file)) categories[category].removed += 1;
      if (changed.includes(file)) categories[category].changed += 1;
    }
  }

  return { added, removed, changed, categories };
}

function hasProtocolCompanionChange(changedPaths) {
  const companionPatterns = [
    /^src\/lib\/codex-runtime\//,
    /^src\/components\/codex\//,
    /^tests\/unit\//,
    /^scripts\/(check-codex-protocol-drift|sync-codex-upstream|generate-codex-manifest)\.mjs$/,
    /^docs\/automation\/upstream-codex-sync\.md$/,
  ];

  return changedPaths.some(
    (changedPath) =>
      !changedPath.startsWith('codex-official-docs/') &&
      companionPatterns.some((pattern) => pattern.test(changedPath)),
  );
}

function validateMetadata() {
  const content = readWorktree(metadataPath);
  if (!content) return { ok: false, reason: `${metadataPath} is missing` };

  try {
    const metadata = JSON.parse(content);
    if (!/^[0-9a-f]{40}$/i.test(metadata.upstreamCommit ?? '')) {
      return { ok: false, reason: 'metadata.upstreamCommit must be a full commit SHA' };
    }
    if (typeof metadata.codexCliVersion !== 'string' || metadata.codexCliVersion.length === 0) {
      return { ok: false, reason: 'metadata.codexCliVersion is missing' };
    }
    if (!Array.isArray(metadata.generationCommands) || metadata.generationCommands.length === 0) {
      return { ok: false, reason: 'metadata.generationCommands is missing' };
    }
    return { ok: true, metadata };
  } catch (error) {
    return { ok: false, reason: `${metadataPath} is not valid JSON: ${error.message}` };
  }
}

const before = readManifest(baseRef);
const after = readManifest();
const requestDiff = diffValues(before.requests, after.requests);
const notificationDiff = diffValues(before.notifications, after.notifications);
const serverRequestDiff = diffValues(before.serverRequests, after.serverRequests);
const configDiff = diffValues(before.configFields, after.configFields);
const payloadDiff = summarizePayloadDrift(listSchemaFiles(baseRef), listSchemaFiles());
const changedPaths = getChangedPaths();
const metadataResult = validateMetadata();

const breakingDrift =
  requestDiff.removed.length > 0 ||
  notificationDiff.removed.length > 0 ||
  serverRequestDiff.removed.length > 0 ||
  configDiff.removed.length > 0 ||
  payloadDiff.removed.length > 0 ||
  payloadDiff.changed.some((file) =>
    categorize(file).some((category) => category !== 'other' && category !== 'experimental'),
  );

const summary = {
  baseRef,
  requestMethods: requestDiff,
  notificationMethods: notificationDiff,
  serverRequestMethods: serverRequestDiff,
  configFields: configDiff,
  payloadFiles: {
    added: payloadDiff.added.length,
    removed: payloadDiff.removed.length,
    changed: payloadDiff.changed.length,
    categories: payloadDiff.categories,
  },
  breakingDrift,
  metadata: metadataResult.ok ? metadataResult.metadata : metadataResult.reason,
};

process.stdout.write(`${JSON.stringify(summary, null, 2)}\n`);

const hasAnyDrift =
  requestDiff.added.length > 0 ||
  requestDiff.removed.length > 0 ||
  notificationDiff.added.length > 0 ||
  notificationDiff.removed.length > 0 ||
  serverRequestDiff.added.length > 0 ||
  serverRequestDiff.removed.length > 0 ||
  configDiff.added.length > 0 ||
  configDiff.removed.length > 0 ||
  payloadDiff.added.length > 0 ||
  payloadDiff.removed.length > 0 ||
  payloadDiff.changed.length > 0;

if (hasAnyDrift && !metadataResult.ok) {
  process.stderr.write(`Protocol drift metadata check failed: ${metadataResult.reason}\n`);
  process.exit(1);
}

if (breakingDrift && !hasProtocolCompanionChange(changedPaths)) {
  process.stderr.write(
    'Protocol-breaking drift detected without a companion runtime, UI, test, or automation change.\n',
  );
  process.exit(1);
}

process.stdout.write('Codex protocol drift gate passed.\n');
