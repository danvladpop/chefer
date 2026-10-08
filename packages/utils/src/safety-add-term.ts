import { findSafetyTaxonomyEntry } from '@chefer/types';
import {
  BASE_DIET_IDS,
  classifySafetyValue,
  serialiseSafetyPickerValue,
  type BaseDietId,
  type SafetyPickerValue,
} from './safety-classify';
import {
  recognisedAddedText,
  recognisedDietSetText,
  recognisedModifierAddedText,
} from './safety-copy';
import { recogniseSafetyTerm } from './safety-recognise';

// "Something else?" resolution (UX-ACC-01) — the SafetyPicker's typed-term
// handling as one pure function, shared by the mobile and web pickers so the
// "+" button AND a host's Save/Continue (which must commit a term the user
// typed but never confirmed) take exactly the same path.

export type SafetyTermOutcome =
  | { status: 'empty' }
  /** Recognised: `value` already includes the term; `message` is the read-back line. */
  | { status: 'applied'; value: SafetyPickerValue; message: string }
  /** Not recognised (or a condition with no diet mapping): the user must choose what to do. */
  | { status: 'needs-decision'; variant: 'unrecognised' | 'condition'; term: string };

function labelFor(id: string): string {
  return findSafetyTaxonomyEntry(id)?.label ?? id;
}

const unique = (ids: readonly string[]): string[] => [...new Set(ids)];

/** Applies one typed "Something else?" term to a picker value. */
export function applySafetyTerm(value: SafetyPickerValue, rawTerm: string): SafetyTermOutcome {
  const term = rawTerm.trim();
  if (!term) return { status: 'empty' };
  const classified = classifySafetyValue(value);
  const recognised = recogniseSafetyTerm(term);
  const done = (patch: Partial<typeof classified>, message: string): SafetyTermOutcome => ({
    status: 'applied',
    value: serialiseSafetyPickerValue({ ...classified, ...patch }),
    message,
  });

  if (recognised.kind === 'unrecognised') {
    return { status: 'needs-decision', variant: 'unrecognised', term };
  }
  if (recognised.kind === 'condition') {
    if (!recognised.impliesDietId) {
      return { status: 'needs-decision', variant: 'condition', term };
    }
    return done(
      { dietModifierIds: unique([...classified.dietModifierIds, recognised.impliesDietId]) },
      recognisedDietSetText(labelFor(recognised.impliesDietId)),
    );
  }
  if (recognised.kind === 'allergy') {
    return done(
      { allergyIds: unique([...classified.allergyIds, recognised.id]) },
      recognisedAddedText('Allergies', recognised.label),
    );
  }
  if (recognised.kind === 'dislike') {
    return done(
      { dislikeIds: unique([...classified.dislikeIds, recognised.id]) },
      recognisedAddedText('Won’t eat', recognised.label),
    );
  }
  // kind === 'diet': a bare "no eggs"-family term never silently makes a
  // meat-eater vegetarian (AC2). With a Vegetarian base already chosen it
  // sets "Vegetarian, no eggs"; otherwise it only adds the Egg-free modifier.
  if (
    recognised.id === 'vegetarian-no-eggs' &&
    classified.dietBaseId !== 'vegetarian' &&
    classified.dietBaseId !== 'vegetarian-no-eggs'
  ) {
    return done(
      { dietModifierIds: unique([...classified.dietModifierIds, 'egg-free']) },
      recognisedModifierAddedText('Egg-free'),
    );
  }
  if ((BASE_DIET_IDS as readonly string[]).includes(recognised.id)) {
    return done(
      { dietBaseId: recognised.id as BaseDietId },
      recognisedDietSetText(recognised.label),
    );
  }
  return done(
    { dietModifierIds: unique([...classified.dietModifierIds, recognised.id]) },
    recognisedModifierAddedText(recognised.label),
  );
}

/** Keeps an unrecognised term as a literal note (still matched by the server filter). */
export function keepSafetyTermAsNote(value: SafetyPickerValue, term: string): SafetyPickerValue {
  const classified = classifySafetyValue(value);
  return serialiseSafetyPickerValue({ ...classified, notes: [...classified.notes, term] });
}
