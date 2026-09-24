import type { ActiveSessionRecord } from './active-session-store';
import type { SendDocs } from './outbox';

// Best-effort in-progress checkpoint (gym_plan.md §5.2): while online, the
// active doc is upserted as IN_PROGRESS at most once a minute, so a phone that
// dies mid-session still leaves a server copy. Failures are ignored — the
// on-device copy is the source of truth and the finished doc goes through the
// outbox. Server-side staleness (clientUpdatedAt) makes a late checkpoint that
// lands after the COMPLETED doc harmless.

export const CHECKPOINT_INTERVAL_MS = 60_000;

export interface CheckpointDeps {
  getRecord: () => ActiveSessionRecord | null;
  subscribe: (listener: () => void) => () => void;
  send: SendDocs;
  isOnline: () => boolean;
  getOwnerId: () => string | null;
  intervalMs?: number;
}

/** Starts watching the active session; returns a stop function. */
export function startCheckpointing(deps: CheckpointDeps): () => void {
  const interval = deps.intervalMs ?? CHECKPOINT_INTERVAL_MS;
  let timer: ReturnType<typeof setTimeout> | null = null;
  let lastSent: string | null = null;

  const fire = async () => {
    timer = null;
    const record = deps.getRecord();
    if (record?.doc.status !== 'IN_PROGRESS') return;
    if (record.doc.clientUpdatedAt === lastSent) return;
    const owner = deps.getOwnerId();
    if (owner === null || (record.ownerId !== null && record.ownerId !== owner)) return;
    if (!deps.isOnline()) {
      schedule(); // try again next window
      return;
    }
    const sentVersion = record.doc.clientUpdatedAt;
    try {
      await deps.send([record.doc]);
      lastSent = sentVersion;
    } catch {
      // Best effort only.
    }
  };

  function schedule() {
    if (timer !== null) return;
    timer = setTimeout(() => void fire(), interval);
  }

  const onChange = () => {
    const record = deps.getRecord();
    if (!record) {
      if (timer !== null) clearTimeout(timer);
      timer = null;
      lastSent = null;
      return;
    }
    if (record.doc.status === 'IN_PROGRESS' && record.doc.clientUpdatedAt !== lastSent) {
      schedule();
    }
  };

  const unsubscribe = deps.subscribe(onChange);
  onChange(); // a resumed session starts its window immediately
  return () => {
    unsubscribe();
    if (timer !== null) clearTimeout(timer);
    timer = null;
  };
}
