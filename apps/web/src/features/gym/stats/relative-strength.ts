// Bodyweight overlay + relative-strength toggle for the e1RM chart (gym_plan.md
// §1.3 Stats tab #1; research §6.1 "Bodyweight overlay").
import type { BodyweightPointDto, E1rmPointDto } from '@chefer/types';

export interface RelativePoint extends E1rmPointDto {
  /** Most recently known bodyweight on or before this point's date, kg. */
  bodyweightKg: number | null;
  /** e1RM ÷ bodyweight, rounded to 2 decimals. Null when no bodyweight is known yet. */
  relative: number | null;
}

/**
 * Attaches the latest known bodyweight to each e1RM point (carried forward —
 * bodyweight isn't logged every day) and derives the relative-strength ratio.
 */
export function withBodyweight(
  points: E1rmPointDto[],
  bodyweight: BodyweightPointDto[],
): RelativePoint[] {
  const sorted = [...bodyweight].sort((a, b) => a.localDate.localeCompare(b.localDate));
  return points.map((point) => {
    let bodyweightKg: number | null = null;
    for (const entry of sorted) {
      if (entry.localDate > point.localDate) break;
      bodyweightKg = entry.weightKg;
    }
    const relative =
      bodyweightKg !== null && bodyweightKg > 0
        ? Math.round((point.e1rmKg / bodyweightKg) * 100) / 100
        : null;
    return { ...point, bodyweightKg, relative };
  });
}
