#!/usr/bin/env node

import { WebSocket, WebSocketServer } from 'ws';
import nodeLoggerModule from '../src/lib/logging/node-logger.cjs';

const { createNodeLogger } = nodeLoggerModule;

const logger = createNodeLogger('script:mock-codex');
const port = Number.parseInt(process.env.MOCK_CODEX_PORT || process.env.CODEX_PORT || '41000', 10);
const shouldSendApproval = process.env.MOCK_SEND_APPROVAL === '1';
const approvalDelayMs = Number.parseInt(process.env.MOCK_APPROVAL_DELAY_MS || '900', 10);

const mockState = {
  config: {
    model: 'gpt-5.4',
    reasoning_effort: 'medium',
    service_tier: 'fast',
    sandbox_mode: 'workspace-write',
  },
};

let nextServerRequestId = 10_000;

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function mergeConfigValue(target, keyPath, value) {
  const parts = String(keyPath)
    .split('.')
    .map((part) => part.trim())
    .filter(Boolean);
  if (!parts.length) return;

  let cursor = target;
  while (parts.length > 1) {
    const part = parts.shift();
    if (!part) return;
    const next = cursor[part];
    if (!next || typeof next !== 'object' || Array.isArray(next)) {
      cursor[part] = {};
    }
    cursor = cursor[part];
  }

  const leaf = parts[0];
  if (!leaf) return;
  cursor[leaf] = value;
}

function handleRequest(method, params) {
  switch (method) {
    case 'account/read':
      return {
        account: {
          email: 'smoke@example.com',
          planType: 'pro',
        },
      };
    case 'account/rateLimits/read':
      return {};
    case 'model/list':
      return {
        models: [
          {
            id: 'gpt-5.4',
            displayName: 'GPT-5.4',
            isDefault: true,
            supportedReasoningEfforts: ['minimal', 'medium', 'high'],
            defaultReasoningEffort: 'medium',
          },
        ],
      };
    case 'thread/list':
    case 'thread/loaded/list':
      return { threads: [] };
    case 'config/read':
      return { config: clone(mockState.config) };
    case 'mcpServerStatus/list':
      return { servers: [] };
    case 'configRequirements/read':
      return { requirements: {} };
    case 'skills/list':
      return { skills: [] };
    case 'experimentalFeature/list':
      return { features: [] };
    case 'plugin/list':
      return { plugins: [] };
    case 'app/list':
      return { apps: [] };
    case 'collaborationMode/list':
      return {
        modes: [
          { id: 'default', label: 'Default', supported: true },
          { id: 'plan', label: 'Plan', supported: true },
        ],
      };
    case 'config/batchWrite': {
      const edits = Array.isArray(params?.edits) ? params.edits : [];
      for (const edit of edits) {
        if (!edit || typeof edit !== 'object') continue;
        mergeConfigValue(mockState.config, edit.keyPath, edit.value);
      }
      return { ok: true };
    }
    case 'config/value/write':
      mergeConfigValue(mockState.config, params?.keyPath, params?.value);
      return { ok: true };
    case 'config/mcpServer/reload':
      return { ok: true };
    case 'thread/start':
      return {
        threadId: 'thread-smoke-1',
        thread: {
          id: 'thread-smoke-1',
          title: 'Smoke thread',
          cwd: '/workspace',
          turns: [],
        },
        model: mockState.config.model,
        reasoningEffort: mockState.config.reasoning_effort,
        serviceTier: mockState.config.service_tier,
        sandbox: mockState.config.sandbox_mode,
      };
    case 'thread/read':
    case 'thread/get':
    case 'thread/resume':
      return {
        thread: {
          id: String(params?.threadId || 'thread-smoke-1'),
          title: 'Smoke thread',
          cwd: '/workspace',
          turns: [],
        },
      };
    case 'thread/archive':
    case 'thread/unarchive':
    case 'thread/fork':
    case 'thread/rollback':
    case 'thread/compact/start':
    case 'thread/name/set':
    case 'thread/metadata/update':
    case 'thread/unsubscribe':
      return { ok: true };
    case 'getAuthStatus':
      return { status: 'ok' };
    default:
      logger.debug('Mock backend returning empty result for request', { method });
      return {};
  }
}

function buildApprovalRequest() {
  return {
    jsonrpc: '2.0',
    id: nextServerRequestId++,
    method: 'item/commandExecution/requestApproval',
    params: {
      approvalId: 'smoke-approval-1',
      command: 'pnpm publish --dry-run',
      availableDecisions: [
        'accept',
        'acceptForSession',
        'decline',
        {
          applyNetworkPolicyAmendment: {
            host: 'registry.npmjs.org',
            mode: 'allow',
          },
        },
      ],
      commandActions: [{ kind: 'network', value: 'registry.npmjs.org' }],
      additionalPermissions: { network: { mode: 'open' } },
      proposedExecpolicyAmendment: {
        mode: 'allow',
        reason: 'publish workflow',
      },
      proposedNetworkPolicyAmendments: [
        {
          host: 'registry.npmjs.org',
          mode: 'allow',
        },
      ],
    },
  };
}

const wss = new WebSocketServer({ port });

wss.on('listening', () => {
  logger.info('Mock Codex app-server listening', { port, shouldSendApproval, approvalDelayMs });
});

wss.on('connection', (socket) => {
  let approvalQueued = false;

  const queueApproval = () => {
    if (!shouldSendApproval || approvalQueued) {
      return;
    }

    approvalQueued = true;
    const payload = buildApprovalRequest();
    setTimeout(() => {
      if (socket.readyState !== WebSocket.OPEN) {
        return;
      }
      logger.info('Sending mock approval request', { id: payload.id });
      socket.send(JSON.stringify(payload));
    }, approvalDelayMs);
  };

  socket.on('message', (raw) => {
    let message;
    try {
      message = JSON.parse(String(raw));
    } catch (error) {
      logger.warn('Ignoring malformed payload from client', {
        error: error instanceof Error ? error.message : String(error),
      });
      return;
    }

    if (typeof message?.id === 'number' && typeof message?.method === 'string') {
      if (message.method === 'initialize') {
        socket.send(
          JSON.stringify({
            jsonrpc: '2.0',
            id: message.id,
            result: {
              capabilities: { experimentalApi: true },
            },
          }),
        );
        queueApproval();
        return;
      }

      const result = handleRequest(message.method, message.params ?? {});
      socket.send(
        JSON.stringify({
          jsonrpc: '2.0',
          id: message.id,
          result,
        }),
      );
      return;
    }

    if (typeof message?.id === 'number' && ('result' in message || 'error' in message)) {
      logger.info('Received response to mock server request', {
        id: message.id,
        result: message.result ?? null,
        error: message.error ?? null,
      });
    }
  });
});

function shutdown(signal) {
  logger.info('Shutting down mock Codex app-server', { signal });
  wss.close(() => {
    process.exit(0);
  });
}

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
