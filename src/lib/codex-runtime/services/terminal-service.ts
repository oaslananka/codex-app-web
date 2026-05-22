import { normalizeError } from '../errors';
import type { RuntimeStore } from '../store';
import { sanitizeTerminalOutput } from '../terminal-output';
import { decodeBase64Utf8, encodeBase64Utf8 } from '../utf8-base64';

const MAX_TERMINAL_LINES = 800;
type RuntimePlatform = 'win32' | 'darwin' | 'linux' | 'unknown';

type ServiceDeps = {
  requestCompat: <T = unknown>(
    canonicalMethod: string,
    params?: unknown,
    fallbacks?: readonly string[],
  ) => Promise<T>;
  markRequestSupported(method: string): void;
  markRequestUnsupported(method: string): void;
  toast(message: string, type?: 'info' | 'success' | 'error'): void;
};

function createLineId() {
  return `line-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

export function detectRuntimePlatform(): RuntimePlatform {
  const navigatorLike = globalThis.navigator as
    | (Navigator & { userAgentData?: { platform?: string } })
    | undefined;
  const userAgentPlatform =
    navigatorLike &&
    typeof navigatorLike.userAgentData === 'object' &&
    navigatorLike.userAgentData &&
    typeof navigatorLike.userAgentData.platform === 'string'
      ? navigatorLike.userAgentData.platform
      : '';
  const platform = (userAgentPlatform || navigatorLike?.platform || '').toLowerCase();
  if (platform.includes('win')) return 'win32';
  if (platform.includes('mac')) return 'darwin';
  if (platform.includes('linux')) return 'linux';
  return 'unknown';
}

export function buildShellCommand(command: string, platform = detectRuntimePlatform()) {
  if (platform === 'win32') {
    return ['powershell.exe', '-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command', command];
  }
  return ['bash', '-lc', command];
}

export class TerminalService {
  constructor(
    private readonly store: RuntimeStore,
    private readonly deps: ServiceDeps,
  ) {}

  setCommand(command: string) {
    this.store.patch({ terminalCommand: command });
  }

  setCwd(cwd: string) {
    this.store.patch({ terminalCwd: cwd });
  }

  setStdin(stdin: string) {
    this.store.patch({ terminalStdin: stdin });
  }

  setTerminalSize(cols: number, rows: number) {
    const state = this.store.getState();
    this.store.patch({ terminalSize: { cols, rows } });
    if (state.currentProcId && state.terminalRunning) {
      void this.resize();
    }
  }

  async run() {
    const state = this.store.getState();
    const command = state.terminalCommand.trim();
    if (!command) return;
    const processId = `proc-${Date.now()}-${Math.random().toString(16).slice(2)}`;
    this.store.patch({
      terminalOutput: [{ id: createLineId(), channel: 'stdout', text: `$ ${command}\n` }],
      terminalRunning: true,
      currentProcId: processId,
    });

    try {
      const response = (await this.deps.requestCompat('command/exec', {
        command: buildShellCommand(command),
        cwd: state.terminalCwd || undefined,
        processId,
        tty: true,
        streamStdin: true,
        streamStdoutStderr: true,
        terminalSize: state.terminalSize,
      })) as Record<string, unknown>;

      if (typeof response.stdout === 'string' && response.stdout)
        this.appendOutput(response.stdout, 'stdout');
      if (typeof response.stderr === 'string' && response.stderr)
        this.appendOutput(response.stderr, 'stderr');
      this.appendOutput(`\n[Exit: ${String(response.exitCode ?? 'unknown')}]\n`, 'exit');
      this.deps.markRequestSupported('command/exec');
    } catch (error) {
      this.appendOutput(`\n[Error: ${normalizeError(error)}]\n`, 'stderr');
      this.deps.markRequestUnsupported('command/exec');
    } finally {
      this.store.patch({ terminalRunning: false, currentProcId: null });
    }
  }

  async resize() {
    const state = this.store.getState();
    if (!state.currentProcId) return;
    try {
      await this.deps.requestCompat('command/exec/resize', {
        processId: state.currentProcId,
        terminalSize: state.terminalSize,
      });
      this.deps.markRequestSupported('command/exec/resize');
    } catch {
      this.deps.markRequestUnsupported('command/exec/resize');
    }
  }

  async write() {
    const state = this.store.getState();
    if (!state.currentProcId || !state.terminalStdin.trim()) return;
    try {
      await this.deps.requestCompat('command/exec/write', {
        processId: state.currentProcId,
        deltaBase64: encodeBase64Utf8(`${state.terminalStdin}\n`),
      });
      this.store.patch({ terminalStdin: '' });
      this.deps.markRequestSupported('command/exec/write');
    } catch (error) {
      this.deps.markRequestUnsupported('command/exec/write');
      this.deps.toast(`Failed to write stdin: ${normalizeError(error)}`, 'error');
    }
  }

  async kill() {
    const state = this.store.getState();
    if (!state.currentProcId) return;
    try {
      await this.deps.requestCompat('command/exec/terminate', { processId: state.currentProcId });
      this.appendOutput('\n[Terminated]\n', 'exit');
      this.store.patch({ terminalRunning: false, currentProcId: null });
      this.deps.markRequestSupported('command/exec/terminate');
    } catch (error) {
      this.deps.markRequestUnsupported('command/exec/terminate');
      this.deps.toast(`Failed to terminate process: ${normalizeError(error)}`, 'error');
    }
  }

  handleExecOutputDelta(payload: Record<string, unknown>) {
    const stream = payload.stream === 'stderr' ? 'stderr' : 'stdout';
    const deltaBase64 = typeof payload.deltaBase64 === 'string' ? payload.deltaBase64 : '';
    this.appendOutput(decodeBase64Utf8(deltaBase64), stream);
  }

  private appendOutput(text: string, channel: string) {
    const sanitizedText = sanitizeTerminalOutput(text);
    if (!sanitizedText) return;
    const state = this.store.getState();
    this.store.patch({
      terminalOutput: [
        ...state.terminalOutput,
        {
          id: createLineId(),
          channel,
          text: sanitizedText,
        },
      ].slice(-MAX_TERMINAL_LINES),
    });
  }
}
