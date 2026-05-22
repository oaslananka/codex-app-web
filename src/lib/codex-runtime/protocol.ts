import {
  OFFICIAL_CONFIG_FIELD_SCHEMAS,
  OFFICIAL_NOTIFICATION_METHODS as GENERATED_NOTIFICATION_METHODS,
  OFFICIAL_REQUEST_METHODS as GENERATED_REQUEST_METHODS,
  OFFICIAL_SERVER_REQUEST_METHODS as GENERATED_SERVER_REQUEST_METHODS,
  type OfficialConfigFieldSchema,
} from './official-manifest.generated';

export const OFFICIAL_REQUEST_METHODS: readonly string[] = [...GENERATED_REQUEST_METHODS];
export const OFFICIAL_NOTIFICATION_METHODS: readonly string[] = [...GENERATED_NOTIFICATION_METHODS];
export const OFFICIAL_SERVER_REQUEST_METHODS: readonly string[] = [
  ...GENERATED_SERVER_REQUEST_METHODS,
];

export const OFFICIAL_CONFIG_FIELDS = OFFICIAL_CONFIG_FIELD_SCHEMAS as Record<
  string,
  OfficialConfigFieldSchema
>;

export type OfficialRequestMethod = string;
export type OfficialNotificationMethod = string;
export type OfficialServerRequestMethod = string;

export const REQUEST_COMPATIBILITY_MAP: Record<string, readonly string[]> = {
  'account/login/start': ['account/login/start', 'loginAccount', 'account/login'],
  'account/login/cancel': ['account/login/cancel', 'cancelLoginAccount', 'account/login/cancel'],
  'thread/read': ['thread/read', 'thread/resume', 'thread/get', 'session/open'],
  'plugin/install': ['plugin/install'],
  'plugin/uninstall': ['plugin/uninstall'],
};

export type CoverageStatus = 'supported' | 'unsupported' | 'unknown';

export type ProtocolCoverage = {
  requests: {
    implemented: number;
    total: number;
    missing: string[];
    extra: string[];
  };
  notifications: {
    implemented: number;
    total: number;
    missing: string[];
    extra: string[];
  };
  serverRequests: {
    implemented: number;
    total: number;
    missing: string[];
    extra: string[];
  };
};

function getExtraMethods(trackedSet: Set<string>, officialMethods: readonly string[]) {
  const official = new Set(officialMethods);
  return [...trackedSet].filter((method) => !official.has(method)).sort();
}

export function buildProtocolCoverage(tracked: {
  requests: Iterable<string>;
  notifications: Iterable<string>;
  serverRequests: Iterable<string>;
}): ProtocolCoverage {
  const requestSet = new Set(tracked.requests);
  const notificationSet = new Set(tracked.notifications);
  const serverRequestSet = new Set(tracked.serverRequests);

  const missingRequests = OFFICIAL_REQUEST_METHODS.filter((method) => !requestSet.has(method));
  const missingNotifications = OFFICIAL_NOTIFICATION_METHODS.filter(
    (method) => !notificationSet.has(method),
  );
  const missingServerRequests = OFFICIAL_SERVER_REQUEST_METHODS.filter(
    (method) => !serverRequestSet.has(method),
  );

  return {
    requests: {
      implemented: OFFICIAL_REQUEST_METHODS.length - missingRequests.length,
      total: OFFICIAL_REQUEST_METHODS.length,
      missing: missingRequests,
      extra: getExtraMethods(requestSet, OFFICIAL_REQUEST_METHODS),
    },
    notifications: {
      implemented: OFFICIAL_NOTIFICATION_METHODS.length - missingNotifications.length,
      total: OFFICIAL_NOTIFICATION_METHODS.length,
      missing: missingNotifications,
      extra: getExtraMethods(notificationSet, OFFICIAL_NOTIFICATION_METHODS),
    },
    serverRequests: {
      implemented: OFFICIAL_SERVER_REQUEST_METHODS.length - missingServerRequests.length,
      total: OFFICIAL_SERVER_REQUEST_METHODS.length,
      missing: missingServerRequests,
      extra: getExtraMethods(serverRequestSet, OFFICIAL_SERVER_REQUEST_METHODS),
    },
  };
}

export function createAvailabilityMap<T extends string>(methods: readonly T[]) {
  return Object.fromEntries(methods.map((method) => [method, 'unknown'])) as Record<
    T,
    CoverageStatus
  >;
}
