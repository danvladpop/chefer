import { chatFailureMessage } from '@chefer/utils';
import { ChatStreamError } from '../../lib/chat-stream';

// UX-FOOD-21: the chat used to show "Chat failed (502)" and a bare
// "Unauthorized". The mapping is shared with web (`chatFailureMessage`); this
// only reads the status off a ChatStreamError.
export function chatErrorMessage(err: unknown): string {
  return err instanceof ChatStreamError
    ? chatFailureMessage({ status: err.status, serverMessage: err.serverMessage })
    : chatFailureMessage({ error: err });
}

/** A stopped request: the user pressed Stop, or left the screen. Not an error. */
export function isAbortError(err: unknown): boolean {
  return err instanceof Error && err.name === 'AbortError';
}
