import { describe, expect, it } from 'vitest';
import type { ModelSummary } from '../../src/lib/codex-ui-runtime';
import {
  applyConfigDraftChange,
  buildConfigFieldSections,
  buildConfigSavePayload,
  buildDescriptorMap,
  buildInitialConfigDraftState,
  reconcileConfigDraftState,
} from '../../src/components/codex/panels/config-panel-state';

const MODELS: ModelSummary[] = [
  {
    id: 'gpt-fast',
    supportedReasoningEfforts: ['minimal'],
  },
  {
    id: 'gpt-deep',
    supportedReasoningEfforts: ['high', 'xhigh'],
  },
];

describe('config panel draft state', () => {
  it('preserves dirty drafts when config data refreshes in the background', () => {
    const initialSections = buildConfigFieldSections(
      {
        model: 'gpt-fast',
        model_reasoning_effort: 'minimal',
      },
      MODELS,
    );
    const descriptorMap = buildDescriptorMap(initialSections);
    const initialDraftState = buildInitialConfigDraftState(initialSections);
    const modelDescriptor = descriptorMap.model;

    expect(modelDescriptor).toBeDefined();
    if (!modelDescriptor) {
      throw new Error('Expected model descriptor');
    }

    const dirtyState = applyConfigDraftChange(initialDraftState, modelDescriptor, 'gpt-deep');

    const refreshedSections = buildConfigFieldSections(
      {
        model: 'gpt-fast',
        model_reasoning_effort: 'high',
      },
      MODELS,
    );
    const reconciled = reconcileConfigDraftState(dirtyState, refreshedSections);

    expect(reconciled.drafts.model).toBe('gpt-deep');
    expect(reconciled.dirtyMap.model).toBe(true);
    expect(reconciled.drafts.model_reasoning_effort).toBe('high');
    expect(reconciled.dirtyMap.model_reasoning_effort).toBeUndefined();
  });

  it('tracks validation errors and clears dirty state when a field returns to baseline', () => {
    const sections = buildConfigFieldSections(
      {
        retries: 3,
      },
      MODELS,
    );
    const descriptor = buildDescriptorMap(sections).retries;
    const initialDraftState = buildInitialConfigDraftState(sections);

    expect(descriptor).toBeDefined();
    if (!descriptor) {
      throw new Error('Expected retries descriptor');
    }

    const invalidState = applyConfigDraftChange(initialDraftState, descriptor, 'abc');
    expect(invalidState.validationErrors.retries).toBe('Enter a numeric value.');
    expect(invalidState.dirtyMap.retries).toBe(true);

    const resetState = applyConfigDraftChange(invalidState, descriptor, '3');
    expect(resetState.validationErrors.retries).toBeUndefined();
    expect(resetState.dirtyMap.retries).toBeUndefined();
  });

  it('builds a save payload only from dirty fields', () => {
    const sections = buildConfigFieldSections(
      {
        model: 'gpt-fast',
        retries: 3,
      },
      MODELS,
    );
    const descriptorMap = buildDescriptorMap(sections);
    const initialDraftState = buildInitialConfigDraftState(sections);
    const modelDescriptor = descriptorMap.model;

    expect(modelDescriptor).toBeDefined();
    if (!modelDescriptor) {
      throw new Error('Expected model descriptor');
    }

    const nextState = applyConfigDraftChange(initialDraftState, modelDescriptor, 'gpt-deep');
    const payload = buildConfigSavePayload(descriptorMap, nextState);

    expect(payload).toEqual({
      model: 'gpt-deep',
    });
  });
});
