// Role-named radii (px) — docs/audit-2026-09/motion-system.md §2.4. The
// values are the ones the apps already use; the names say what they are for.

export const radius = {
  /** Thumbnails inside cards, tags, inner tiles, progress-bar tracks (was rounded-lg). */
  inner: 8,
  /** Buttons, inputs, square chips, segmented tracks, day pills (was rounded-xl / Button's rounded-md). */
  control: 12,
  /** Cards, dashboard sections, desktop dialog (was rounded-2xl). */
  card: 16,
  /** Bottom sheets (top corners), hero media (was rounded-t-3xl). */
  sheet: 24,
  /** Avatars, FAB, pills, badges, rings. */
  full: 9999,
} as const;

export type RadiusRole = keyof typeof radius;
