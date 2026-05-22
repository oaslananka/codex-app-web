'use client';

import type { ExperimentalFeatureSummary } from '../../../lib/codex-ui-runtime';

export function getExperimentalFeatureKey(
  feature: ExperimentalFeatureSummary,
  fallbackIndex: number,
) {
  return feature.key || feature.id || feature.name || `feature-${fallbackIndex}`;
}

export function getExperimentalFeatureDisplayName(
  feature: ExperimentalFeatureSummary,
  key: string,
) {
  return feature.displayName || feature.name || key;
}

function isToggleLikeFeature(feature: ExperimentalFeatureSummary) {
  return typeof feature.enabled === 'boolean' || typeof feature.value === 'boolean';
}

export function splitExperimentalFeatures(features: ExperimentalFeatureSummary[]) {
  const documented: ExperimentalFeatureSummary[] = [];
  const backendOnly: ExperimentalFeatureSummary[] = [];

  features.forEach((feature) => {
    if (isToggleLikeFeature(feature)) {
      documented.push(feature);
      return;
    }
    backendOnly.push(feature);
  });

  return { documented, backendOnly };
}
