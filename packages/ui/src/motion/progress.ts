// Pure progress-to-value maths (MO-06) for ProgressRing / ProgressBar — the
// web twin of @chefer/ui-mobile's motion/progress.ts (which carries Reanimated
// 'worklet' directives and so cannot be shared as-is). Keep the two in step.

/** Most of the overflow we visualise: one extra "lap" (200%). */
export const MAX_PROGRESS = 2;

/** Sanitise a raw fraction: non-finite → 0, clamped to [0, MAX_PROGRESS]. */
export function normaliseProgress(progress: number): number {
  if (!Number.isFinite(progress)) return 0;
  return Math.min(MAX_PROGRESS, Math.max(0, progress));
}

/** value / target as a fraction; a 0 target counts as 1 (never divides by 0). */
export function progressOf(value: number, target: number): number {
  return normaliseProgress(value / (target || 1));
}

/** Strictly past 100%: 2,810 of 2,728 kcal is over; exactly 2,728 is met. */
export function isOverTarget(progress: number): boolean {
  return normaliseProgress(progress) > 1;
}

/** The first-lap fill, 0..1. */
export function mainFill(progress: number): number {
  return Math.min(1, normaliseProgress(progress));
}

/** The overflow past 100%, 0..1 (0 when on or under target). */
export function overflowFill(progress: number): number {
  return Math.max(0, normaliseProgress(progress) - 1);
}

/** strokeDashoffset that draws `fill` (0..1) of a circle of `circumference`. */
export function dashOffset(circumference: number, fill: number): number {
  return circumference * (1 - Math.min(1, Math.max(0, fill)));
}

/** The fill colour: the over colour once past 100% (when one is given). */
export function progressColor(progress: number, color: string, overColor?: string): string {
  return overColor !== undefined && isOverTarget(progress) ? overColor : color;
}
