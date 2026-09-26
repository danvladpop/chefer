// Pure progress-to-value maths (MO-06), shared by ProgressRing and
// ProgressBar. Each helper is a worklet so the UI thread can call it from an
// animated-props/style updater; it runs on the JS thread just the same.

/** Most of the overflow we visualise: one extra "lap" (200%). */
export const MAX_PROGRESS = 2;

/** Sanitise a raw fraction: non-finite → 0, clamped to [0, MAX_PROGRESS]. */
export function normaliseProgress(progress: number): number {
  'worklet';
  if (!Number.isFinite(progress)) return 0;
  return Math.min(MAX_PROGRESS, Math.max(0, progress));
}

/** value / target as a fraction; a 0 target counts as 1 (never divides by 0). */
export function progressOf(value: number, target: number): number {
  'worklet';
  return normaliseProgress(value / (target || 1));
}

/** Strictly past 100%: 2,810 of 2,728 kcal is over; exactly 2,728 is met. */
export function isOverTarget(progress: number): boolean {
  'worklet';
  return normaliseProgress(progress) > 1;
}

/** The first-lap fill, 0..1. */
export function mainFill(progress: number): number {
  'worklet';
  return Math.min(1, normaliseProgress(progress));
}

/** The overflow past 100%, 0..1 (0 when on or under target). */
export function overflowFill(progress: number): number {
  'worklet';
  return Math.max(0, normaliseProgress(progress) - 1);
}

/** strokeDashoffset that draws `fill` (0..1) of a circle of `circumference`. */
export function dashOffset(circumference: number, fill: number): number {
  'worklet';
  return circumference * (1 - Math.min(1, Math.max(0, fill)));
}

/** The fill colour: the over colour once past 100% (when one is given). */
export function progressColor(progress: number, color: string, overColor?: string): string {
  return overColor !== undefined && isOverTarget(progress) ? overColor : color;
}
