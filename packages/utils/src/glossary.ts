// ─── Glossary (T-00.5, PAT-7) ───────────────────────────────────────────────────
// Plain-English definitions for jargon the app uses (RIR, deload, macros…).
// `GlossaryTerm` (packages/ui-mobile) renders one of these inline; both
// platforms share the same wording so the same word never means two things.

export interface GlossaryDefinition {
  term: string;
  /** One or two short sentences, no jargon, no medical claims. */
  definition: string;
}

export const GLOSSARY: Readonly<Record<string, GlossaryDefinition>> = {
  rir: {
    term: 'RIR',
    definition:
      'Reps in reserve — how many more reps you think you could have done before failure. RIR 2 means you stopped with about 2 good reps left in the tank.',
  },
  deload: {
    term: 'Deload',
    definition:
      'A planned lighter week (less weight or fewer sets) so your body can recover before the next push.',
  },
  e1rm: {
    term: 'Estimated 1RM',
    definition:
      'Your estimated one-rep max — the heaviest single rep the app thinks you could lift right now, worked out from your recent sets.',
  },
  macros: {
    term: 'Macros',
    definition:
      'Protein, carbs and fat — the three nutrients your daily calorie target is split across.',
  },
  cookingFor: {
    term: 'Cooking for',
    definition: 'How many people a recipe or shopping list is sized for.',
  },
  superset: {
    term: 'Superset',
    definition: 'Two or more exercises done back-to-back with no rest in between.',
  },
  trainingDay: {
    term: 'Training day',
    definition: 'A day with a scheduled or completed workout — your targets can adjust for it.',
  },
  // T-05.5 additions (gym vocabulary that shows up in workout copy).
  amrap: {
    term: 'AMRAP',
    definition: 'As many reps as possible — do reps to a hard stop instead of a fixed count.',
  },
  workingSet: {
    term: 'Working set',
    definition:
      "A set that counts toward your target — as opposed to a warm-up set, which just prepares the muscle and doesn't count toward progress.",
  },
  warmUpSet: {
    term: 'Warm-up set',
    definition:
      'A lighter set before your working sets, to prepare the muscle and joints. It never counts toward your target or your progress.',
  },
  tempo: {
    term: 'Tempo',
    definition: 'How fast you move through a rep — a slower lowering phase adds extra work.',
  },
  calibrating: {
    term: 'Calibrating',
    definition:
      "We're still learning your working weight for this exercise from how your last few sets felt, before we start nudging it up on our own.",
  },
} as const;

export type GlossaryTermId = keyof typeof GLOSSARY;

/** The definition for a glossary term id, or null when it isn't in the glossary. */
export function glossaryDefinition(id: string): GlossaryDefinition | null {
  return (GLOSSARY as Record<string, GlossaryDefinition>)[id] ?? null;
}
