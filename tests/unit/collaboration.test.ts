import { describe, expect, it } from 'vitest';
import {
  buildCollaborationMode,
  getFallbackCollaborationModes,
  normalizeCollaborationModes,
  sanitizeCollaborationMode,
} from '../../src/lib/codex-runtime/collaboration';

describe('collaboration helpers', () => {
  it('falls back to default and plan modes when the backend has no list support', () => {
    expect(normalizeCollaborationModes(null)).toEqual(getFallbackCollaborationModes());
  });

  it('keeps unknown server-driven modes selectable', () => {
    const modes = normalizeCollaborationModes({
      modes: [
        { id: 'review', label: 'Review-first', description: 'Custom server mode' },
        { id: 'default', label: 'Default' },
      ],
    });

    expect(modes.map((mode) => mode.id)).toContain('review');
    expect(sanitizeCollaborationMode(modes, 'review')).toBe('review');
  });

  it('builds plan settings but preserves unknown modes generically', () => {
    expect(
      buildCollaborationMode('plan', [{ id: 'gpt-5', isDefault: true }], '', 'medium'),
    ).toEqual({
      mode: 'plan',
      settings: {
        model: 'gpt-5',
        reasoning_effort: 'medium',
        developer_instructions: null,
      },
    });

    expect(buildCollaborationMode('review', [], '', '')).toEqual({ mode: 'review' });
    expect(buildCollaborationMode('default', [], '', '')).toBeUndefined();
  });
});
