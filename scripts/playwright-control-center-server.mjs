#!/usr/bin/env node

import fs from 'node:fs';
import { spawn } from 'node:child_process';
import nodeLoggerModule from '../src/lib/logging/node-logger.cjs';

const { createNodeLogger } = nodeLoggerModule;
const logger = createNodeLogger('script:playwright-server');
const uiPort = process.env.E2E_PORT || '1989';
const fallbackPort = process.env.E2E_PORT_FALLBACK || '1990';
const codexPort = process.env.E2E_CODEX_PORT || '41000';
const shouldSkipBuild = process.env.E2E_SKIP_BUILD === '1';
const children = new Set();

function pnpmCommand() {
  return 'pnpm';
}

function pipeChildOutput(name, stream, data) {
  const lines = String(data).split(/\r?\n/).filter(Boolean);
  for (const line of lines) {
    logger[stream === 'stderr' ? 'warn' : 'info'](`[${name}] ${line}`);
  }
}

function spawnChild(name, command, args, env = {}, options = {}) {
  const child = spawn(command, args, {
    cwd: process.cwd(),
    env: { ...process.env, ...env },
    shell: Boolean(options.shell),
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  children.add(child);
  child.stdout.on('data', (data) => pipeChildOutput(name, 'stdout', data));
  child.stderr.on('data', (data) => pipeChildOutput(name, 'stderr', data));
  child.on('exit', (code, signal) => {
    children.delete(child);
    logger.info(`${name} exited`, { code, signal });
  });
  return child;
}

function spawnPnpm(name, args, env = {}) {
  if (process.platform === 'win32') {
    return spawnChild(name, `${pnpmCommand()} ${args.join(' ')}`, [], env, { shell: true });
  }
  return spawnChild(name, pnpmCommand(), args, env);
}

async function waitForSuccessfulExit(name, child) {
  const code = await new Promise((resolve) => {
    child.on('exit', (exitCode) => resolve(exitCode ?? 1));
  });
  if (code !== 0) {
    throw new Error(`${name} exited with code ${code}`);
  }
}

async function buildIfNeeded() {
  if (shouldSkipBuild && fs.existsSync('.next/BUILD_ID')) {
    logger.info('Skipping E2E build because E2E_SKIP_BUILD=1 and .next/BUILD_ID exists');
    return;
  }
  const build = spawnPnpm('build', ['--silent', 'build'], {
    CI: process.env.CI || '1',
    NEXT_TELEMETRY_DISABLED: '1',
  });
  await waitForSuccessfulExit('build', build);
}

function startFixtureProcesses() {
  spawnChild('codex-fixture', process.execPath, ['scripts/e2e-codex-app-server.mjs'], {
    E2E_CODEX_PORT: codexPort,
  });
  spawnPnpm('ui', ['--silent', 'start:ui'], {
    NODE_ENV: 'production',
    NEXT_TELEMETRY_DISABLED: '1',
    PORT: uiPort,
    PORT_FALLBACK: fallbackPort,
    CODEX_BACKEND_URL: `ws://127.0.0.1:${codexPort}`,
  });
}

function shutdown(signal) {
  logger.info('Stopping Playwright control center server', { signal });
  for (const child of children) {
    child.kill(process.platform === 'win32' ? undefined : 'SIGTERM');
  }
}

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));

buildIfNeeded()
  .then(startFixtureProcesses)
  .catch((error) => {
    logger.error('Failed to start Playwright control center server', error);
    process.exitCode = 1;
  });
