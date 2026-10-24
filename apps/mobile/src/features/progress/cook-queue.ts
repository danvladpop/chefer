import type { FinishCookInput } from '@chefer/types';
import { kv } from '../gym/offline/kv';

// An offline cook finish (tech-plan.md §6 "Cook finish offline"). `finishCook`
// is called for every user when a cook ends (D1); when the call fails the cook
// is parked here and retried on the next foreground. The cook's UUID is the
// idempotency key, so a retry after a half-delivered first try cannot double
// count. It lives in the device key-value store (the repo's persisted store —
// AsyncStorage is not installed), so sign-out's key scan wipes it with the
// rest of the account's device state.

export const COOK_QUEUE_KEY = 'progress.cook-queue';
/** A phone that was never online between cooks still keeps this many. */
export const COOK_QUEUE_MAX = 20;

type StoredCook = {
  id: string;
  recipeId: string | null;
  localDate: string;
  startedAt?: string;
  finishedAt: string;
};

function read(): StoredCook[] {
  const raw = kv.getJSON(COOK_QUEUE_KEY);
  if (!Array.isArray(raw)) return [];
  return raw.filter(
    (e): e is StoredCook =>
      typeof e === 'object' &&
      e !== null &&
      typeof (e as StoredCook).id === 'string' &&
      typeof (e as StoredCook).localDate === 'string' &&
      typeof (e as StoredCook).finishedAt === 'string',
  );
}

function write(entries: StoredCook[]): void {
  if (entries.length === 0) kv.remove(COOK_QUEUE_KEY);
  else kv.setJSON(COOK_QUEUE_KEY, entries);
}

/** Parks a cook whose `finishCook` call failed. A repeat of the same id is ignored. */
export function enqueueCook(input: FinishCookInput): void {
  const entries = read();
  if (entries.some((e) => e.id === input.id)) return;
  entries.push({
    id: input.id,
    recipeId: input.recipeId,
    localDate: input.localDate,
    ...(input.startedAt ? { startedAt: input.startedAt.toISOString() } : {}),
    finishedAt: input.finishedAt.toISOString(),
  });
  write(entries.slice(-COOK_QUEUE_MAX));
}

/** How many cooks are waiting. */
export function queuedCookCount(): number {
  return read().length;
}

function toInput(e: StoredCook): FinishCookInput {
  return {
    id: e.id,
    recipeId: e.recipeId,
    localDate: e.localDate,
    ...(e.startedAt ? { startedAt: new Date(e.startedAt) } : {}),
    finishedAt: new Date(e.finishedAt),
  };
}

/** A 4xx other than auth/timeouts will never succeed: drop it instead of retrying for ever. */
function isPermanentFailure(error: unknown): boolean {
  if (typeof error !== 'object' || error === null || !('data' in error)) return false;
  const status = (error as { data?: { httpStatus?: number } }).data?.httpStatus;
  return status !== undefined && status >= 400 && status < 500 && ![401, 408, 429].includes(status);
}

let flushing: Promise<number> | null = null;

/**
 * Sends the parked cooks in order. A transient failure stops the run (the rest
 * stay for next time); a permanent one drops just that entry. Returns how many
 * were delivered. Overlapping calls share one run.
 */
export function flushCookQueue(
  send: (input: FinishCookInput) => Promise<unknown>,
): Promise<number> {
  flushing ??= (async () => {
    let delivered = 0;
    for (const entry of read()) {
      try {
        await send(toInput(entry));
        delivered += 1;
      } catch (error) {
        if (!isPermanentFailure(error)) break;
      }
      write(read().filter((e) => e.id !== entry.id));
    }
    return delivered;
  })().finally(() => {
    flushing = null;
  });
  return flushing;
}
