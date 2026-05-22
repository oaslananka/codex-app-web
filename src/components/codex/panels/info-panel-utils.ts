'use client';

import type { IntegrationWarning } from '../../../lib/codex-ui-runtime';

export function getAppsAvailabilityHint(warnings: IntegrationWarning[]) {
  const appsWarning = warnings.find((warning) => warning.source === 'apps');
  if (!appsWarning) {
    return '';
  }

  const message = appsWarning.message.toLowerCase();
  const isUpstreamAuthOrChallengeIssue =
    message.includes('html challenge page') ||
    message.includes('blocked upstream') ||
    message.includes('auth expired');

  if (!isUpstreamAuthOrChallengeIssue) {
    return '';
  }

  return 'The Apps directory is currently being blocked by the upstream service. Try signing in again, then retry on a normal browser network without bot protection, proxy rewriting, or strict VPN filtering.';
}

export function getAppsPendingMessage(appsHydrated: boolean, appsLoading: boolean) {
  if (appsLoading) {
    return 'Loading apps…';
  }

  if (!appsHydrated) {
    return 'Apps will load when this section comes into view.';
  }

  return '';
}

export function shouldShowAppsEmptyState(
  appsHydrated: boolean,
  appsLoading: boolean,
  appsError: string,
  appsCount: number,
) {
  return appsHydrated && !appsLoading && !appsError && appsCount === 0;
}
