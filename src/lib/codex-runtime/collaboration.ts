import type { ModelSummary } from './types';

export type CollaborationModeValue = string;

export type CollaborationModeOption = {
  id: string;
  label: string;
  description?: string;
  supported: boolean;
};

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' ? (value as Record<string, unknown>) : {};
}

function asArray<T = unknown>(value: unknown): T[] {
  return Array.isArray(value) ? (value as T[]) : [];
}

function titleCase(value: string) {
  return value
    .split(/[-_\s]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

export function getFallbackCollaborationModes(): CollaborationModeOption[] {
  return [
    {
      id: 'default',
      label: 'Default',
      description: 'Standard Codex conversation flow.',
      supported: true,
    },
    {
      id: 'plan',
      label: 'Plan',
      description: 'Plan-first collaboration with an explicit planning pass.',
      supported: true,
    },
  ];
}

export function normalizeCollaborationModes(response: unknown): CollaborationModeOption[] {
  const value = asRecord(response);
  const items = asArray(value.modes ?? value.data);
  const seen = new Set<string>();
  const normalized: CollaborationModeOption[] = [];

  for (const item of items) {
    const mode = asRecord(item);
    const id =
      typeof mode.id === 'string'
        ? mode.id
        : typeof mode.mode === 'string'
          ? mode.mode
          : typeof mode.name === 'string'
            ? mode.name
            : '';
    if (!id || seen.has(id)) continue;
    seen.add(id);
    normalized.push({
      id,
      label:
        typeof mode.label === 'string'
          ? mode.label
          : typeof mode.displayName === 'string'
            ? mode.displayName
            : titleCase(id),
      description:
        typeof mode.description === 'string'
          ? mode.description
          : typeof mode.help === 'string'
            ? mode.help
            : undefined,
      supported: typeof mode.supported === 'boolean' ? mode.supported : true,
    });
  }

  if (!normalized.length) {
    return getFallbackCollaborationModes();
  }

  const hasDefault = normalized.some((mode) => mode.id === 'default');
  if (!hasDefault) {
    const fallbackDefault = getFallbackCollaborationModes()[0];
    if (fallbackDefault) {
      normalized.unshift(fallbackDefault);
    }
  }

  return normalized;
}

function resolveModelId(models: ModelSummary[], selectedModel: string) {
  if (selectedModel) return selectedModel;
  return models.find((model) => model.isDefault)?.id ?? models[0]?.id ?? null;
}

export function sanitizeCollaborationMode(
  modes: CollaborationModeOption[],
  selectedMode: CollaborationModeValue,
) {
  if (modes.some((mode) => mode.id === selectedMode)) {
    return selectedMode;
  }
  return modes.find((mode) => mode.id === 'default')?.id ?? modes[0]?.id ?? 'default';
}

export function buildCollaborationMode(
  mode: CollaborationModeValue,
  models: ModelSummary[],
  selectedModel: string,
  selectedEffort: string,
) {
  if (!mode || mode === 'default') return undefined;
  if (mode !== 'plan') {
    return { mode };
  }

  const model = resolveModelId(models, selectedModel);
  if (!model) {
    return { mode };
  }

  return {
    mode,
    settings: {
      model,
      reasoning_effort: selectedEffort || null,
      developer_instructions: null,
    },
  };
}
