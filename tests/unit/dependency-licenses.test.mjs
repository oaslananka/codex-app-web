import { describe, expect, it } from 'vitest';
import {
  buildDependencyLicenseReport,
  classifyLicense,
  normalizeLicenseGroups,
  parseArgs,
  renderDependencyLicenseReport,
} from '../../scripts/check-dependency-licenses.mjs';

const policy = {
  allowedLicenses: ['MIT', 'Apache-2.0'],
  allowedExpressions: ['(MPL-2.0 OR Apache-2.0)'],
  reviewedExceptions: [
    {
      license: 'CC-BY-4.0',
      packages: ['browser-data'],
      reason: 'reviewed dataset exception',
    },
    {
      license: 'LGPL-3.0-or-later',
      packages: ['native-image-lib'],
      reason: 'reviewed native tooling exception',
    },
  ],
  deniedLicensePatterns: ['\\bGPL(?:-|$)', 'Commons[- ]Clause'],
};

describe('dependency license policy', () => {
  it('normalizes pnpm license groups into deterministic package entries', () => {
    const groups = {
      MIT: [
        {
          name: 'z-package',
          versions: ['2.0.0', '1.0.0'],
          paths: [`${process.cwd()}\\node_modules\\z-package`],
        },
      ],
      'Apache-2.0': [{ name: 'a-package', versions: ['1.0.0'], paths: [] }],
    };

    expect(normalizeLicenseGroups(groups).map((entry) => entry.name)).toEqual([
      'a-package',
      'z-package',
    ]);
  });

  it('classifies allowed licenses, reviewed exceptions, and denied licenses', () => {
    expect(classifyLicense({ name: 'ok', license: 'MIT' }, policy).status).toBe('allowed');
    expect(classifyLicense({ name: 'browser-data', license: 'CC-BY-4.0' }, policy).status).toBe(
      'exception',
    );
    expect(
      classifyLicense({ name: 'native-image-lib', license: 'LGPL-3.0-or-later' }, policy).status,
    ).toBe('exception');
    expect(classifyLicense({ name: 'blocked', license: 'GPL-3.0-only' }, policy).status).toBe(
      'denied',
    );
  });

  it('reports unknown expressions as violations', () => {
    const report = buildDependencyLicenseReport(
      {
        MIT: [{ name: 'allowed-package', versions: ['1.0.0'], paths: [] }],
        'Custom-License': [{ name: 'unknown-package', versions: ['1.0.0'], paths: [] }],
      },
      policy,
      '2026-05-26T00:00:00.000Z',
    );

    expect(report.violations).toHaveLength(1);
    expect(renderDependencyLicenseReport(report)).toContain('dependency license scan: FAIL');
  });

  it('parses policy and report overrides relative to the repository', () => {
    const options = parseArgs(['--policy', 'license-policy.json', '--report', 'dist/report.json']);

    expect(options.policyPath.endsWith('license-policy.json')).toBe(true);
    expect(
      options.reportPath.endsWith('dist\\report.json') ||
        options.reportPath.endsWith('dist/report.json'),
    ).toBe(true);
  });
});
