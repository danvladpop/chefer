import { z } from 'zod';
import { chatActionSchema, type ChatAction } from '@chefer/types';
import { kv } from '../gym/offline/kv';

// UX-FOOD-21: the AI Chef thread used to be wiped the moment you left the
// screen. The last thread is kept on the device for the rest of that calendar
// day (a new day starts clean). It lives in the on-device KV store, so signing
// out wipes it with everything else the account left behind.

const KEY = 'chat.thread';
const MAX_MESSAGES = 40;

export interface ThreadMessage {
  id: number;
  role: 'user' | 'assistant';
  content: string;
  /** UX-22 (T-22.2, AC4) — set once the reply finishes streaming. */
  healthTopic?: boolean;
  safetyTopic?: boolean;
  /** What the chef's tools did for this reply (View / Undo chips). */
  actions?: ChatAction[];
  /** Indexes into `actions` that were undone. */
  undone?: number[];
  /** A user message the chef never answered: offers "Tap to retry". */
  failed?: boolean;
  /** The reply was cut short by the Stop button. */
  stopped?: boolean;
}

interface Stored {
  date: string;
  messages: ThreadMessage[];
}

// Lenient on purpose: an action the app no longer understands is dropped, and
// any other damage drops just that message, never the whole day.
const storedMessageSchema = z.object({
  id: z.number(),
  role: z.enum(['user', 'assistant']),
  content: z.string(),
  healthTopic: z.boolean().optional(),
  safetyTopic: z.boolean().optional(),
  actions: z.array(z.unknown()).optional(),
  undone: z.array(z.number()).optional(),
  failed: z.boolean().optional(),
  stopped: z.boolean().optional(),
});

function parseMessage(value: unknown): ThreadMessage | null {
  const parsed = storedMessageSchema.safeParse(value);
  if (!parsed.success) return null;
  const m = parsed.data;
  const actions = (m.actions ?? []).flatMap((a) => {
    const action = chatActionSchema.safeParse(a);
    return action.success ? [action.data] : [];
  });
  return {
    id: m.id,
    role: m.role,
    content: m.content,
    ...(m.healthTopic && { healthTopic: true }),
    ...(m.safetyTopic && { safetyTopic: true }),
    ...(actions.length > 0 && { actions }),
    ...(m.undone && m.undone.length > 0 && { undone: m.undone }),
    ...(m.failed && { failed: true }),
    ...(m.stopped && { stopped: true }),
  };
}

/** The saved thread for `today`, or an empty one (another day, nothing saved, damaged data). */
export function loadThread(today: string): ThreadMessage[] {
  try {
    const stored = kv.getJSON(KEY) as Partial<Stored> | null;
    if (stored?.date !== today || !Array.isArray(stored.messages)) return [];
    const messages = stored.messages.flatMap((m) => {
      const parsed = parseMessage(m);
      return parsed ? [parsed] : [];
    });
    // A request cut off mid-flight (the user left, the app was killed) leaves a
    // question with no answer: make it retryable instead of silently pending.
    const last = messages.at(-1);
    return last?.role === 'user' ? [...messages.slice(0, -1), { ...last, failed: true }] : messages;
  } catch {
    return [];
  }
}

/** Saves the thread for `today`. Empty assistant placeholders are dropped. */
export function saveThread(today: string, messages: readonly ThreadMessage[]): void {
  try {
    const kept = messages.filter((m) => m.role === 'user' || m.content.trim() !== '');
    if (kept.length === 0) {
      kv.remove(KEY);
      return;
    }
    const stored: Stored = { date: today, messages: kept.slice(-MAX_MESSAGES) };
    kv.setJSON(KEY, stored);
  } catch {
    // Storage unavailable: the thread is just not remembered.
  }
}

export function clearThread(): void {
  try {
    kv.remove(KEY);
  } catch {
    // nothing to clear
  }
}
