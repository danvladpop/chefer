import { isNetworkError, NETWORK_ERROR_MESSAGE, userFacingErrorMessage } from './user-facing-error';

// ─── AI chef: failures as sentences (UX-FOOD-21) ──────────────────────────────
// The chat used to show "Chat failed (502)" and a bare "Unauthorized". One
// mapping for web and mobile: a status (and the server's own sentence, when it
// sent one) or a thrown error in, a line about what to do next out.

export const CHEF_BUSY_MESSAGE = 'The chef is busy right now. Try again in a moment.';
export const CHEF_UNAVAILABLE_MESSAGE = 'The chef is unavailable right now. Try again in a moment.';
export const CHAT_SLOW_DOWN_MESSAGE =
  'You are sending messages quickly. Wait a moment and try again.';
export const CHAT_NOT_SENT_MESSAGE = "That message couldn't be sent. Try again.";
export const CHAT_SESSION_EXPIRED_MESSAGE = 'Your session ended. Sign in again to keep chatting.';

export function chatFailureMessage(input: {
  /** HTTP status of the failed request, when there was a response. */
  status?: number | null | undefined;
  /** The server's own JSON `error` sentence, when it sent one. */
  serverMessage?: string | null | undefined;
  /** What was thrown, when there was no usable response (offline, aborted…). */
  error?: unknown;
}): string {
  const { status, serverMessage, error } = input;
  if (status === 401) return CHAT_SESSION_EXPIRED_MESSAGE;
  if (status !== undefined && status !== null) {
    if (serverMessage) return serverMessage;
    if (status === 429) return CHAT_SLOW_DOWN_MESSAGE;
    if (status === 503) return CHEF_BUSY_MESSAGE;
    if (status >= 500) return CHEF_UNAVAILABLE_MESSAGE;
    return CHAT_NOT_SENT_MESSAGE;
  }
  if (isNetworkError(error)) return NETWORK_ERROR_MESSAGE;
  return userFacingErrorMessage(error, CHEF_UNAVAILABLE_MESSAGE);
}
