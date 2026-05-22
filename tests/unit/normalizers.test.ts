import { describe, expect, it } from 'vitest';
import {
  normalizeModelList,
  normalizePluginDetail,
  normalizeThread,
  normalizeThreadsResponse,
} from '../../src/lib/codex-runtime/normalizers';

describe('runtime normalizers', () => {
  it('normalizes thread records from mixed payload shapes', () => {
    const thread = normalizeThread({
      id: 'thread-1',
      name: 'My thread',
      archived: 0,
      cwd: '/workspace',
      status: { type: 'active', activeFlags: ['waitingOnApproval'] },
    });

    expect(thread.id).toBe('thread-1');
    expect(thread.title).toBe('My thread');
    expect(thread.cwd).toBe('/workspace');
    expect(thread.status?.type).toBe('active');
    expect(thread.status?.activeFlags).toContain('waitingOnApproval');
  });

  it('reads thread lists from both data and threads payload keys', () => {
    const viaData = normalizeThreadsResponse({ data: [{ id: 'a' }] });
    const viaThreads = normalizeThreadsResponse({ threads: [{ id: 'b' }] });

    expect(viaData[0]?.id).toBe('a');
    expect(viaThreads[0]?.id).toBe('b');
  });

  it('normalizes plugin detail payloads into a stable UI shape', () => {
    const detail = normalizePluginDetail({
      plugin: {
        summary: { id: 'plugin-1', name: 'Plugin One' },
        description: 'Plugin description',
        apps: [{ id: 'app-1', name: 'App One' }],
        skills: [{ id: 'skill-1', name: 'Skill One', enabled: true }],
        mcpServers: ['server-a'],
      },
    });

    expect(detail).not.toBeNull();
    expect(detail?.id).toBe('plugin-1');
    expect(detail?.apps[0]?.name).toBe('App One');
    expect(detail?.skills[0]?.name).toBe('Skill One');
    expect(detail?.mcpServers).toContain('server-a');
  });

  it('normalizes model reasoning metadata from official payload shape', () => {
    const models = normalizeModelList({
      data: [
        {
          id: 'gpt-5',
          displayName: 'GPT-5',
          supportedReasoningEfforts: [{ reasoningEffort: 'low' }, { reasoningEffort: 'xhigh' }],
          defaultReasoningEffort: 'high',
        },
      ],
    });

    expect(models[0]?.supportedReasoningEfforts).toEqual(['low', 'xhigh']);
    expect(models[0]?.defaultReasoningEffort).toBe('high');
  });
});
