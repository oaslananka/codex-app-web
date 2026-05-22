// Codex thread ids can be modern RFC 9562 UUIDs such as v7, not only legacy v1-v5 ids.
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function isBackendThreadId(value: unknown): value is string {
  return typeof value === 'string' && UUID_PATTERN.test(value.trim());
}

export function sanitizeBackendThreadId(value: unknown): string | null {
  return isBackendThreadId(value) ? value.trim() : null;
}
