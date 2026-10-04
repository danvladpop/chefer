import type { trpc } from '@/lib/trpc';
import type { WorkoutSessionDoc } from '@chefer/types';
import { localDate } from '../use-gym-bootstrap';
import { outbox } from '../workout/outbox';
import { getGymOwner } from '../workout/owner';
import { foldFinished } from '../workout/use-active-workout';

// Saving a quick-logged activity (WP-20): the finished doc goes through the same
// offline outbox as any workout (durable first, uploaded by gym-sync via
// `gym.session.upsertMany`), then is folded into the cached bootstrap so
// History / Recent / the week ring show it at once. Mirrors the phone's
// `saveLoggedSession`. Record only — nothing here touches food.

/** An activity starts at this local time on its day (like a past-workout log). */
export const ACTIVITY_START_TIME = '18:00';

/** "HH:MM" on a browser-local date → an absolute instant (the web twin of mobile's `localInstant`). */
export function activityStartAt(date: string, time: string = ACTIVITY_START_TIME): string {
  const [year, month, day] = date.split('-').map(Number);
  const [hour, minute] = time.split(':').map(Number);
  return new Date(
    year ?? 1970,
    (month ?? 1) - 1,
    day ?? 1,
    hour ?? 0,
    minute ?? 0,
    0,
    0,
  ).toISOString();
}

export async function saveActivityLog(
  utils: ReturnType<typeof trpc.useUtils>,
  doc: WorkoutSessionDoc,
): Promise<void> {
  outbox.enqueue(doc, { ownerId: getGymOwner() });
  const today = localDate();
  // A bootstrap fetched before the upload must not overwrite the fold.
  await utils.gym.bootstrap.cancel();
  utils.gym.bootstrap.setData({ today }, (prev) => (prev ? foldFinished(prev, doc, today) : prev));
}
