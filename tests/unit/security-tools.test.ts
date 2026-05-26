import { describe, expect, it } from 'vitest';

// @ts-expect-error The runtime CLI is authored as native ESM for direct Node execution.
const securityTools = await import('../../scripts/security-tools.mjs');

describe('security tool bootstrap metadata', () => {
  it('maps supported platforms to pinned release assets', () => {
    expect(securityTools.assetNameFor('actionlint', 'linux', 'x64')).toBe(
      `actionlint_${securityTools.TOOL_VERSIONS.actionlint}_linux_amd64.tar.gz`,
    );
    expect(securityTools.assetNameFor('gitleaks', 'win32', 'x64')).toBe(
      `gitleaks_${securityTools.TOOL_VERSIONS.gitleaks}_windows_x64.zip`,
    );
    expect(securityTools.assetNameFor('trivy', 'darwin', 'arm64')).toBe(
      `trivy_${securityTools.TOOL_VERSIONS.trivy}_macOS-ARM64.tar.gz`,
    );
    expect(securityTools.assetNameFor('zizmor', 'linux', 'arm64')).toBe(
      'zizmor-aarch64-unknown-linux-gnu.tar.gz',
    );
  });

  it('selects all tools by default and parses explicit tool lists', () => {
    expect(securityTools.selectedToolNames([])).toEqual([
      'actionlint',
      'zizmor',
      'gitleaks',
      'trivy',
    ]);
    expect(securityTools.selectedToolNames(['--tools', 'actionlint,zizmor'])).toEqual([
      'actionlint',
      'zizmor',
    ]);
    expect(securityTools.selectedToolNames(['--tools=gitleaks,trivy'])).toEqual([
      'gitleaks',
      'trivy',
    ]);
  });

  it('extracts the matching SHA-256 checksum entry', () => {
    const checksums = [
      'a'.repeat(64) + '  actionlint_1.7.12_linux_arm64.tar.gz',
      'b'.repeat(64) + ' *actionlint_1.7.12_linux_amd64.tar.gz',
    ].join('\n');

    expect(securityTools.parseChecksum(checksums, 'actionlint_1.7.12_linux_amd64.tar.gz')).toBe(
      'b'.repeat(64),
    );
  });
});
