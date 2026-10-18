// ─── The mobile schedule grid's own helpers (trainer-mode.md §6.2) ────────────
// The booking rules (layout, labels, windows, drafts) are shared with web in
// @chefer/utils (coaching/bookings.ts). These are only the touch grid's: how
// tall a block is drawn and where a long-press lands.

const DAY_MINUTES = 24 * 60;

/** The shortest a block is drawn, so a 15-minute slot still holds a readable line. */
export const MIN_BLOCK_MINUTES = 30;

/** "HH:MM" of a minute of the day (1440 reads "24:00"). */
export function clockOf(minuteOfDay: number): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${pad(Math.floor(minuteOfDay / 60))}:${pad(minuteOfDay % 60)}`;
}

/** A long-press at `minute` of the grid → a start time on the 15-minute grid ("HH:MM"). */
export function slotTimeAt(minute: number): string {
  const clamped = Math.min(DAY_MINUTES - 15, Math.max(0, minute));
  return clockOf(Math.floor(clamped / 15) * 15);
}
