#!/usr/bin/env node

import { WebSocket, WebSocketServer } from 'ws';
import nodeLoggerModule from '../src/lib/logging/node-logger.cjs';

const { createNodeLogger } = nodeLoggerModule;
const logger = createNodeLogger('script:e2e-codex');
const port = Number.parseInt(process.env.E2E_CODEX_PORT || process.env.CODEX_PORT || '41000', 10);
const approvalDelayMs = Number.parseInt(process.env.E2E_APPROVAL_DELAY_MS || '350', 10);
const workspaceRoot = '/workspace/codex-app-web';
const fixtureUpdatedAt = '2026-05-26T12:00:00.000Z';
const readyThreadId = '123e4567-e89b-42d3-a456-426614174901';
const errorThreadId = '123e4567-e89b-42d3-a456-426614174902';

let nextServerRequestId = 30_000;

const threads = [
  {
    id: readyThreadId,
    title: 'Release readiness check',
    preview: 'Validate package artifacts and CI gates.',
    cwd: workspaceRoot,
    createdAt: fixtureUpdatedAt,
    updatedAt: fixtureUpdatedAt,
    status: { type: 'idle' },
  },
  {
    id: errorThreadId,
    title: 'Broken workspace fixture',
    preview: 'Backend reported a recoverable workspace failure.',
    cwd: workspaceRoot,
    createdAt: fixtureUpdatedAt,
    updatedAt: fixtureUpdatedAt,
    status: { type: 'systemError' },
  },
];

const fileContents = new Map([
  [`${workspaceRoot}/README.md`, '# Codex E2E fixture\n\nWorkspace file panel content.\n'],
  [`${workspaceRoot}/package.json`, '{ "name": "codex-app-web-fixture" }\n'],
]);

const directories = new Map([
  [
    workspaceRoot,
    [
      { name: 'README.md', path: `${workspaceRoot}/README.md`, type: 'file' },
      { name: 'package.json', path: `${workspaceRoot}/package.json`, type: 'file' },
      { name: 'src', path: `${workspaceRoot}/src`, type: 'directory' },
    ],
  ],
  [
    `${workspaceRoot}/src`,
    [
      { name: 'components', path: `${workspaceRoot}/src/components`, type: 'directory' },
      { name: 'lib', path: `${workspaceRoot}/src/lib`, type: 'directory' },
    ],
  ],
]);

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function encodeBase64(text) {
  return Buffer.from(text, 'utf8').toString('base64');
}

function normalizePath(value) {
  const raw = String(value || workspaceRoot)
    .replace(/\\/g, '/')
    .trim();
  return raw.replace(/\/+$/, '') || '/';
}

function getThread(threadId) {
  return threads.find((thread) => thread.id === threadId) || threads[0];
}

function buildThreadContent(threadId) {
  const thread = getThread(threadId);
  const failureCopy =
    'Workspace fixture failed to load. Operators can still inspect the error state.';
  const assistantCopy =
    thread.id === errorThreadId
      ? failureCopy
      : 'Artifacts verified and checksums recorded for the release candidate.';

  return {
    thread,
    turns: [
      {
        items: [
          {
            id: `${thread.id}-user-1`,
            type: 'userMessage',
            text: 'Review release artifacts for codex-app-web.',
            createdAt: fixtureUpdatedAt,
          },
          {
            id: `${thread.id}-assistant-1`,
            type: 'agentMessage',
            text: assistantCopy,
            createdAt: fixtureUpdatedAt,
          },
        ],
      },
    ],
    model: 'gpt-5.4',
    reasoningEffort: 'medium',
    serviceTier: 'fast',
    sandbox: 'workspace-write',
  };
}

function readDirectory(path) {
  const normalized = normalizePath(path);
  const entries = directories.get(normalized);
  if (!entries) {
    const error = new Error(`No such file or directory: ${normalized}`);
    error.code = -32603;
    throw error;
  }
  return { entries: clone(entries) };
}

function readFile(path) {
  const normalized = normalizePath(path);
  const content = fileContents.get(normalized);
  if (content == null) {
    const error = new Error(`File does not exist: ${normalized}`);
    error.code = -32603;
    throw error;
  }
  return { dataBase64: encodeBase64(content) };
}

function getMetadata(path) {
  const normalized = normalizePath(path);
  if (directories.has(normalized)) {
    return { path: normalized, type: 'directory', size: null, modifiedAt: fixtureUpdatedAt };
  }
  const content = fileContents.get(normalized);
  if (content == null) {
    const error = new Error(`Metadata unavailable: ${normalized}`);
    error.code = -32603;
    throw error;
  }
  return {
    path: normalized,
    type: 'file',
    size: Buffer.byteLength(content),
    modifiedAt: fixtureUpdatedAt,
  };
}

function handleFilesystemRequest(method, params) {
  const path = params?.path;
  if (method === 'fs/readDirectory') return readDirectory(path);
  if (method === 'fs/readFile') return readFile(path);
  if (method === 'fs/getMetadata') return getMetadata(path);
  if (method === 'fs/writeFile') return { ok: true };
  if (method === 'fs/createDirectory') return { ok: true };
  if (method === 'fs/remove') return { ok: true };
  if (method === 'fs/copy') return { ok: true };
  return null;
}

function handleCommandRequest(method) {
  if (method === 'command/exec') {
    return {
      stdout: 'Codex E2E terminal output\n',
      stderr: '',
      exitCode: 0,
    };
  }
  if (method.startsWith('command/exec/')) return { ok: true };
  return null;
}

function handleRequest(method, params = {}) {
  const fsResponse = handleFilesystemRequest(method, params);
  if (fsResponse) return fsResponse;
  const commandResponse = handleCommandRequest(method);
  if (commandResponse) return commandResponse;

  switch (method) {
    case 'account/read':
      return { account: { email: 'e2e@example.com', planType: 'pro' } };
    case 'account/rateLimits/read':
      return {};
    case 'model/list':
      return { models: [{ id: 'gpt-5.4', displayName: 'GPT-5.4', isDefault: true }] };
    case 'thread/list':
    case 'thread/loaded/list':
      return { threads: clone(threads) };
    case 'thread/start':
      return buildThreadContent(readyThreadId);
    case 'thread/read':
    case 'thread/get':
    case 'thread/resume':
      return buildThreadContent(String(params.threadId || readyThreadId));
    case 'config/read':
      return {
        config: { model: 'gpt-5.4', sandbox_mode: 'workspace-write', service_tier: 'fast' },
      };
    case 'collaborationMode/list':
      return { modes: [{ id: 'default', label: 'Default', supported: true }] };
    case 'getAuthStatus':
      return { status: 'ok' };
    default:
      return { ok: true };
  }
}

function send(socket, payload) {
  socket.send(JSON.stringify(payload));
}

function sendApprovalRequest(socket) {
  const payload = {
    jsonrpc: '2.0',
    id: nextServerRequestId++,
    method: 'item/commandExecution/requestApproval',
    params: {
      approvalId: 'e2e-approval-1',
      command: 'pnpm publish --dry-run',
      availableDecisions: ['accept', 'acceptForSession', 'decline'],
      commandActions: [{ kind: 'network', value: 'registry.npmjs.org' }],
      proposedNetworkPolicyAmendments: [{ host: 'registry.npmjs.org', mode: 'allow' }],
    },
  };

  setTimeout(() => {
    if (socket.readyState === WebSocket.OPEN) send(socket, payload);
  }, approvalDelayMs);
}

const wss = new WebSocketServer({ port });

wss.on('listening', () => {
  logger.info('E2E Codex app-server fixture listening', { port, workspaceRoot });
});

wss.on('connection', (socket) => {
  let approvalQueued = false;

  socket.on('message', (raw) => {
    let message;
    try {
      message = JSON.parse(String(raw));
    } catch (error) {
      logger.warn('Ignoring malformed E2E payload', { error: String(error) });
      return;
    }

    if (typeof message?.id !== 'number' || typeof message.method !== 'string') {
      logger.info('Received E2E response payload', { id: message?.id ?? null });
      return;
    }

    if (message.method === 'initialize') {
      send(socket, { jsonrpc: '2.0', id: message.id, result: { capabilities: {} } });
      if (!approvalQueued) {
        approvalQueued = true;
        sendApprovalRequest(socket);
      }
      return;
    }

    try {
      send(socket, {
        jsonrpc: '2.0',
        id: message.id,
        result: handleRequest(message.method, message.params),
      });
    } catch (error) {
      send(socket, {
        jsonrpc: '2.0',
        id: message.id,
        error: { code: error.code || -32000, message: error.message || String(error) },
      });
    }
  });
});

function shutdown(signal) {
  logger.info('Shutting down E2E Codex app-server fixture', { signal });
  wss.close(() => process.exit(0));
}

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
