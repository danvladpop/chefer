// The "Superset" sheet's pick rules (plan-library-supersets S-D1), shared by
// the routine editor and the active workout. Pure, so the limits are tested
// without rendering the sheet.
import { MAX_SUPERSET_SIZE } from '@chefer/utils';

/** Fewest exercises a superset can hold. */
export const MIN_SUPERSET_SIZE = 2;

/** Ticks / unticks `id`; a tick past MAX_SUPERSET_SIZE is ignored. */
export function togglePick(picked: readonly string[], id: string): string[] {
  if (picked.includes(id)) return picked.filter((p) => p !== id);
  if (picked.length >= MAX_SUPERSET_SIZE) return [...picked];
  return [...picked, id];
}

/** True when "Group as superset" can run on these picks. */
export function canGroupPicks(picked: readonly string[]): boolean {
  return picked.length >= MIN_SUPERSET_SIZE && picked.length <= MAX_SUPERSET_SIZE;
}

/** An unticked row is locked once the superset is full. */
export function isPickLocked(picked: readonly string[], id: string): boolean {
  return !picked.includes(id) && picked.length >= MAX_SUPERSET_SIZE;
}

/** The sheet's sub-line (same copy as the phone app). */
export const SUPERSET_SHEET_HINT = `Pick ${MIN_SUPERSET_SIZE} to ${MAX_SUPERSET_SIZE} exercises to do back to back. You rest after the round.`;
