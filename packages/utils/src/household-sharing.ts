// ─── Household sharing helpers (ADR 0003) ─────────────────────────────────────
// Pure pieces the web and mobile join screens share.

const SMALL_PORTIONS: Record<number, string> = {
  0.25: 'a quarter portion',
  0.5: 'half a portion',
  0.75: 'three-quarters of a portion',
};

const PORTION_GLYPHS: Record<number, string> = {
  1.25: '1¼',
  1.5: '1½',
  1.75: '1¾',
  2: '2',
};

/**
 * The portion a member profile eats, as the words that fill
 * `HOUSEHOLD_SHARING_COPY.joinPortion` ("You eat {phrase} of each meal").
 */
export function householdPortionPhrase(portionFactor: number): string {
  if (portionFactor === 1) return 'a standard portion';
  if (portionFactor < 1) {
    return SMALL_PORTIONS[portionFactor] ?? `${portionFactor} of a portion`;
  }
  return `${PORTION_GLYPHS[portionFactor] ?? String(portionFactor)} portions`;
}

/**
 * The same choice as `householdPortionPhrase`, as data a translator can word:
 * the catalog keys `household.sharing.portion.<kind>` fill `{value}`.
 */
export type HouseholdPortionWords =
  | { kind: 'standard' | 'quarter' | 'half' | 'threeQuarters' }
  | { kind: 'fraction' | 'many'; value: string };

const SMALL_PORTION_KINDS: Record<number, 'quarter' | 'half' | 'threeQuarters'> = {
  0.25: 'quarter',
  0.5: 'half',
  0.75: 'threeQuarters',
};

export function householdPortionWords(portionFactor: number): HouseholdPortionWords {
  if (portionFactor === 1) return { kind: 'standard' };
  if (portionFactor < 1) {
    const kind = SMALL_PORTION_KINDS[portionFactor];
    return kind ? { kind } : { kind: 'fraction', value: String(portionFactor) };
  }
  return { kind: 'many', value: PORTION_GLYPHS[portionFactor] ?? String(portionFactor) };
}
