// Booking times (docs/prd-2026-10/trainer-mode.md §8.2): a booking is stored as
// a UTC instant plus the IANA zone it was made in, and weekly repeats are
// computed in that zone, so a DST shift keeps 18:00 at 18:00. Intl only (no
// time-zone library in the repo); Hermes ships Intl with time zones on both
// platforms. Local dates are `YYYY-MM-DD`, local times `HH:MM`, weekdays
// 0 = Monday … 6 = Sunday (the gym engine's convention).
import { addDaysLocal, weekdayOf } from '../gym/weeks';

const MINUTE_MS = 60_000;
const formatters = new Map<string, Intl.DateTimeFormat>();

function formatterFor(timeZone: string): Intl.DateTimeFormat {
  let f = formatters.get(timeZone);
  if (!f) {
    f = new Intl.DateTimeFormat('en-US', {
      timeZone,
      hourCycle: 'h23',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
    formatters.set(timeZone, f);
  }
  return f;
}

/** Whether `timeZone` is an IANA zone this runtime knows. */
export function isValidTimeZone(timeZone: string): boolean {
  try {
    formatterFor(timeZone);
    return true;
  } catch {
    return false;
  }
}

interface WallClock {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
}

function wallClockAt(timeZone: string, utcMs: number): WallClock {
  const parts: Partial<Record<Intl.DateTimeFormatPartTypes, string>> = {};
  for (const p of formatterFor(timeZone).formatToParts(new Date(utcMs))) parts[p.type] = p.value;
  return {
    year: Number(parts.year),
    month: Number(parts.month),
    day: Number(parts.day),
    // Some engines print midnight as "24" under h23; treat it as 0.
    hour: Number(parts.hour) % 24,
    minute: Number(parts.minute),
    second: Number(parts.second),
  };
}

/** The zone's offset from UTC in minutes at that instant (Bucharest summer = +180). */
export function zoneOffsetMinutes(timeZone: string, at: Date): number {
  const ms = at.getTime() - (at.getTime() % 1000);
  const w = wallClockAt(timeZone, ms);
  const asUtc = Date.UTC(w.year, w.month - 1, w.day, w.hour, w.minute, w.second);
  return Math.round((asUtc - ms) / MINUTE_MS);
}

function parseDate(date: string): [number, number, number] {
  const [y, m, d] = date.split('-').map(Number);
  return [y ?? 0, m ?? 1, d ?? 1];
}

function parseTime(time: string): [number, number] {
  const [h, m] = time.split(':').map(Number);
  return [h ?? 0, m ?? 0];
}

/**
 * The UTC instant of a wall-clock time in `timeZone`. A time that does not
 * exist (the hour skipped in spring) resolves to the instant just after the
 * gap; an ambiguous one (the repeated hour in autumn) to its first occurrence.
 */
export function zonedToUtc(date: string, time: string, timeZone: string): Date {
  const [y, mo, d] = parseDate(date);
  const [h, mi] = parseTime(time);
  const guess = Date.UTC(y, mo - 1, d, h, mi);
  // The offsets in force half a day either side cover any transition near this time.
  const before = zoneOffsetMinutes(timeZone, new Date(guess - 12 * 60 * MINUTE_MS));
  const after = zoneOffsetMinutes(timeZone, new Date(guess + 12 * 60 * MINUTE_MS));
  const matches = [...new Set([before, after])]
    .map((offset) => guess - offset * MINUTE_MS)
    .filter((utc) => zoneOffsetMinutes(timeZone, new Date(utc)) * MINUTE_MS === guess - utc);
  // Ambiguous (the repeated autumn hour): the first occurrence. Skipped (the
  // spring gap): shift forward by the gap, i.e. read it with the earlier offset.
  return new Date(matches.length > 0 ? Math.min(...matches) : guess - before * MINUTE_MS);
}

export interface ZonedParts {
  /** `YYYY-MM-DD` in the zone. */
  date: string;
  /** `HH:MM` in the zone. */
  time: string;
  /** 0 = Monday … 6 = Sunday. */
  weekday: number;
  /** Minutes since local midnight (for laying blocks out on a day grid). */
  minuteOfDay: number;
}

const pad = (n: number) => String(n).padStart(2, '0');

/** Wall-clock parts of an instant in `timeZone`. */
export function utcToZoned(at: Date | string, timeZone: string): ZonedParts {
  const ms = typeof at === 'string' ? Date.parse(at) : at.getTime();
  const w = wallClockAt(timeZone, ms);
  const date = `${w.year}-${pad(w.month)}-${pad(w.day)}`;
  return {
    date,
    time: `${pad(w.hour)}:${pad(w.minute)}`,
    weekday: weekdayOf(date),
    minuteOfDay: w.hour * 60 + w.minute,
  };
}

/**
 * The local dates of a weekly repeat: `first`, then every 7 days while ≤ `until`
 * (inclusive), at most `max` dates. Dates, not instants: each one becomes an
 * instant through `zonedToUtc`, so the wall-clock time survives DST.
 */
export function weeklyDates(first: string, until: string, max: number): string[] {
  const out: string[] = [];
  for (let d = first; d <= until && out.length < max; d = addDaysLocal(d, 7)) out.push(d);
  return out;
}

/** The instants of a weekly series at `time` in `timeZone`. */
export function weeklyOccurrences(input: {
  first: string;
  until: string;
  time: string;
  timeZone: string;
  max: number;
}): Date[] {
  return weeklyDates(input.first, input.until, input.max).map((d) =>
    zonedToUtc(d, input.time, input.timeZone),
  );
}

/** Two half-open intervals [start, start + duration) overlap. */
export function intervalsOverlap(
  a: { startsAt: Date | string; durationMin: number },
  b: { startsAt: Date | string; durationMin: number },
): boolean {
  const aStart = new Date(a.startsAt).getTime();
  const bStart = new Date(b.startsAt).getTime();
  return aStart < bStart + b.durationMin * MINUTE_MS && bStart < aStart + a.durationMin * MINUTE_MS;
}
