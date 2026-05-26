#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const forbiddenExact = new Set([
  'chat.md',
  'instructions.md',
  'prompt.md',
  'prompts.md',
  'scratch.md',
  'notes.local.md',
]);
const forbiddenDirs = new Set(['.agent', '.cursor', '.claude', '.codex']);
const forbiddenPatterns = [/\.transcript\./i, /\.chat\./i, /\.prompt\./i, /\.scratch\./i];
const skippedDirs = new Set([
  '.git',
  'node_modules',
  '.next',
  'coverage',
  'dist',
  'build',
  '.tools',
]);
const workflowUsesPattern = /^\s*uses:\s*([^#\s]+).*$/;
const fullShaPattern = /^[^@\s]+@[0-9a-f]{40}$/i;
const requiredRuntimeMatrixOs = ['ubuntu-24.04', 'windows-2025-vs2026'];
const findings = [];

function relative(absolutePath) {
  return path.relative(repoRoot, absolutePath).replaceAll('\\', '/');
}

function visit(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const absolutePath = path.join(dir, entry.name);
    const rel = relative(absolutePath);

    if (entry.isDirectory()) {
      if (skippedDirs.has(entry.name)) continue;
      if (forbiddenDirs.has(entry.name)) {
        findings.push(`${rel}/ matches a forbidden local-agent directory pattern`);
        continue;
      }
      visit(absolutePath);
      continue;
    }

    if (!entry.isFile()) continue;
    const lowerName = entry.name.toLowerCase();
    if (forbiddenExact.has(lowerName) || forbiddenPatterns.some((pattern) => pattern.test(rel))) {
      findings.push(`${rel} matches a forbidden prompt/transcript/scratch pattern`);
    }
    if ((lowerName === '.env' || lowerName.startsWith('.env.')) && lowerName !== '.env.example') {
      findings.push(`${rel} is an environment file that must not be committed`);
    }
  }
}

function checkWorkflow(filePath) {
  const text = fs.readFileSync(filePath, 'utf8');
  const rel = relative(filePath);
  if (/pull_request_target\s*:/.test(text)) {
    findings.push(`${rel} uses pull_request_target`);
  }
  if (/ubuntu-latest/.test(text)) {
    findings.push(`${rel} uses ubuntu-latest instead of an explicit image`);
  }
  if (/node-version:\s*['"]?20['"]?/.test(text)) {
    findings.push(`${rel} configures Node.js 20`);
  }
  if (/google-labs-code\/jules-invoke/i.test(text) || /JULES_API_KEY/.test(text)) {
    findings.push(`${rel} invokes an agent auto-fix workflow`);
  }
  if (
    /^\s{6,}(release_?version|version|tag_name|tag):\s*$/im.test(text) ||
    /github\.event\.inputs\.(release_?version|version|tag_name|tag)/i.test(text) ||
    /\b(RELEASE_VERSION|INPUT_VERSION)\b/.test(text)
  ) {
    findings.push(`${rel} exposes a manual release version or tag input`);
  }
  if (/if:\s*\$\{\{\s*true\s*\}\}/.test(text) || /if:\s*true\b/.test(text)) {
    findings.push(`${rel} uses an unconditional if: true workflow expression`);
  }

  for (const [lineIndex, line] of text.split(/\r?\n/).entries()) {
    const match = line.match(workflowUsesPattern);
    if (!match) continue;
    const value = match[1].replace(/^['"]|['"]$/g, '');
    if (value.startsWith('./')) continue;
    if (!fullShaPattern.test(value)) {
      findings.push(`${rel}:${lineIndex + 1} must pin uses: to a full 40-character SHA`);
    }
  }
}

function extractYamlList(text, key) {
  const lines = text.split(/\r?\n/);
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    const match = line.match(new RegExp(`^(\\s*)${key}:\\s*$`));
    if (!match) continue;
    const indent = match[1].length;
    const values = [];
    for (const child of lines.slice(index + 1)) {
      if (!child.trim()) continue;
      const childIndent = child.match(/^\s*/)[0].length;
      if (childIndent <= indent) break;
      const item = child.match(/^\s*-\s*['"]?([^'"]+)['"]?\s*$/);
      if (item) values.push(item[1]);
    }
    if (values.length > 0) return values;
  }
  return [];
}

function expectedNodeMajors(engineRange) {
  const match = engineRange.match(/^>=(\d+)\s+<(\d+)$/);
  if (!match) return [];
  const start = Number.parseInt(match[1], 10);
  const end = Number.parseInt(match[2], 10);
  const majors = [];
  for (let major = start; major < end; major += 1) {
    if (major % 2 === 0) majors.push(String(major));
  }
  return majors;
}

function checkRuntimeMatrix() {
  const packageJson = JSON.parse(fs.readFileSync(path.join(repoRoot, 'package.json'), 'utf8'));
  const ciText = fs.readFileSync(path.join(repoRoot, '.github', 'workflows', 'ci.yml'), 'utf8');
  const expectedNodes = expectedNodeMajors(packageJson.engines?.node ?? '');
  const actualNodes = extractYamlList(ciText, 'node-version');
  const actualOs = extractYamlList(ciText, 'os');
  if (expectedNodes.join(',') !== actualNodes.join(',')) {
    findings.push(
      `.github/workflows/ci.yml runtime matrix node-version [${actualNodes.join(', ')}] does not match package.json engines.node ${packageJson.engines?.node}`,
    );
  }
  for (const os of requiredRuntimeMatrixOs) {
    if (!actualOs.includes(os)) {
      findings.push(`.github/workflows/ci.yml runtime matrix is missing ${os}`);
    }
  }
}

visit(repoRoot);
checkRuntimeMatrix();

const workflowsDir = path.join(repoRoot, '.github', 'workflows');
if (fs.existsSync(workflowsDir)) {
  for (const entry of fs.readdirSync(workflowsDir)) {
    if (entry.endsWith('.yml') || entry.endsWith('.yaml')) {
      checkWorkflow(path.join(workflowsDir, entry));
    }
  }
}

if (findings.length > 0) {
  process.stderr.write(`Repository hygiene check failed:\n${findings.join('\n')}\n`);
  process.exit(1);
}

process.stdout.write('Repository hygiene check passed.\n');
