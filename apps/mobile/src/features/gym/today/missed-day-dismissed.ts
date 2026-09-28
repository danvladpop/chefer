import { KV_KEYS } from '../offline/keys';
import { kv } from '../offline/kv';

// T-04.8 (UX-04 §7): "Not this week" dismissal for a missed planned day —
// D22 (never nagging): once dismissed, that routine day never resurfaces the
// "Still time this week" card again for THIS week. Stored as
// `{ [weekStart]: routineDayId[] }`; old weeks are pruned on write so the
// blob never grows without bound.

type DismissedByWeek = Record<string, string[]>;

function readAll(): DismissedByWeek {
  const raw = kv.getJSON(KV_KEYS.missedDayDismissed);
  if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) return {};
  return raw as DismissedByWeek;
}

export function isMissedDayDismissed(weekStart: string, routineDayId: string): boolean {
  return (readAll()[weekStart] ?? []).includes(routineDayId);
}

export function dismissMissedDay(weekStart: string, routineDayId: string): void {
  const all = readAll();
  const next = new Set(all[weekStart] ?? []);
  next.add(routineDayId);
  // Keep only this week and the previous one — old weeks are dead weight.
  const kept = Object.fromEntries(
    Object.entries(all)
      .filter(([week]) => week >= weekStart)
      .map(([week, ids]) => [week, week === weekStart ? [...next] : ids]),
  );
  kv.setJSON(KV_KEYS.missedDayDismissed, { ...kept, [weekStart]: [...next] });
}
