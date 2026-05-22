import { describe, expect, it, vi } from 'vitest';
import { buildInitialState } from '../../src/lib/codex-runtime/runtime-state';
import { RuntimeStore } from '../../src/lib/codex-runtime/store';
import {
  buildShellCommand,
  TerminalService,
} from '../../src/lib/codex-runtime/services/terminal-service';
import { encodeBase64Utf8 } from '../../src/lib/codex-runtime/utf8-base64';

type RequestCompat = <T = unknown>(
  canonicalMethod: string,
  params?: unknown,
  fallbacks?: readonly string[],
) => Promise<T>;

function createService(requestCompat: RequestCompat) {
  const store = new RuntimeStore(buildInitialState());
  const deps = {
    requestCompat,
    markRequestSupported: vi.fn(),
    markRequestUnsupported: vi.fn(),
    toast: vi.fn(),
  };
  const service = new TerminalService(store, deps);

  return { deps, service, store };
}

describe('buildShellCommand', () => {
  it('uses PowerShell on Windows', () => {
    expect(buildShellCommand('Get-Location', 'win32')).toEqual([
      'powershell.exe',
      '-NoProfile',
      '-ExecutionPolicy',
      'Bypass',
      '-Command',
      'Get-Location',
    ]);
  });

  it('uses bash login-compatible command execution on Unix platforms', () => {
    expect(buildShellCommand('pwd', 'linux')).toEqual(['bash', '-lc', 'pwd']);
    expect(buildShellCommand('pwd', 'darwin')).toEqual(['bash', '-lc', 'pwd']);
    expect(buildShellCommand('pwd', 'unknown')).toEqual(['bash', '-lc', 'pwd']);
  });

  it('runs commands through the backend with cwd, tty, streams, and terminal size', async () => {
    const requestCompat = vi.fn(async (method: string, params?: unknown) => {
      expect(method).toBe('command/exec');
      expect(params).toEqual(
        expect.objectContaining({
          cwd: '/workspace/project',
          tty: true,
          streamStdin: true,
          streamStdoutStderr: true,
          terminalSize: { cols: 140, rows: 40 },
        }),
      );
      expect((params as Record<string, unknown>).command).toContain('printf hello');
      expect(String((params as Record<string, unknown>).processId)).toMatch(/^proc-/);
      return { stdout: 'hello', stderr: 'warn', exitCode: 0 };
    }) as RequestCompat;
    const { deps, service, store } = createService(requestCompat);
    store.patch({
      terminalCommand: 'printf hello',
      terminalCwd: '/workspace/project',
      terminalSize: { cols: 140, rows: 40 },
    });

    await service.run();

    expect(store.getState().terminalRunning).toBe(false);
    expect(store.getState().currentProcId).toBeNull();
    expect(
      store
        .getState()
        .terminalOutput.map((line) => line.text)
        .join(''),
    ).toContain('$ printf hello\nhellowarn\n[Exit: 0]\n');
    expect(deps.markRequestSupported).toHaveBeenCalledWith('command/exec');
  });

  it('keeps terminal state idle when command input is blank', async () => {
    const requestCompat = vi.fn() as RequestCompat;
    const { service, store } = createService(requestCompat);
    store.patch({ terminalCommand: '   ' });

    await service.run();

    expect(requestCompat).not.toHaveBeenCalled();
    expect(store.getState().terminalRunning).toBe(false);
    expect(store.getState().terminalOutput).toEqual([]);
  });

  it('writes stdin as UTF-8 base64 and clears the input on success', async () => {
    const requestCompat = vi.fn(async () => ({})) as RequestCompat;
    const { deps, service, store } = createService(requestCompat);
    store.patch({
      currentProcId: 'proc-1',
      terminalStdin: 'çalıştır',
    });

    await service.write();

    expect(requestCompat).toHaveBeenCalledWith('command/exec/write', {
      processId: 'proc-1',
      deltaBase64: encodeBase64Utf8('çalıştır\n'),
    });
    expect(store.getState().terminalStdin).toBe('');
    expect(deps.markRequestSupported).toHaveBeenCalledWith('command/exec/write');
  });

  it('resizes only when a process is active and running', async () => {
    const requestCompat = vi.fn(async () => ({})) as RequestCompat;
    const { service, store } = createService(requestCompat);
    store.patch({
      currentProcId: 'proc-1',
      terminalRunning: true,
    });

    service.setTerminalSize(160, 50);

    await vi.waitFor(() => {
      expect(requestCompat).toHaveBeenCalledWith('command/exec/resize', {
        processId: 'proc-1',
        terminalSize: { cols: 160, rows: 50 },
      });
    });
  });

  it('terminates the active process and appends a terminal marker', async () => {
    const requestCompat = vi.fn(async () => ({})) as RequestCompat;
    const { deps, service, store } = createService(requestCompat);
    store.patch({
      currentProcId: 'proc-1',
      terminalRunning: true,
    });

    await service.kill();

    expect(requestCompat).toHaveBeenCalledWith('command/exec/terminate', { processId: 'proc-1' });
    expect(store.getState()).toMatchObject({
      terminalRunning: false,
      currentProcId: null,
    });
    expect(store.getState().terminalOutput.at(-1)).toMatchObject({
      channel: 'exit',
      text: '\n[Terminated]\n',
    });
    expect(deps.markRequestSupported).toHaveBeenCalledWith('command/exec/terminate');
  });

  it('decodes streamed backend output deltas and sanitizes control bytes', () => {
    const { service, store } = createService(vi.fn() as RequestCompat);

    service.handleExecOutputDelta({
      stream: 'stderr',
      deltaBase64: encodeBase64Utf8('bad\u0000output'),
    });

    expect(store.getState().terminalOutput).toEqual([
      expect.objectContaining({
        channel: 'stderr',
        text: 'badoutput',
      }),
    ]);
  });
});
