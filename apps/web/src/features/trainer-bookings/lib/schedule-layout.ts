import { DAY_MINUTES } from '@chefer/utils';

// ─── Schedule grid interactions on the web (trainer-mode.md §6.2) ─────────────
// Mouse/pen-only helpers: a click or drag on an empty slot and a drag of a
// block snap to the grid. Where blocks sit and how overlaps share a column are
// the shared rules in @chefer/utils (`layoutBookingDay`).

/** Snap a minute to a step (default 15), clamped to the day. */
export function snapMinute(minute: number, step = 15): number {
  const snapped = Math.round(minute / step) * step;
  return Math.max(0, Math.min(DAY_MINUTES - step, snapped));
}

/** A click (or a drag from `a` to `b`) on an empty slot → the editor's start and duration. */
export function slotSelection(
  a: number,
  b: number,
  options: { step?: number; defaultDuration?: number; min?: number; max?: number } = {},
): { start: number; durationMin: number } {
  const step = options.step ?? 15;
  const min = options.min ?? 15;
  const max = options.max ?? 240;
  const lo = Math.min(a, b);
  const hi = Math.max(a, b);
  const start = Math.floor(lo / step) * step;
  if (hi - lo < step) return { start, durationMin: options.defaultDuration ?? 60 };
  const end = Math.ceil(hi / step) * step;
  return { start, durationMin: Math.max(min, Math.min(max, end - start, DAY_MINUTES - start)) };
}

/** "18:05" for a minute of the day. */
export function minuteToTime(minute: number): string {
  const m = Math.max(0, Math.min(DAY_MINUTES - 1, Math.round(minute)));
  return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
}
