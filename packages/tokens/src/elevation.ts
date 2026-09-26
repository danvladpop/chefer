// Elevation tokens — docs/audit-2026-09/motion-system.md §2.3.
// Warm-tinted (brown-black, hue 25°) two-layer shadows: a tight contact
// shadow plus a soft ambient one. Web exposes them as CSS variables
// (--elevation-1..4, --elevation-4-up); mobile passes the SAME strings to RN's
// `boxShadow` style prop (New Architecture) — always through `style`, never a
// toggled `shadow-*` className (NativeWind remounts a component whose
// className gains a shadow at runtime; see ui-mobile segmented-control.tsx).

export const elevation = {
  /** Flat: list rows, meal cards inside a day, settings rows (border only). */
  e0: 'none',
  /** Resting: standard cards, stat tiles. */
  e1: '0 1px 2px rgba(67,42,25,.06), 0 1px 3px rgba(67,42,25,.04)',
  /** Raised: one hero per screen, sticky header once scrolled. */
  e2: '0 2px 4px -1px rgba(67,42,25,.06), 0 6px 16px -4px rgba(67,42,25,.10)',
  /** Floating: FAB, toast, menus, rest-timer bar, dragged item. */
  e3: '0 4px 8px -2px rgba(67,42,25,.08), 0 12px 28px -6px rgba(67,42,25,.16)',
  /** Modal: desktop dialog. */
  e4: '0 8px 16px -4px rgba(67,42,25,.10), 0 24px 56px -12px rgba(67,42,25,.28)',
  /** Modal, cast upward: bottom sheets / drawers on phones. */
  e4Up: '0 -4px 12px -4px rgba(67,42,25,.08), 0 -16px 40px -12px rgba(67,42,25,.18)',
} as const;

export type ElevationLevel = keyof typeof elevation;
