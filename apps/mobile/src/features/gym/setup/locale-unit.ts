import type { WeightUnit } from '@chefer/types';

// Setup step 3 defaults the weight unit from the device locale (gym_plan.md
// §1.3) without a new native dependency: the standard Intl APIs (shipped in
// Hermes) are enough to read the region, no expo-localization needed —
// dependency lists are frozen after wave 0 (gym_plan.md §9.2).

const IMPERIAL_REGIONS = new Set(['US', 'LR', 'MM']);

function regionFromLocale(locale: string): string | null {
  try {
    // Intl.Locale is well-supported by Hermes on Expo SDK 57, but typings can
    // lag runtime support on some TS/lib configs.
    const region = new Intl.Locale(locale).maximize().region;
    if (typeof region === 'string' && region.length > 0) return region;
  } catch {
    // fall through to a manual parse of the BCP-47 tag
  }
  const match = /-([A-Z]{2})(?:-|$)/.exec(locale.toUpperCase());
  return match?.[1] ?? null;
}

/** kg everywhere except the US, Liberia and Myanmar (the world's non-metric holdouts). */
export function defaultUnitFromLocale(): WeightUnit {
  try {
    const locale = Intl.NumberFormat().resolvedOptions().locale;
    const region = regionFromLocale(locale);
    return region !== null && IMPERIAL_REGIONS.has(region) ? 'LB' : 'KG';
  } catch {
    return 'KG';
  }
}
