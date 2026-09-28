import { findSafetyTaxonomyEntry } from '@chefer/types';
import { recogniseSafetyTerm } from './safety-recognise';

// ─── SafetyPicker classification (T-01.7) ──────────────────────────────────────
// Turns the flat storage contract (`dietaryRestrictions/allergies/
// dislikedIngredients: string[]`, unchanged since before this feature) into
// the SafetyPicker's three chip groups + kept notes, so mobile and web read
// back an identical UI from the same stored values (Shared-first). Mirrors
// the bucketing `classifyPerson` does server-side
// (`apps/api/src/application/safety/safety.service.ts`) — kept as one
// function so the two never drift.

export interface SafetyPickerValue {
  dietaryRestrictions: string[];
  allergies: string[];
  dislikedIngredients: string[];
}

/** The base diets in the picker's single-choice radio group, in display order. */
export const BASE_DIET_IDS = ['vegetarian', 'vegetarian-no-eggs', 'vegan', 'pescatarian'] as const;
export type BaseDietId = (typeof BASE_DIET_IDS)[number];

/** The "Also:" multi-select diet modifiers, in display order. */
export const DIET_MODIFIER_IDS = [
  'gluten-free-coeliac',
  'dairy-free',
  'egg-free',
  'keto',
  'paleo',
] as const;
export type DietModifierId = (typeof DIET_MODIFIER_IDS)[number];

export interface ClassifiedSafetyValue {
  /** Taxonomy ids of selected allergies. */
  allergyIds: string[];
  /** The single selected base diet, or null for "No restriction". */
  dietBaseId: BaseDietId | null;
  /**
   * Every other selected diet-group id — the picker's "Also:" row only
   * offers `DIET_MODIFIER_IDS`, but a stored id outside that list (e.g. a
   * bare `gluten-free`, from an older save) is kept here rather than
   * silently dropped (C5e) even though no chip in this picker renders it.
   */
  dietModifierIds: string[];
  /** Taxonomy ids of selected "Won't eat" categories. */
  dislikeIds: string[];
  /**
   * Stored terms the recogniser could not map to a picker chip — kept
   * exactly as typed (never dropped) and still matched literally by the
   * server filter (C5e). Includes a legacy health-condition string with no
   * automatic diet mapping (only coeliac has one).
   */
  notes: string[];
}

/** Buckets one stored array (with its recognition fallback kind) into ids + notes. */
function bucketTerms(
  terms: readonly string[],
  fallbackKind: 'allergy' | 'diet' | 'dislike',
): { ids: string[]; notes: string[]; dietImpliedIds: string[] } {
  const ids: string[] = [];
  const notes: string[] = [];
  const dietImpliedIds: string[] = [];
  for (const term of terms) {
    const recognised = recogniseSafetyTerm(term);
    if (recognised.kind === 'unrecognised') {
      notes.push(term);
      continue;
    }
    if (recognised.kind === 'condition') {
      if (recognised.impliesDietId) {
        dietImpliedIds.push(recognised.impliesDietId);
      } else {
        notes.push(term);
      }
      continue;
    }
    if (
      recognised.kind === fallbackKind ||
      recognised.kind === 'allergy' ||
      recognised.kind === 'dislike'
    ) {
      ids.push(recognised.id);
    } else {
      // A diet-group id recognised out of an allergy/dislike list (or vice
      // versa) — keep it findable rather than silently dropping it.
      ids.push(recognised.id);
    }
  }
  return { ids, notes, dietImpliedIds };
}

export function classifySafetyValue(value: SafetyPickerValue): ClassifiedSafetyValue {
  const allergyBucket = bucketTerms(value.allergies, 'allergy');
  const dietBucket = bucketTerms(value.dietaryRestrictions, 'diet');
  const dislikeBucket = bucketTerms(value.dislikedIngredients, 'dislike');

  const dietIds = [...new Set([...dietBucket.ids, ...dietBucket.dietImpliedIds])];
  const dietBaseId = BASE_DIET_IDS.find((id) => dietIds.includes(id)) ?? null;
  const dietModifierIds = dietIds.filter((id) => id !== dietBaseId);

  return {
    allergyIds: [...new Set(allergyBucket.ids)],
    dietBaseId,
    dietModifierIds,
    dislikeIds: [...new Set(dislikeBucket.ids)],
    notes: [...allergyBucket.notes, ...dietBucket.notes, ...dislikeBucket.notes],
  };
}

function labelFor(id: string): string {
  return findSafetyTaxonomyEntry(id)?.label ?? id;
}

/**
 * The inverse of `classifySafetyValue` — writes the picker's chip state back
 * to the flat storage contract, canonical labels (new clients write labels
 * that match both literally and via the id, §2.1). Kept notes have no group
 * of their own in the picker's single "Something else" field, so they are
 * written to `dislikedIngredients` (the one array whose semantics — "leave
 * this out" — a literally-matched, uncategorised term already has).
 */
export function serialiseSafetyPickerValue(classified: ClassifiedSafetyValue): SafetyPickerValue {
  const dietaryRestrictions = [
    ...(classified.dietBaseId ? [labelFor(classified.dietBaseId)] : []),
    ...classified.dietModifierIds.map(labelFor),
  ];
  return {
    allergies: classified.allergyIds.map(labelFor),
    dietaryRestrictions,
    dislikedIngredients: [...classified.dislikeIds.map(labelFor), ...classified.notes],
  };
}
