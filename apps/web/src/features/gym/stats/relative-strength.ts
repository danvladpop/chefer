// Bodyweight overlay + relative-strength toggle for the e1RM chart (gym_plan.md
// §1.3 Stats tab #1; research §6.1 "Bodyweight overlay").
import type { BodyweightPointDto, E1rmPointDto } from '@chefer/types';
import { bodyweightOn, relativeStrength } from '@chefer/utils';

export interface RelativePoint extends E1rmPointDto {
  /** Most recently known bodyweight on or before this point's date, kg. */
  bodyweightKg: number | null;
  /** e1RM ÷ bodyweight, rounded to 2 decimals. Null when no bodyweight is known yet. */
  relative: number | null;
}

/**
 * Attaches the latest known bodyweight to each e1RM point (carried forward —
 * bodyweight isn't logged every day) and derives the relative-strength ratio.
 * UX-GYM-17: `fallbackKg` (the profile / onboarding weight) covers a user who
 * never logged a weigh-in; with neither, the ratio is null — never the raw kg.
 */
export function withBodyweight(
  points: E1rmPointDto[],
  bodyweight: BodyweightPointDto[],
  fallbackKg: number | null = null,
): RelativePoint[] {
  return points.map((point) => {
    const bodyweightKg = bodyweightOn(bodyweight, point.localDate, fallbackKg);
    return { ...point, bodyweightKg, relative: relativeStrength(point.e1rmKg, bodyweightKg) };
  });
}
