// ─── Refuel snacks (§2.6, T-06.3) ───────────────────────────────────────────────
// A small curated list of high-protein snacks shown on the gym summary screen
// after a workout. Filtered server-side by the one safety filter (§2.1)
// before it reaches a client — this module only owns the curated data + a
// pure pick, never the filtering.

export interface ProteinSnack {
  id: string;
  name: string;
  proteinG: number;
  kcal: number;
  carbsG: number;
  fatG: number;
}

export const PROTEIN_SNACKS: readonly ProteinSnack[] = [
  {
    id: 'greek-yogurt',
    name: 'Greek yogurt with honey',
    proteinG: 17,
    kcal: 150,
    carbsG: 12,
    fatG: 4,
  },
  {
    id: 'cottage-cheese',
    name: 'Cottage cheese with fruit',
    proteinG: 14,
    kcal: 140,
    carbsG: 10,
    fatG: 5,
  },
  { id: 'protein-shake', name: 'Protein shake', proteinG: 24, kcal: 130, carbsG: 4, fatG: 2 },
  { id: 'boiled-eggs', name: 'Two boiled eggs', proteinG: 13, kcal: 155, carbsG: 1, fatG: 11 },
  {
    id: 'turkey-wrap',
    name: 'Turkey slices in a wrap',
    proteinG: 18,
    kcal: 210,
    carbsG: 20,
    fatG: 6,
  },
  { id: 'edamame', name: 'Edamame', proteinG: 11, kcal: 120, carbsG: 10, fatG: 5 },
] as const;

/** The first `count` curated snacks (a stable, deterministic pick for now). */
export function pickProteinSnacks(count = 3): ProteinSnack[] {
  return PROTEIN_SNACKS.slice(0, Math.max(0, count));
}
