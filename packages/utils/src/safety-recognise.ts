import { SAFETY_TAXONOMY, type SafetyTaxonomyGroup } from '@chefer/types';

// ─── Safety term recogniser (§2.1, T-01.1) ─────────────────────────────────────
// Shared by the API matcher and both clients: maps whatever free text a user
// (or an old binary) stored against a canonical taxonomy entry, in ADDITION
// to (never instead of) the literal-string match already applied server-side
// (C5e, "interpretation, not rewriting" — stored arrays are never rewritten).
// This is the "over-block until confirmed" rule of UX-01 (b) made permanent:
// unrecognised text is kept and flagged, never silently dropped.

export type SafetyRecogniseOutcome =
  | { kind: SafetyTaxonomyGroup; id: string; label: string; impliesDietId?: string }
  | { kind: 'unrecognised'; term: string };

/** Recognises a stored free-text term against the safety taxonomy (case/space-insensitive). */
export function recogniseSafetyTerm(term: string): SafetyRecogniseOutcome {
  const normalised = normalise(term);
  const entry = SAFETY_TAXONOMY.find(
    (e) => normalise(e.label) === normalised || e.synonyms.some((s) => normalise(s) === normalised),
  );
  if (!entry) return { kind: 'unrecognised', term };
  return {
    kind: entry.group,
    id: entry.id,
    label: entry.label,
    ...(entry.impliesDietId ? { impliesDietId: entry.impliesDietId } : {}),
  };
}

function normalise(value: string): string {
  return value.trim().toLowerCase();
}
