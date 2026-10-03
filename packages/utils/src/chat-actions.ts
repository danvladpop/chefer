import { CHAT_ACTIONS_MARKER, chatActionSchema, type ChatAction } from '@chefer/types';

// UX-FOOD-21: split a streamed chat reply into what to show and what it did.
// Works on the whole text so far (a stream can end a chunk mid-marker), so a
// client re-runs it on the accumulated text after every chunk.

/** Longest suffix of `text` that is a proper prefix of the marker (a half-arrived marker). */
function partialMarkerLength(text: string): number {
  const max = Math.min(CHAT_ACTIONS_MARKER.length - 1, text.length);
  for (let len = max; len > 0; len--) {
    if (CHAT_ACTIONS_MARKER.startsWith(text.slice(text.length - len))) return len;
  }
  return 0;
}

export function splitChatActions(raw: string): { text: string; actions: ChatAction[] } {
  const at = raw.indexOf(CHAT_ACTIONS_MARKER);
  if (at < 0) {
    return { text: raw.slice(0, raw.length - partialMarkerLength(raw)), actions: [] };
  }
  const text = raw.slice(0, at);
  try {
    const parsed: unknown = JSON.parse(raw.slice(at + CHAT_ACTIONS_MARKER.length));
    const list = Array.isArray(parsed) ? parsed : [];
    const actions = list.flatMap((item) => {
      const result = chatActionSchema.safeParse(item);
      return result.success ? [result.data] : [];
    });
    return { text, actions };
  } catch {
    // The JSON has not fully arrived yet (or is damaged): show the text, no chips.
    return { text, actions: [] };
  }
}

/** The trailer the API appends for an opted-in client. Empty for no actions. */
export function chatActionsTrailer(actions: readonly ChatAction[]): string {
  return actions.length === 0 ? '' : `${CHAT_ACTIONS_MARKER}${JSON.stringify(actions)}`;
}
