#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

export const defaultPolicyPath = path.join(repoRoot, 'license-policy.json');
export const defaultReportPath = path.join(
  repoRoot,
  'dist',
  'license-report',
  'pnpm-license-report.json',
);

export function parseArgs(args) {
  const options = { policyPath: defaultPolicyPath, reportPath: defaultReportPath };
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === '--policy') options.policyPath = path.resolve(repoRoot, args[++index] ?? '');
    else if (arg === '--report') options.reportPath = path.resolve(repoRoot, args[++index] ?? '');
    else throw new Error(`Unknown dependency license option: ${arg}`);
  }
  return options;
}

export function normalizeLicenseGroups(licenseGroups) {
  return Object.entries(licenseGroups)
    .flatMap(([license, packages]) =>
      packages.map((pkg) => ({
        license,
        name: pkg.name,
        versions: uniqueSorted(pkg.versions ?? []),
        homepage: pkg.homepage ?? null,
        paths: uniqueSorted((pkg.paths ?? []).map((entry) => toRepoPath(entry))),
      })),
    )
    .sort(compareLicenseEntries);
}

export function classifyLicense(entry, policy) {
  const exception = findReviewedException(entry, policy.reviewedExceptions);
  if (exception) return { status: 'exception', reason: exception.reason };
  if (policy.allowedLicenses.includes(entry.license))
    return { status: 'allowed', reason: 'allowed' };
  if (policy.allowedExpressions.includes(entry.license))
    return { status: 'allowed', reason: 'allowed expression' };
  const deniedPattern = findDeniedPattern(entry.license, policy.deniedLicensePatterns);
  if (deniedPattern) return { status: 'denied', reason: `matches denied pattern ${deniedPattern}` };
  return { status: 'unknown', reason: 'license expression is not in license-policy.json' };
}

export function buildDependencyLicenseReport(licenseGroups, policy, generatedAt = nowIso()) {
  const packages = normalizeLicenseGroups(licenseGroups).map((entry) => ({
    ...entry,
    ...classifyLicense(entry, policy),
  }));
  const byStatus = statusCounts(packages);
  return {
    generatedAt,
    policy: policySummary(policy),
    totals: {
      packages: packages.length,
      licenses: new Set(packages.map((entry) => entry.license)).size,
      ...byStatus,
    },
    reviewedExceptions: packages.filter((entry) => entry.status === 'exception'),
    violations: packages.filter((entry) => ['denied', 'unknown'].includes(entry.status)),
    packages,
  };
}

export function renderDependencyLicenseReport(report) {
  const lines = [
    `dependency license scan: ${report.violations.length === 0 ? 'PASS' : 'FAIL'}`,
    `packages: ${report.totals.packages}`,
    `licenses: ${report.totals.licenses}`,
    `allowed: ${report.totals.allowed}`,
    `reviewed exceptions: ${report.totals.exception}`,
    `violations: ${report.totals.denied + report.totals.unknown}`,
  ];
  return lines.concat(report.violations.map(renderViolation)).join('\n');
}

export function loadLicensePolicy(policyPath = defaultPolicyPath) {
  const policy = JSON.parse(fs.readFileSync(policyPath, 'utf8'));
  for (const key of policyArrayKeys) {
    if (!Array.isArray(policy[key])) throw new Error(`license-policy.json ${key} must be an array`);
  }
  return policy;
}

function policySummary(policy) {
  return {
    allowedLicenses: policy.allowedLicenses,
    allowedExpressions: policy.allowedExpressions,
    deniedLicensePatterns: policy.deniedLicensePatterns,
  };
}

function statusCounts(packages) {
  return packages.reduce(
    (counts, entry) => ({ ...counts, [entry.status]: (counts[entry.status] ?? 0) + 1 }),
    { allowed: 0, exception: 0, denied: 0, unknown: 0 },
  );
}

function renderViolation(entry) {
  return `- ${entry.name}@${entry.versions.join(',')} ${entry.license}: ${entry.reason}`;
}

function findReviewedException(entry, exceptions) {
  return exceptions.find(
    (exception) => exception.license === entry.license && exception.packages.includes(entry.name),
  );
}

function findDeniedPattern(license, patterns) {
  return patterns.find((pattern) => new RegExp(pattern, 'i').test(license));
}

function uniqueSorted(values) {
  return [...new Set(values)].sort();
}

function toRepoPath(filePath) {
  return path.relative(repoRoot, filePath).replaceAll('\\', '/');
}

function compareLicenseEntries(left, right) {
  return (
    left.license.localeCompare(right.license) ||
    left.name.localeCompare(right.name) ||
    left.versions.join(',').localeCompare(right.versions.join(','))
  );
}

function pnpmCommand() {
  if (process.env.npm_execpath)
    return { command: process.execPath, args: [process.env.npm_execpath] };
  return { command: process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm', args: [] };
}

function runPnpmLicenses() {
  const pnpm = pnpmCommand();
  const result = spawnSync(pnpm.command, [...pnpm.args, 'licenses', 'list', '--json', '--long'], {
    cwd: repoRoot,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  if (result.status !== 0)
    throw new Error(`pnpm licenses failed:\n${result.stderr || result.stdout}`);
  return JSON.parse(result.stdout);
}

function writeReport(reportPath, report) {
  fs.mkdirSync(path.dirname(reportPath), { recursive: true });
  fs.writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`);
}

function nowIso() {
  return new Date().toISOString();
}

const policyArrayKeys = [
  'allowedLicenses',
  'allowedExpressions',
  'reviewedExceptions',
  'deniedLicensePatterns',
];

function main() {
  const options = parseArgs(process.argv.slice(2));
  const report = buildDependencyLicenseReport(
    runPnpmLicenses(),
    loadLicensePolicy(options.policyPath),
  );
  writeReport(options.reportPath, report);
  process.stdout.write(`${renderDependencyLicenseReport(report)}\n`);
  if (report.violations.length > 0) process.exit(1);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  main();
}
