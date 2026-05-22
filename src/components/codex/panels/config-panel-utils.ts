'use client';

import { getReasoningEffortsForModel } from '../../../lib/codex-runtime/reasoning';
import { OFFICIAL_CONFIG_FIELDS } from '../../../lib/codex-runtime/protocol';
import type { ModelSummary } from '../../../lib/codex-ui-runtime';

export type ConfigFieldMeta = {
  label: string;
  help: string;
  type: 'text' | 'number' | 'boolean' | 'json' | 'select';
  options?: Array<string | { label: string; value: string }>;
};

export type ConfigDraftValue = string | boolean;

type ConfigFieldOverride = Partial<ConfigFieldMeta>;

const FIELD_OVERRIDES: Record<string, ConfigFieldOverride> = {
  model: {
    label: 'Default model',
    help: 'The model used for new threads and turns.',
  },
  review_model: {
    label: 'Review model',
    help: 'Optional model override used by /review.',
  },
  instructions: {
    label: 'Instructions',
    help: 'Legacy inline instructions. Prefer `model_instructions_file` on newer Codex builds when the backend exposes it.',
  },
  developer_instructions: {
    label: 'Developer instructions',
    help: 'Developer-level instruction layer merged into session setup.',
  },
  approvals_reviewer: {
    label: 'Approvals reviewer',
  },
  sandbox_mode: {
    label: 'Sandbox mode',
  },
  model_reasoning_effort: {
    label: 'Reasoning effort',
  },
  service_tier: {
    label: 'Service tier',
  },
  web_search: {
    label: 'Web search',
  },
};

function titleCase(value: string) {
  return value
    .split(/[._-]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

function cleanDescription(value: string | null | undefined) {
  if (!value) return '';
  return value.replace(/\[UNSTABLE\]\s*/g, '').trim();
}

function buildSchemaOptions(key: string, models: ModelSummary[]) {
  if (key === 'model' || key === 'review_model') {
    return models.map((model) => ({ value: model.id, label: model.displayName || model.id }));
  }

  const fieldSchema = OFFICIAL_CONFIG_FIELDS[key];
  if (!fieldSchema?.enumValues.length) return undefined;
  return fieldSchema.enumValues;
}

function resolveEffectiveConfigModel(configData: Record<string, unknown> | undefined) {
  const configuredModel = configData?.model;
  return typeof configuredModel === 'string' ? configuredModel : '';
}

function inferMetaType(
  key: string,
  value: unknown,
  models: ModelSummary[],
  configData?: Record<string, unknown>,
): ConfigFieldMeta['type'] {
  const schema = OFFICIAL_CONFIG_FIELDS[key];
  const options = buildConfigFieldOptions(key, models, configData);

  if (typeof value === 'boolean') return 'boolean';
  if (typeof value === 'number') return 'number';
  if (typeof value === 'object' && value !== null) return 'json';

  if (schema) {
    if (schema.hasObjectShape || schema.hasArrayShape) return 'json';
    if (schema.enumValues.length > 0) return 'select';
    if (schema.types.includes('boolean')) return 'boolean';
    if (schema.types.includes('integer') || schema.types.includes('number')) return 'number';
  }

  if (options?.length) return 'select';
  return 'text';
}

function buildConfigFieldOptions(
  key: string,
  models: ModelSummary[],
  configData?: Record<string, unknown>,
) {
  if (key === 'model_reasoning_effort') {
    return getReasoningEffortsForModel(models, resolveEffectiveConfigModel(configData)).map(
      (effort) => ({
        value: effort,
        label: titleCase(effort),
      }),
    );
  }

  return buildSchemaOptions(key, models);
}

export function groupConfigKeys(configData: Record<string, unknown>) {
  const groups = new Map<string, Array<[string, unknown]>>();
  Object.entries(configData).forEach(([key, value]) => {
    const parts = key.split('.');
    const group = parts.length > 1 ? (parts[0] ?? 'general') : 'general';
    if (!groups.has(group)) groups.set(group, []);
    groups.get(group)?.push([key, value]);
  });
  return [...groups.entries()];
}

export function getConfigFieldMeta(
  key: string,
  value: unknown,
  models: ModelSummary[],
  configData?: Record<string, unknown>,
): ConfigFieldMeta {
  const schema = OFFICIAL_CONFIG_FIELDS[key];
  const override = FIELD_OVERRIDES[key];
  const options = buildConfigFieldOptions(key, models, configData);
  const type = inferMetaType(key, value, models, configData);

  const meta: ConfigFieldMeta = {
    label: override?.label || titleCase(key.split('.').pop() || key),
    help: override?.help || cleanDescription(schema?.description),
    type,
    options,
  };

  if (meta.type === 'select' && !meta.options?.length) {
    return { ...meta, type: 'text' };
  }

  if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
    return { ...meta, type: 'json' };
  }

  if (Array.isArray(value)) {
    return { ...meta, type: 'json' };
  }

  return meta;
}

export function serializeConfigDraftValue(value: unknown, meta: ConfigFieldMeta): ConfigDraftValue {
  if (meta.type === 'boolean') {
    return Boolean(value);
  }

  if (meta.type === 'json') {
    try {
      return JSON.stringify(value ?? {}, null, 2);
    } catch {
      return '{}';
    }
  }

  if (meta.type === 'number') {
    return value == null ? '' : String(value);
  }

  return String(value ?? '');
}

export function parseConfigDraftValue(input: ConfigDraftValue, meta: ConfigFieldMeta) {
  if (meta.type === 'boolean') {
    return { value: Boolean(input), error: '' };
  }

  if (meta.type === 'json') {
    try {
      return { value: JSON.parse(String(input || '{}')), error: '' };
    } catch {
      return { value: null, error: 'Enter valid JSON.' };
    }
  }

  if (meta.type === 'number') {
    const raw = String(input ?? '').trim();
    if (!raw) {
      return { value: null, error: 'Enter a numeric value.' };
    }
    const parsed = Number(raw);
    if (Number.isNaN(parsed)) {
      return { value: null, error: 'Enter a numeric value.' };
    }
    return { value: parsed, error: '' };
  }

  return { value: String(input ?? ''), error: '' };
}
