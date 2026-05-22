import { describe, expect, it } from 'vitest';
import {
  getConfigFieldMeta,
  parseConfigDraftValue,
  serializeConfigDraftValue,
} from '../../src/components/codex/panels/config-panel-utils';

describe('config panel utils', () => {
  it('derives select metadata from the official config schema', () => {
    const meta = getConfigFieldMeta('approvals_reviewer', 'user', []);

    expect(meta.type).toBe('select');
    expect(meta.options).toContain('guardian_subagent');
  });

  it('keeps unknown object-shaped fields editable through generic JSON rendering', () => {
    const meta = getConfigFieldMeta('custom.future_field', { enabled: true }, []);

    expect(meta.type).toBe('json');
    expect(serializeConfigDraftValue({ enabled: true }, meta)).toContain('"enabled"');
    expect(parseConfigDraftValue('{"enabled":true}', meta)).toEqual({
      value: { enabled: true },
      error: '',
    });
  });

  it('adds migration guidance for legacy instructions fields', () => {
    const meta = getConfigFieldMeta('instructions', 'be concise', []);

    expect(meta.help).toContain('model_instructions_file');
  });

  it('uses the configured model when building reasoning-effort options', () => {
    const meta = getConfigFieldMeta(
      'model_reasoning_effort',
      'high',
      [
        {
          id: 'gpt-fast',
          supportedReasoningEfforts: ['minimal'],
        },
        {
          id: 'gpt-deep',
          supportedReasoningEfforts: ['high', 'xhigh'],
        },
      ],
      { model: 'gpt-deep' },
    );

    expect(meta.type).toBe('select');
    expect(meta.options).toEqual([
      { value: 'high', label: 'High' },
      { value: 'xhigh', label: 'Xhigh' },
    ]);
  });
});
