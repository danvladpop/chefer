// Colour roles — the mobile UX revamp's design system (docs/mobile-ux-revamp,
// "Design system → Colour"). One light and one dark value per ROLE, named for
// what the colour does, not what it looks like. The shell-v2 screens read
// these through the Tailwind classes generated from apps/mobile/global.css
// (`bg-canvas`, `text-label-secondary`, …); `color-sync.test.ts` in the
// mobile app keeps global.css and this table identical.
//
// Rules baked into the roles (F8, adherence-neutral copy): numbers are never
// red. Over target is `attention` (amber), on track is neutral, a good week is
// `brand`. `danger` is only for destroying data (delete, sign out of all).

export type ColorScheme = 'light' | 'dark';

export const colorRoles = {
  /** The screen behind everything (warm off-white / deep warm grey). */
  canvas: { light: '#FAF7F2', dark: '#161311' },
  /** Cards and grouped list sections, one step above the canvas. */
  surface: { light: '#FFFFFF', dark: '#211C18' },
  /** Floating things on a surface: the mini bar, sheets, menus. */
  surfaceRaised: { light: '#FFFFFF', dark: '#2B2520' },
  /** Wells inside a surface: search fields, segmented tracks, inputs. */
  surfaceSunken: { light: '#F2ECE4', dark: '#100D0B' },
  /** Hairlines between rows and around cards. */
  separator: { light: '#E6DED3', dark: '#3A332D' },
  /** Primary text. */
  label: { light: '#1C1917', dark: '#F5F1EC' },
  /** Secondary text: subtitles, values, captions. */
  labelSecondary: { light: '#57534E', dark: '#CFC6BC' },
  /** Tertiary text: placeholders, metadata, disabled. Still AA on canvas. */
  labelTertiary: { light: '#6F675F', dark: '#A69B90' },
  /** The brand: primary buttons, active tab, links, a good week. */
  brand: { light: '#944A00', dark: '#F0A35A' },
  /** Text and icons on a `brand` fill. */
  onBrand: { light: '#FFFFFF', dark: '#1C1917' },
  /** A tinted brand background (selected chip, tinted button, hero wash). */
  brandTint: { light: '#F6EADB', dark: '#3A2A1B' },
  /** Done, saved, on track. */
  positive: { light: '#2D7A4B', dark: '#6BCB93' },
  /** Over target, needs a look. Amber, never red (F8). */
  attention: { light: '#A85100', dark: '#F2B05E' },
  /** Neutral information, links inside copy. */
  info: { light: '#1D5FD0', dark: '#86AEFF' },
  /** Destructive actions only. */
  danger: { light: '#C62828', dark: '#FF8A80' },
} as const satisfies Record<string, Record<ColorScheme, `#${string}`>>;

export type ColorRole = keyof typeof colorRoles;

/** One scheme's flat role → hex map, for react-native-svg fills and icon tints. */
export function colorsFor(scheme: ColorScheme): Record<ColorRole, string> {
  return Object.fromEntries(
    Object.entries(colorRoles).map(([role, value]) => [role, value[scheme]]),
  ) as Record<ColorRole, string>;
}

/** `#RRGGBB` → `"r g b"`, the form global.css stores so Tailwind can add alpha. */
export function hexToRgbTriplet(hex: string): string {
  const n = Number.parseInt(hex.slice(1), 16);
  return `${(n >> 16) & 255} ${(n >> 8) & 255} ${n & 255}`;
}

/** kebab-case CSS variable name for a role: `labelSecondary` → `--label-secondary`. */
export function cssVarName(role: ColorRole): string {
  return `--${role.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`)}`;
}

function channel(c: number): number {
  const s = c / 255;
  return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
}

/** WCAG 2.x relative luminance of a `#RRGGBB` colour. */
export function relativeLuminance(hex: string): number {
  const n = Number.parseInt(hex.slice(1), 16);
  return (
    0.2126 * channel((n >> 16) & 255) + 0.7152 * channel((n >> 8) & 255) + 0.0722 * channel(n & 255)
  );
}

/** WCAG 2.x contrast ratio between two `#RRGGBB` colours (1–21). */
export function contrastRatio(a: string, b: string): number {
  const [hi, lo] = [relativeLuminance(a), relativeLuminance(b)].sort((x, y) => y - x) as [
    number,
    number,
  ];
  return (hi + 0.05) / (lo + 0.05);
}
