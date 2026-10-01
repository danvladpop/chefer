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
  return error !== null && typeof error === 'object' ? (error as ErrorLike) : null;
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

/**
 * The text to show for a failed request. Network failures and internal 5xx
 * get a friendly generic line; deliberate server messages (validation,
 * "Invalid email or password", rate limits, SERVICE_UNAVAILABLE copy) pass
 * through untouched.
 */
export function userFacingErrorMessage(error: unknown, fallback = GENERIC_ERROR_MESSAGE): string {
  if (isNetworkError(error)) return NETWORK_ERROR_MESSAGE;
  if (isServerError(error)) return SERVER_ERROR_MESSAGE;
  const message = asErrorLike(error)?.message;
  return typeof message === 'string' && message.trim() !== '' ? message : fallback;
}
