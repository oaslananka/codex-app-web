import type { ModelSummary } from './types';

export const FALLBACK_REASONING_EFFORTS = ['low', 'medium', 'high', 'xhigh'] as const;

export function dedupeReasoningEfforts(efforts: Array<string | null | undefined>) {
  return efforts.filter(
    (effort, index, array): effort is string => Boolean(effort) && array.indexOf(effort) === index,
  );
}

export function getReasoningEffortsForModel(models: ModelSummary[], selectedModelId: string) {
  const selectedModel =
    models.find((model) => model.id === selectedModelId) ??
    models.find((model) => model.isDefault) ??
    null;
  if (selectedModel?.supportedReasoningEfforts?.length) {
    return dedupeReasoningEfforts(selectedModel.supportedReasoningEfforts);
  }

  const effortsFromModels = dedupeReasoningEfforts(
    models.flatMap((model) => model.supportedReasoningEfforts ?? []),
  );
  if (effortsFromModels.length) return effortsFromModels;
  return [...FALLBACK_REASONING_EFFORTS];
}

export function sanitizeSelectedEffort(
  models: ModelSummary[],
  selectedModelId: string,
  selectedEffort: string,
) {
  if (!selectedEffort) return '';
  const availableEfforts = getReasoningEffortsForModel(models, selectedModelId);
  return availableEfforts.includes(selectedEffort) ? selectedEffort : '';
}
