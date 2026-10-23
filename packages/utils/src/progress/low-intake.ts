/**
 * The low-intake guard (idea 59). True when at least 3 of the 7 most recent
 * full days are below the calorie floor. It only ever quiets food rewards; it
 * never pays or penalises XP.
 */
export function lowIntakeSignal(
  days: { localDate: string; totalKcal: number; full: boolean }[],
  floorKcal: number,
): boolean {
  const recent = days
    .filter((d) => d.full)
    .sort((a, b) => b.localDate.localeCompare(a.localDate))
    .slice(0, 7);
  return recent.filter((d) => d.totalKcal < floorKcal).length >= 3;
}
