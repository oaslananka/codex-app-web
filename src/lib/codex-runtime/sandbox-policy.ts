import type { RuntimeSnapshot } from './types';

export type TurnSandboxPolicy =
  | { type: 'readOnly'; networkAccess: boolean }
  | {
      type: 'workspaceWrite';
      writableRoots: string[];
      networkAccess: boolean;
      excludeTmpdirEnvVar: boolean;
      excludeSlashTmp: boolean;
    }
  | { type: 'dangerFullAccess' };

function workspaceWriteConfig(state: RuntimeSnapshot): Record<string, unknown> {
  const value = state.configData?.sandbox_workspace_write;
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((entry): entry is string => typeof entry === 'string')
    : [];
}

function booleanValue(value: unknown, fallback: boolean): boolean {
  return typeof value === 'boolean' ? value : fallback;
}

function isSupportedSandboxMode(
  value: string,
): value is 'read-only' | 'workspace-write' | 'danger-full-access' {
  return value === 'read-only' || value === 'workspace-write' || value === 'danger-full-access';
}

function resolveSandboxMode(state: RuntimeSnapshot): string {
  const selected = typeof state.selectedSandboxMode === 'string' ? state.selectedSandboxMode : '';
  if (isSupportedSandboxMode(selected)) {
    return selected;
  }

  const configured =
    typeof state.configData?.sandbox_mode === 'string' ? state.configData.sandbox_mode : '';
  return isSupportedSandboxMode(configured) ? configured : '';
}

export function buildTurnSandboxPolicy(state: RuntimeSnapshot): TurnSandboxPolicy | undefined {
  const selectedSandboxMode = resolveSandboxMode(state);

  if (selectedSandboxMode === 'read-only') {
    return { type: 'readOnly', networkAccess: false };
  }

  if (selectedSandboxMode === 'workspace-write') {
    const config = workspaceWriteConfig(state);
    return {
      type: 'workspaceWrite',
      writableRoots: stringArray(config.writable_roots),
      networkAccess: booleanValue(config.network_access, false),
      excludeTmpdirEnvVar: booleanValue(config.exclude_tmpdir_env_var, false),
      excludeSlashTmp: booleanValue(config.exclude_slash_tmp, false),
    };
  }

  if (selectedSandboxMode === 'danger-full-access') {
    return { type: 'dangerFullAccess' };
  }

  return undefined;
}
