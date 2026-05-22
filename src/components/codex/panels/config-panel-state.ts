'use client';

import type { ModelSummary } from '../../../lib/codex-ui-runtime';
import {
  type ConfigDraftValue,
  type ConfigFieldMeta,
  getConfigFieldMeta,
  groupConfigKeys,
  parseConfigDraftValue,
  serializeConfigDraftValue,
} from './config-panel-utils';

export type { ConfigDraftValue } from './config-panel-utils';

export type ConfigFieldDescriptor = {
  configKey: string;
  sectionName: string;
  value: unknown;
  meta: ConfigFieldMeta;
  serializedValue: ConfigDraftValue;
};

export type ConfigDraftState = {
  drafts: Record<string, ConfigDraftValue>;
  baselineDrafts: Record<string, ConfigDraftValue>;
  dirtyMap: Record<string, true>;
  validationErrors: Record<string, string>;
};

type DraftStateInput = {
  baselineDrafts: Record<string, ConfigDraftValue>;
  drafts: Record<string, ConfigDraftValue>;
  dirtyMap: Record<string, true>;
  validationErrors: Record<string, string>;
};

function sortDescriptors(
  sections: Array<[string, ConfigFieldDescriptor[]]>,
): Array<[string, ConfigFieldDescriptor[]]> {
  return sections.map(([sectionName, descriptors]) => [
    sectionName,
    [...descriptors].sort((left, right) => left.configKey.localeCompare(right.configKey)),
  ]);
}

export function buildConfigFieldSections(
  configData: Record<string, unknown> | null,
  models: ModelSummary[],
): Array<[string, ConfigFieldDescriptor[]]> {
  if (!configData) return [];
  return sortDescriptors(
    groupConfigKeys(configData).map(([sectionName, entries]) => [
      sectionName,
      entries.map(([configKey, value]) => {
        const meta = getConfigFieldMeta(configKey, value, models, configData);
        return {
          configKey,
          sectionName,
          value,
          meta,
          serializedValue: serializeConfigDraftValue(value, meta),
        };
      }),
    ]),
  );
}

export function buildDescriptorMap(
  sections: Array<[string, ConfigFieldDescriptor[]]>,
): Record<string, ConfigFieldDescriptor> {
  return Object.fromEntries(
    sections.flatMap(([, descriptors]) =>
      descriptors.map((descriptor) => [descriptor.configKey, descriptor]),
    ),
  );
}

function buildDraftState(input: DraftStateInput): ConfigDraftState {
  return {
    drafts: input.drafts,
    baselineDrafts: input.baselineDrafts,
    dirtyMap: input.dirtyMap,
    validationErrors: input.validationErrors,
  };
}

export function buildInitialConfigDraftState(
  sections: Array<[string, ConfigFieldDescriptor[]]>,
): ConfigDraftState {
  const baselineDrafts: Record<string, ConfigDraftValue> = {};
  sections.forEach(([, descriptors]) => {
    descriptors.forEach((descriptor) => {
      baselineDrafts[descriptor.configKey] = descriptor.serializedValue;
    });
  });

  return buildDraftState({
    baselineDrafts,
    drafts: { ...baselineDrafts },
    dirtyMap: {},
    validationErrors: {},
  });
}

export function reconcileConfigDraftState(
  current: ConfigDraftState,
  sections: Array<[string, ConfigFieldDescriptor[]]>,
): ConfigDraftState {
  const drafts: Record<string, ConfigDraftValue> = {};
  const baselineDrafts: Record<string, ConfigDraftValue> = {};
  const dirtyMap: Record<string, true> = {};
  const validationErrors: Record<string, string> = {};

  sections.forEach(([, descriptors]) => {
    descriptors.forEach((descriptor) => {
      baselineDrafts[descriptor.configKey] = descriptor.serializedValue;
      const previousDraft = current.drafts[descriptor.configKey];
      const keepDraft =
        current.dirtyMap[descriptor.configKey] && previousDraft !== undefined
          ? previousDraft
          : descriptor.serializedValue;
      drafts[descriptor.configKey] = keepDraft;

      if (keepDraft !== descriptor.serializedValue) {
        dirtyMap[descriptor.configKey] = true;
      }

      const parsed = parseConfigDraftValue(keepDraft, descriptor.meta);
      if (parsed.error) {
        validationErrors[descriptor.configKey] = parsed.error;
      }
    });
  });

  return buildDraftState({
    drafts,
    baselineDrafts,
    dirtyMap,
    validationErrors,
  });
}

export function applyConfigDraftChange(
  current: ConfigDraftState,
  descriptor: ConfigFieldDescriptor,
  nextValue: ConfigDraftValue,
): ConfigDraftState {
  const nextDrafts = {
    ...current.drafts,
    [descriptor.configKey]: nextValue,
  };
  const baselineValue = current.baselineDrafts[descriptor.configKey] ?? descriptor.serializedValue;
  const nextDirtyMap = { ...current.dirtyMap };
  if (nextValue === baselineValue) {
    delete nextDirtyMap[descriptor.configKey];
  } else {
    nextDirtyMap[descriptor.configKey] = true;
  }

  const parsed = parseConfigDraftValue(nextValue, descriptor.meta);
  const nextValidationErrors = { ...current.validationErrors };
  if (parsed.error) {
    nextValidationErrors[descriptor.configKey] = parsed.error;
  } else {
    delete nextValidationErrors[descriptor.configKey];
  }

  return buildDraftState({
    drafts: nextDrafts,
    baselineDrafts: current.baselineDrafts,
    dirtyMap: nextDirtyMap,
    validationErrors: nextValidationErrors,
  });
}

export function buildConfigSavePayload(
  descriptorMap: Record<string, ConfigFieldDescriptor>,
  draftState: ConfigDraftState,
): Record<string, unknown> {
  return Object.keys(draftState.dirtyMap).reduce<Record<string, unknown>>((payload, configKey) => {
    const descriptor = descriptorMap[configKey];
    if (!descriptor) return payload;
    const draftValue =
      draftState.drafts[configKey] ??
      draftState.baselineDrafts[configKey] ??
      descriptor.serializedValue;
    const parsed = parseConfigDraftValue(draftValue, descriptor.meta);
    payload[configKey] = parsed.value;
    return payload;
  }, {});
}

export function countDirtyConfigFields(dirtyMap: Record<string, true>) {
  return Object.keys(dirtyMap).length;
}
