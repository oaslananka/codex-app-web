import { describe, expect, it } from 'vitest';
import { buildInitialState } from '../../src/lib/codex-runtime/runtime-state';
import { buildTurnSandboxPolicy } from '../../src/lib/codex-runtime/sandbox-policy';

describe('buildTurnSandboxPolicy', () => {
  it('maps read-only selection to a readOnly policy', () => {
    expect(
      buildTurnSandboxPolicy({
        ...buildInitialState(),
        selectedSandboxMode: 'read-only',
      }),
    ).toEqual({ type: 'readOnly', networkAccess: false });
  });

  it('maps workspace-write selection with config-driven fields', () => {
    expect(
      buildTurnSandboxPolicy({
        ...buildInitialState(),
        selectedSandboxMode: 'workspace-write',
        configData: {
          sandbox_workspace_write: {
            writable_roots: ['/workspace', '/tmp/project'],
            network_access: true,
            exclude_tmpdir_env_var: true,
            exclude_slash_tmp: true,
          },
        },
      }),
    ).toEqual({
      type: 'workspaceWrite',
      writableRoots: ['/workspace', '/tmp/project'],
      networkAccess: true,
      excludeTmpdirEnvVar: true,
      excludeSlashTmp: true,
    });
  });

  it('maps danger-full-access selection to dangerFullAccess', () => {
    expect(
      buildTurnSandboxPolicy({
        ...buildInitialState(),
        selectedSandboxMode: 'danger-full-access',
      }),
    ).toEqual({ type: 'dangerFullAccess' });
  });

  it('falls back to configured sandbox mode when no quick-session value is selected', () => {
    expect(
      buildTurnSandboxPolicy({
        ...buildInitialState(),
        configData: { sandbox_mode: 'read-only' },
      }),
    ).toEqual({ type: 'readOnly', networkAccess: false });
  });

  it('falls back to configured sandbox mode when quick-session value is unsupported', () => {
    expect(
      buildTurnSandboxPolicy({
        ...buildInitialState(),
        selectedSandboxMode: 'unsupported',
        configData: { sandbox_mode: 'workspace-write' },
      }),
    ).toEqual({
      type: 'workspaceWrite',
      writableRoots: [],
      networkAccess: false,
      excludeTmpdirEnvVar: false,
      excludeSlashTmp: false,
    });
  });
});
