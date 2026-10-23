// ADR 0002: a swap / replace / pin / remove aimed at a slot the other person
// changed first answers CONFLICT with `data.conflict.kind === 'mealSlot'`.

type MaybeConflictError = { data?: { conflict?: { kind?: string } | null } | null } | null;

export function isMealSlotConflict(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    (error as MaybeConflictError)?.data?.conflict?.kind === 'mealSlot'
  );
}

type MaybeHealthConsentError = { data?: { healthConsentRequired?: boolean } | null } | null;

/** T-26.3: the server refused a health write because consent is not on record. */
export function isHealthConsentRequired(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    (error as MaybeHealthConsentError)?.data?.healthConsentRequired === true
  );
}
