import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { TerminalPanel } from '../../src/components/codex/panels/TerminalPanel';

const mockedShellState = vi.hoisted(() => ({
  activeTab: 'terminal',
}));

const mockedTerminalState = vi.hoisted(() => ({
  terminalCommand: '',
  terminalCwd: '',
  terminalOutput: [] as Array<{ id: string; channel: string; text: string }>,
  terminalRunning: false,
  terminalSize: { cols: 120, rows: 32 },
  terminalStdin: '',
}));

const mockedActions = vi.hoisted(() => ({
  terminal: {
    kill: () => undefined,
    run: () => undefined,
    setCommand: () => undefined,
    setCwd: () => undefined,
    setSize: () => undefined,
    setStdin: () => undefined,
    stop: () => undefined,
    write: () => undefined,
  },
}));

vi.mock('../../src/components/codex/ControlCenterContext', () => ({
  useControlCenterActions: () => mockedActions,
  useShellState: () => mockedShellState,
  useTerminalState: () => mockedTerminalState,
}));

describe('TerminalPanel', () => {
  beforeEach(() => {
    mockedShellState.activeTab = 'terminal';
    mockedTerminalState.terminalCommand = '';
    mockedTerminalState.terminalCwd = '';
    mockedTerminalState.terminalOutput = [];
    mockedTerminalState.terminalRunning = false;
    mockedTerminalState.terminalStdin = '';
    mockedTerminalState.terminalSize = { cols: 120, rows: 32 };
  });

  it('renders the idle terminal empty state', () => {
    const markup = renderToStaticMarkup(<TerminalPanel />);

    expect(markup).toContain('id="panel-terminal"');
    expect(markup).toContain('Idle');
    expect(markup).toContain('No output yet');
    expect(markup).toContain('Start a command to enable process input');
  });

  it('renders running output lines and process input controls', () => {
    mockedTerminalState.terminalCommand = 'pnpm test';
    mockedTerminalState.terminalCwd = '/workspace';
    mockedTerminalState.terminalRunning = true;
    mockedTerminalState.terminalStdin = 'yes';
    mockedTerminalState.terminalOutput = [
      { id: 'line-1', channel: 'stdout', text: '$ pnpm test' },
      { id: 'line-2', channel: 'stderr', text: 'warning-free output' },
    ];

    const markup = renderToStaticMarkup(<TerminalPanel />);

    expect(markup).toContain('Running');
    expect(markup).toContain('2 lines');
    expect(markup).toContain('warning-free output');
    expect(markup).toContain('Type input for the running command');
  });
});
