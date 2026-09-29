import { weekdayOf } from '@chefer/utils';
import { KV_KEYS } from '../offline/keys';
import { kv } from '../offline/kv';

// T-36.6 (UX-36 (6)): the `Time today:` choice at Start is remembered per
// weekday in the gym's on-device KV store — a user who always has 30 minutes
// on Tuesdays gets 30 pre-selected next Tuesday. Absent = `Full` (the
// default), which is also what every install starts with. Stored as
// `{ "0": 30, "3": 20 }` (0 = Monday … 6 = Sunday); never sent to the server.

type ByWeekday = Record<string, number>;

function readAll(): ByWeekday {
  const raw = kv.getJSON(KV_KEYS.timeToday);
  if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) return {};
  const out: ByWeekday = {};
  for (const [day, minutes] of Object.entries(raw as Record<string, unknown>)) {
    if (typeof minutes === 'number' && Number.isFinite(minutes) && minutes > 0) {
      out[day] = minutes;
    }
  }
  return out;
}

/** The remembered minutes for `localDate`'s weekday; null = Full. */
export function getTimeToday(localDate: string): number | null {
  return readAll()[String(weekdayOf(localDate))] ?? null;
}

/** Remembers `minutes` (null = Full) for `localDate`'s weekday. */
export function setTimeToday(localDate: string, minutes: number | null): void {
  const key = String(weekdayOf(localDate));
  // Rebuild without `key` instead of `delete` — keeps the map's shape simple.
  const rest = Object.fromEntries(Object.entries(readAll()).filter(([day]) => day !== key));
  kv.setJSON(KV_KEYS.timeToday, minutes === null ? rest : { ...rest, [key]: minutes });
}
