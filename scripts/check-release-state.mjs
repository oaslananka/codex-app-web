#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function exists(relativePath) {
  return fs.existsSync(path.join(repoRoot, relativePath));
}

function readJson(relativePath) {
  return JSON.parse(fs.readFileSync(path.join(repoRoot, relativePath), 'utf8'));
}

const packageJson = readJson('package.json');
const releasePleaseConfig = exists('release-please-config.json')
  ? readJson('release-please-config.json')
  : null;
const releasePleaseManifest = exists('.release-please-manifest.json')
  ? readJson('.release-please-manifest.json')
  : null;
const workflowsDir = path.join(repoRoot, '.github', 'workflows');
const workflowFiles = fs.existsSync(workflowsDir)
  ? fs.readdirSync(workflowsDir).filter((file) => /\.(ya?ml)$/.test(file))
  : [];
const workflowText = workflowFiles
  .map((file) => fs.readFileSync(path.join(workflowsDir, file), 'utf8'))
  .join('\n');
const azureText = exists('azure-pipelines.yml')
  ? fs.readFileSync(path.join(repoRoot, 'azure-pipelines.yml'), 'utf8')
  : '';

const releaseSurfaces = {
  githubRelease: /gh\s+release|softprops\/action-gh-release|actions\/attest|release-please/i.test(
    workflowText,
  ),
  azureReleaseStage: /stage:\s*release|deployment:|environment:/i.test(azureText),
  npmPackage:
    Boolean(packageJson.publishConfig) ||
    Object.keys(packageJson.scripts ?? {}).some((script) => /(^|:)publish($|:)/.test(script)),
  containerImage: exists('Dockerfile') || /ghcr\.io|docker\/build-push-action/i.test(workflowText),
  staticDeployment: /pages|vercel|netlify|azure static web apps/i.test(workflowText + azureText),
};

const findings = [];
if (releaseSurfaces.githubRelease) {
  if (!releasePleaseConfig) {
    findings.push('release-please-config.json is required for GitHub Release automation');
  }
  if (!releasePleaseManifest) {
    findings.push('.release-please-manifest.json is required for release-please manifest mode');
  }
  if (releasePleaseConfig?.packages?.['.']?.['package-name'] !== packageJson.name) {
    findings.push('release-please package-name must match package.json name');
  }
  if (releasePleaseManifest?.['.'] !== packageJson.version) {
    findings.push('release-please manifest version must match package.json version');
  }
  if (!/release-please-action@[0-9a-f]{40}/i.test(workflowText)) {
    findings.push('release workflow must use a SHA-pinned release-please action');
  }
  if (!/(?:actions\/attest|attest-build-provenance)@[0-9a-f]{40}/i.test(workflowText)) {
    findings.push('release workflow must generate artifact attestations');
  }
  if (!/\.intoto\.jsonl/.test(workflowText)) {
    findings.push('release workflow must attach provenance as a release asset');
  }
  if (!/pnpm\s+pack/.test(workflowText)) {
    findings.push('release workflow must build a package artifact');
  }
  if (!/trivy\s+fs\s+--format\s+cyclonedx/.test(workflowText)) {
    findings.push('release workflow must generate an SBOM');
  }
  if (!/sha256sum/.test(workflowText)) {
    findings.push('release workflow must generate SHA256 checksums');
  }
  if (
    /^\s{6,}(release_?version|version|tag_name|tag):\s*$/im.test(workflowText) ||
    /github\.event\.inputs\.(release_?version|version|tag_name|tag)/i.test(workflowText) ||
    /\b(RELEASE_VERSION|INPUT_VERSION)\b/.test(workflowText)
  ) {
    findings.push('release workflow must not accept manual version or tag input');
  }
}

const configuredTargets = Object.entries(releaseSurfaces)
  .filter(([, enabled]) => enabled)
  .map(([name]) => name);

const result = {
  packageName: packageJson.name,
  packageVersion: packageJson.version,
  releaseSurfaces,
  configuredTargets,
  publishReady: configuredTargets.length > 0,
  releasePlease: {
    config: Boolean(releasePleaseConfig),
    manifest: Boolean(releasePleaseManifest),
    packageNameMatches: releasePleaseConfig?.packages?.['.']?.['package-name'] === packageJson.name,
    manifestVersionMatches: releasePleaseManifest?.['.'] === packageJson.version,
  },
};

process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);

if (configuredTargets.length === 0) {
  process.stderr.write('No configured publish target was detected.\n');
  process.exit(2);
}

if (findings.length > 0) {
  process.stderr.write(`Release-state check failed:\n${findings.join('\n')}\n`);
  process.exit(1);
}
