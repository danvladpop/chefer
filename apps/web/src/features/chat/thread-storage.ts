import type { UIMessage } from 'ai';

// UX-FOOD-21: the AI Chef thread, kept for the rest of the calendar day in this
// browser tab. sessionStorage on purpose: it is gone when the tab closes, and a
// shared browser never shows one person's chat to the next. A new day starts
// clean.

const KEY = 'chefer.chat.thread';
const MAX_MESSAGES = 40;

export interface StoredThread {
  messages: UIMessage[];
  /** Per message id: the indexes of the chef's actions that were undone. */
  undone: Record<string, number[]>;
}

const EMPTY: StoredThread = { messages: [], undone: {} };

function isMessage(value: unknown): value is UIMessage {
  if (typeof value !== 'object' || value === null) return false;
  const m = value as { id?: unknown; role?: unknown; parts?: unknown };
  return (
    typeof m.id === 'string' &&
    (m.role === 'user' || m.role === 'assistant') &&
    Array.isArray(m.parts)
  );
}

export function loadThread(today: string): StoredThread {
  if (typeof window === 'undefined') return EMPTY;
  try {
    const raw = window.sessionStorage.getItem(KEY);
    if (!raw) return EMPTY;
    const stored = JSON.parse(raw) as {
      date?: unknown;
      messages?: unknown;
      undone?: unknown;
    };
    if (stored.date !== today || !Array.isArray(stored.messages)) return EMPTY;
    const messages = stored.messages.filter(isMessage);
    const undone =
      typeof stored.undone === 'object' && stored.undone !== null
        ? (stored.undone as Record<string, number[]>)
        : {};
    return { messages, undone };
  } catch {
    return EMPTY;
  }
}

export function saveThread(
  today: string,
  messages: readonly UIMessage[],
  undone: Record<string, number[]>,
): void {
  if (typeof window === 'undefined') return;
  try {
    if (messages.length === 0) {
      window.sessionStorage.removeItem(KEY);
      return;
    }
    window.sessionStorage.setItem(
      KEY,
      JSON.stringify({ date: today, messages: messages.slice(-MAX_MESSAGES), undone }),
    );
  } catch {
    // Storage full or blocked: the thread is just not remembered.
  }
}

export function clearThread(): void {
  if (typeof window === 'undefined') return;
  try {
    window.sessionStorage.removeItem(KEY);
  } catch {
    // nothing to clear
  }
}
