#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import {
  appendFile,
  chmod,
  copyFile,
  mkdir,
  readFile,
  readdir,
  rm,
  stat,
  writeFile,
} from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const TOOL_VERSIONS = Object.freeze({
  actionlint: '1.7.12',
  gitleaks: '8.30.1',
  trivy: '0.70.0',
  zizmor: '1.25.2',
});

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const toolRoot = path.join(repoRoot, '.tools', 'security');
const binDir = path.join(toolRoot, 'bin');
const cacheDir = path.join(toolRoot, 'cache');
const manifestPath = path.join(toolRoot, 'manifest.json');
const allTools = ['actionlint', 'zizmor', 'gitleaks', 'trivy'];
const userAgent = 'codex-app-web-security-bootstrap';

const toolDefinitions = Object.freeze({
  actionlint: {
    repo: 'rhysd/actionlint',
    version: TOOL_VERSIONS.actionlint,
    checksum: (version) => `actionlint_${version}_checksums.txt`,
    binary: 'actionlint',
    assets: {
      'darwin-arm64': (version) => `actionlint_${version}_darwin_arm64.tar.gz`,
      'darwin-x64': (version) => `actionlint_${version}_darwin_amd64.tar.gz`,
      'linux-arm64': (version) => `actionlint_${version}_linux_arm64.tar.gz`,
      'linux-x64': (version) => `actionlint_${version}_linux_amd64.tar.gz`,
      'win32-arm64': (version) => `actionlint_${version}_windows_arm64.zip`,
      'win32-x64': (version) => `actionlint_${version}_windows_amd64.zip`,
    },
  },
  gitleaks: {
    repo: 'gitleaks/gitleaks',
    version: TOOL_VERSIONS.gitleaks,
    checksum: (version) => `gitleaks_${version}_checksums.txt`,
    binary: 'gitleaks',
    assets: {
      'darwin-arm64': (version) => `gitleaks_${version}_darwin_arm64.tar.gz`,
      'darwin-x64': (version) => `gitleaks_${version}_darwin_x64.tar.gz`,
      'linux-arm64': (version) => `gitleaks_${version}_linux_arm64.tar.gz`,
      'linux-x64': (version) => `gitleaks_${version}_linux_x64.tar.gz`,
      'win32-arm64': (version) => `gitleaks_${version}_windows_arm64.zip`,
      'win32-x64': (version) => `gitleaks_${version}_windows_x64.zip`,
    },
  },
  trivy: {
    repo: 'aquasecurity/trivy',
    version: TOOL_VERSIONS.trivy,
    checksum: (version) => `trivy_${version}_checksums.txt`,
    binary: 'trivy',
    assets: {
      'darwin-arm64': (version) => `trivy_${version}_macOS-ARM64.tar.gz`,
      'darwin-x64': (version) => `trivy_${version}_macOS-64bit.tar.gz`,
      'linux-arm64': (version) => `trivy_${version}_Linux-ARM64.tar.gz`,
      'linux-x64': (version) => `trivy_${version}_Linux-64bit.tar.gz`,
      'win32-x64': (version) => `trivy_${version}_windows-64bit.zip`,
    },
  },
  zizmor: {
    repo: 'zizmorcore/zizmor',
    version: TOOL_VERSIONS.zizmor,
    binary: 'zizmor',
    assets: {
      'darwin-arm64': () => 'zizmor-aarch64-apple-darwin.tar.gz',
      'darwin-x64': () => 'zizmor-x86_64-apple-darwin.tar.gz',
      'linux-arm64': () => 'zizmor-aarch64-unknown-linux-gnu.tar.gz',
      'linux-x64': () => 'zizmor-x86_64-unknown-linux-gnu.tar.gz',
      'win32-x64': () => 'zizmor-x86_64-pc-windows-msvc.zip',
    },
  },
});

export function platformKey(platform = process.platform, arch = process.arch) {
  const normalizedArch = arch === 'x64' ? 'x64' : arch === 'arm64' ? 'arm64' : null;
  if (!normalizedArch) throw new Error(`Unsupported architecture for security tools: ${arch}`);
  return `${platform}-${normalizedArch}`;
}

export function assetNameFor(toolName, platform = process.platform, arch = process.arch) {
  const definition = toolDefinitions[toolName];
  if (!definition) throw new Error(`Unknown security tool: ${toolName}`);
  const assetTemplate = definition.assets[platformKey(platform, arch)];
  if (!assetTemplate)
    throw new Error(`${toolName} does not publish an asset for ${platform}/${arch}`);
  return assetTemplate(definition.version);
}

export function parseChecksum(checksumText, assetName) {
  for (const line of checksumText.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    const [hash, ...nameParts] = trimmed.split(/\s+/);
    const name = nameParts.join(' ').replace(/^\*/, '');
    if (/^[a-f0-9]{64}$/i.test(hash) && path.basename(name) === assetName) {
      return hash.toLowerCase();
    }
  }
  throw new Error(`Checksum entry not found for ${assetName}`);
}

export function selectedToolNames(args) {
  const selected = readToolsArgument(args);
  if (selected.length === 0) return allTools;
  for (const tool of selected) {
    if (!allTools.includes(tool)) throw new Error(`Unknown security tool requested: ${tool}`);
  }
  return selected;
}

function readToolsArgument(args) {
  const equalsArg = args.find((arg) => arg.startsWith('--tools='));
  if (equalsArg) return splitToolNames(equalsArg.slice('--tools='.length));
  const toolsIndex = args.indexOf('--tools');
  if (toolsIndex === -1) return [];
  return splitToolNames(args[toolsIndex + 1] ?? '');
}

function splitToolNames(value) {
  return value
    .split(',')
    .map((tool) => tool.trim())
    .filter(Boolean);
}

function executableName(toolName) {
  const baseName = toolDefinitions[toolName].binary;
  return process.platform === 'win32' ? `${baseName}.exe` : baseName;
}

function toolPath(toolName) {
  return path.join(binDir, executableName(toolName));
}

function releaseBaseUrl(definition) {
  return `https://github.com/${definition.repo}/releases/download/v${definition.version}`;
}

async function fetchBuffer(url) {
  const response = await fetch(url, { headers: githubHeaders() });
  if (!response.ok) throw new Error(`Download failed (${response.status}) for ${url}`);
  return Buffer.from(await response.arrayBuffer());
}

async function fetchJson(url) {
  const response = await fetch(url, { headers: githubHeaders() });
  if (!response.ok) throw new Error(`GitHub API request failed (${response.status}) for ${url}`);
  return response.json();
}

function githubHeaders() {
  const headers = { Accept: 'application/vnd.github+json', 'User-Agent': userAgent };
  if (process.env.GITHUB_TOKEN) headers.Authorization = `Bearer ${process.env.GITHUB_TOKEN}`;
  return headers;
}

async function sha256File(filePath) {
  const contents = await readFile(filePath);
  return createHash('sha256').update(contents).digest('hex');
}

async function downloadFile(url, targetPath) {
  await writeFile(targetPath, await fetchBuffer(url));
}

async function verifyDownloadedAsset(definition, assetName, archivePath) {
  const expected = definition.checksum
    ? await checksumFromReleaseFile(definition, assetName)
    : await checksumFromAssetDigest(definition, assetName);
  const actual = await sha256File(archivePath);
  if (actual !== expected) throw new Error(`Checksum mismatch for ${assetName}`);
  return actual;
}

async function checksumFromReleaseFile(definition, assetName) {
  const checksumAsset = definition.checksum(definition.version);
  const checksumUrl = `${releaseBaseUrl(definition)}/${checksumAsset}`;
  return parseChecksum((await fetchBuffer(checksumUrl)).toString('utf8'), assetName);
}

async function checksumFromAssetDigest(definition, assetName) {
  const url = `https://api.github.com/repos/${definition.repo}/releases/tags/v${definition.version}`;
  const release = await fetchJson(url);
  const asset = release.assets?.find((candidate) => candidate.name === assetName);
  const digest = asset?.digest;
  if (!digest?.startsWith('sha256:')) throw new Error(`No SHA-256 digest found for ${assetName}`);
  return digest.slice('sha256:'.length).toLowerCase();
}

async function readManifest() {
  if (!existsSync(manifestPath)) return { tools: {} };
  return JSON.parse(await readFile(manifestPath, 'utf8'));
}

async function writeManifest(manifest) {
  await mkdir(toolRoot, { recursive: true });
  await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
}

function manifestMatches(manifest, toolName) {
  const entry = manifest.tools?.[toolName];
  return entry?.version === toolDefinitions[toolName].version && existsSync(toolPath(toolName));
}

async function installTool(toolName, manifest) {
  if (manifestMatches(manifest, toolName)) {
    console.log(`${toolName} ${toolDefinitions[toolName].version} already installed`);
    return;
  }
  const definition = toolDefinitions[toolName];
  const assetName = assetNameFor(toolName);
  const archivePath = path.join(cacheDir, assetName);
  await mkdir(cacheDir, { recursive: true });
  await downloadFile(`${releaseBaseUrl(definition)}/${assetName}`, archivePath);
  const checksum = await verifyDownloadedAsset(definition, assetName, archivePath);
  await extractTool(toolName, assetName, archivePath);
  manifest.tools[toolName] = { version: definition.version, assetName, checksum };
  console.log(`installed ${toolName} ${definition.version}`);
}

async function extractTool(toolName, assetName, archivePath) {
  const extractDir = path.join(cacheDir, `${toolName}-extract`);
  await rm(extractDir, { recursive: true, force: true });
  await mkdir(extractDir, { recursive: true });
  if (assetName.endsWith('.zip')) {
    expandZip(archivePath, extractDir);
  } else {
    runChecked('tar', ['-xzf', archivePath, '-C', extractDir]);
  }
  const sourcePath = await findExtractedBinary(extractDir, executableName(toolName));
  await mkdir(binDir, { recursive: true });
  await copyFile(sourcePath, toolPath(toolName));
  if (process.platform !== 'win32') await chmod(toolPath(toolName), 0o755);
}

function expandZip(archivePath, extractDir) {
  if (process.platform !== 'win32') {
    runChecked('unzip', ['-q', archivePath, '-d', extractDir]);
    return;
  }
  const command = [
    'Add-Type -AssemblyName System.IO.Compression.FileSystem',
    `[System.IO.Compression.ZipFile]::ExtractToDirectory('${escapePowerShell(
      archivePath,
    )}', '${escapePowerShell(extractDir)}')`,
  ].join('; ');
  runChecked('powershell', ['-NoProfile', '-Command', command]);
}

function escapePowerShell(value) {
  return value.replaceAll("'", "''");
}

async function findExtractedBinary(dir, binaryName) {
  for (const entry of await readdir(dir)) {
    const absolutePath = path.join(dir, entry);
    const info = await stat(absolutePath);
    if (info.isDirectory()) {
      const found = await findExtractedBinary(absolutePath, binaryName).catch(() => null);
      if (found) return found;
    }
    if (info.isFile() && entry === binaryName) return absolutePath;
  }
  throw new Error(`Extracted archive did not contain ${binaryName}`);
}

function runChecked(command, args, options = {}) {
  const result = spawnSync(command, args, { cwd: repoRoot, stdio: 'inherit', ...options });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
}

function securityToolEnv() {
  const env = { ...process.env };
  const pathKey = Object.keys(env).find((key) => key.toLowerCase() === 'path') ?? 'PATH';
  env[pathKey] = `${binDir}${path.delimiter}${env[pathKey] ?? ''}`;
  return env;
}

async function exposeGitHubPath() {
  if (process.env.GITHUB_PATH) await appendFile(process.env.GITHUB_PATH, `${binDir}\n`);
}

async function bootstrap(args) {
  const manifest = await readManifest();
  for (const toolName of selectedToolNames(args)) await installTool(toolName, manifest);
  manifest.generatedAt = new Date().toISOString();
  await writeManifest(manifest);
  await exposeGitHubPath();
}

async function requireTools(toolNames) {
  const manifest = await readManifest();
  const missing = toolNames.filter((toolName) => !manifestMatches(manifest, toolName));
  if (missing.length === 0) return;
  const details = missing
    .map((toolName) => `${toolName}@${toolDefinitions[toolName].version}`)
    .join(', ');
  throw new Error(`Missing pinned security scanner(s): ${details}. Run: pnpm security:bootstrap`);
}

async function runTool(toolName, args) {
  await requireTools([toolName]);
  runChecked(toolPath(toolName), args, { env: securityToolEnv() });
}

async function runActions() {
  await requireTools(['actionlint', 'zizmor']);
  await runTool('actionlint', []);
  await runTool('zizmor', ['--offline', '.']);
}

async function runSecrets() {
  await runTool('gitleaks', [
    'detect',
    '--no-git',
    '--redact',
    '--config',
    '.gitleaks.toml',
    '--source',
    '.',
    '--exit-code',
    '1',
  ]);
}

async function runTrivy() {
  await runTool('trivy', [
    'fs',
    '--scanners',
    'vuln,secret,misconfig',
    '--skip-dirs',
    'node_modules',
    '--skip-dirs',
    '.git',
    '--skip-dirs',
    '.next',
    '--skip-dirs',
    '.tools',
    '--skip-dirs',
    '.stryker-tmp',
    '--exit-code',
    '1',
    '.',
  ]);
}

async function runScan() {
  await requireTools(allTools);
  runChecked(process.execPath, ['scripts/check-repository-hygiene.mjs'], {
    env: securityToolEnv(),
  });
  runChecked(process.execPath, ['scripts/check-reuse-compliance.mjs']);
  runChecked(process.execPath, ['scripts/check-dependency-licenses.mjs']);
  await runActions();
  await runSecrets();
  await runTrivy();
}

async function main() {
  const [command, ...args] = process.argv.slice(2);
  if (command === 'bootstrap') return bootstrap(args);
  if (command === 'actions') return runActions();
  if (command === 'secrets') return runSecrets();
  if (command === 'trivy') return runTrivy();
  if (command === 'scan') return runScan();
  throw new Error('Usage: node scripts/security-tools.mjs <bootstrap|actions|secrets|trivy|scan>');
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  });
}
