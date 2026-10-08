// One mapping from "what the transport/server threw" to "what the user reads"
// (App Review R-09). Shared by mobile and web so a dropped connection never
// prints `fetch failed: UnexpectedException … (at ExpoModulesCore/Promise.swift:56)`
// or "Failed to fetch" in a form's error line.

export const NETWORK_ERROR_MESSAGE =
  "Can't reach Chefer right now. Check your connection and try again.";
export const SERVER_ERROR_MESSAGE = 'Something went wrong on our side. Please try again shortly.';
export const GENERIC_ERROR_MESSAGE = 'Something went wrong. Please try again.';

/** Transport-level failure text from fetch / React Native / Expo / the browser. */
const NETWORK_MESSAGE =
  /fetch failed|failed to fetch|network request failed|network error|networkerror|could not connect|failed to connect|connection (was )?(lost|refused|reset)|not connected to the internet|internet connection appears|timed out|timeout|ExpoModulesCore|Promise\.swift|UnexpectedException|ECONNREFUSED|ENOTFOUND|ECONNRESET|load failed/i;

/** Codes whose message is server-internal, never meant for a user. */
const INTERNAL_CODES = new Set(['INTERNAL_SERVER_ERROR', 'BAD_GATEWAY', 'GATEWAY_TIMEOUT']);

type ErrorLike = {
  name?: unknown;
  message?: unknown;
  data?: { code?: unknown; httpStatus?: unknown } | null;
};

function asErrorLike(error: unknown): ErrorLike | null {
  return error !== null && typeof error === 'object' ? error : null;
}

/** True when the request never got an answer from the server. */
export function isNetworkError(error: unknown): boolean {
  const e = asErrorLike(error);
  if (!e) return false;
  const message = typeof e.message === 'string' ? e.message : '';
  // A TRPCClientError that carries no server `data` came from the transport
  // (no response / unparseable response), not from a procedure.
  if (e.name === 'TRPCClientError' && !e.data) return true;
  if (e.data && typeof e.data === 'object') return false;
  return NETWORK_MESSAGE.test(message);
}

/** True for a server-side failure whose raw message must not be shown. */
export function isServerError(error: unknown): boolean {
  const data = asErrorLike(error)?.data;
  if (!data || typeof data !== 'object') return false;
  const status = typeof data.httpStatus === 'number' ? data.httpStatus : 0;
  const code = typeof data.code === 'string' ? data.code : '';
  return INTERNAL_CODES.has(code) || status === 500 || status === 502 || status === 504;
}

/** One Zod issue as it appears in a serialised BAD_REQUEST message. */
export type ValidationIssueLike = {
  code?: unknown;
  path?: unknown;
  maximum?: unknown;
  minimum?: unknown;
  message?: unknown;
};

function asIssues(value: unknown[]): ValidationIssueLike[] {
  return value.filter((i): i is ValidationIssueLike => i !== null && typeof i === 'object');
}

/**
 * Zod issues serialised in a message (`[{"code":"too_big",…}]`, or an object
 * with an `issues` array), or null when the message is plain prose. A message
 * that looks like issue JSON but does not parse yields `[]` (still "technical").
 */
export function parseIssuesFromMessage(message: string): ValidationIssueLike[] | null {
  const trimmed = message.trim();
  if (!trimmed.startsWith('[') && !trimmed.startsWith('{')) return null;
  try {
    const parsed: unknown = JSON.parse(trimmed);
    if (Array.isArray(parsed)) return asIssues(parsed);
    if (parsed !== null && typeof parsed === 'object' && 'issues' in parsed) {
      const { issues } = parsed;
      if (Array.isArray(issues)) return asIssues(issues);
    }
    return [];
  } catch {
    return /"code"\s*:/.test(trimmed) ? [] : null;
  }
}

/** Trailing unit/identifier words that read oddly in a sentence (`weightKg` → "weight"). */
const FIELD_SUFFIX_WORDS = new Set(['kg', 'lb', 'lbs', 'id', 'ids']);

/**
 * `weightKg` → "weight", `servingSizeG` → "serving size g", `items.0.reps` →
 * "reps". Takes the last string segment of a Zod path; null when there is none.
 */
export function humaniseFieldPath(path: unknown): string | null {
  if (!Array.isArray(path)) return null;
  const segments: unknown[] = path;
  const segment = [...segments]
    .reverse()
    .find((p): p is string => typeof p === 'string' && p !== '');
  if (segment === undefined) return null;
  const words = segment
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/[_-]+/g, ' ')
    .toLowerCase()
    .split(' ')
    .filter((w) => w !== '');
  while (words.length > 1 && FIELD_SUFFIX_WORDS.has(words[words.length - 1] ?? '')) words.pop();
  return words.length > 0 ? words.join(' ') : null;
}

export const VALIDATION_ERROR_MESSAGE = 'Check the value you entered.';

/** "Check the value you entered for weight." — or without the field when none is known. */
export function describeValidationIssues(issues: readonly ValidationIssueLike[]): string {
  const field = humaniseFieldPath(issues[0]?.path);
  return field === null ? VALIDATION_ERROR_MESSAGE : `Check the value you entered for ${field}.`;
}

export type UserFacingErrorOptions = {
  /** Replaces the generic validation sentence (the gym has per-field limits copy). */
  describeIssues?: (issues: readonly ValidationIssueLike[]) => string;
};

/**
 * The text to show for a failed request. Network failures and internal 5xx
 * get a friendly generic line; a BAD_REQUEST whose message is Zod issue JSON
 * becomes "Check the value you entered for <field>." (UX-X-06); deliberate
 * server messages (validation prose, "Invalid email or password", rate
 * limits, SERVICE_UNAVAILABLE copy) pass through untouched.
 */
export function userFacingErrorMessage(
  error: unknown,
  fallback = GENERIC_ERROR_MESSAGE,
  options: UserFacingErrorOptions = {},
): string {
  if (isNetworkError(error)) return NETWORK_ERROR_MESSAGE;
  if (isServerError(error)) return SERVER_ERROR_MESSAGE;
  const message = asErrorLike(error)?.message;
  if (typeof message !== 'string' || message.trim() === '') return fallback;
  const issues = parseIssuesFromMessage(message);
  if (issues === null) return message;
  return (options.describeIssues ?? describeValidationIssues)(issues);
}
