import type { GymOffer, GymOfferKind } from '@chefer/types';

// Contextual-card priority (gym_plan.md §1.3 "Contextual cards"): at most one
// offer shown at a time, on both platforms — a positive comeback message
// always outranks a deload nudge, which outranks a stall suggestion, which
// outranks the monthly recap. Shared so mobile and web never disagree about
// which one card to show (CLAUDE.md "shared-first").
const OFFER_PRIORITY: readonly GymOfferKind[] = ['comeback', 'deload', 'stall', 'recap'];

/** The single highest-priority offer to show, or null when there is none. */
export function pickOffer(offers: readonly GymOffer[]): GymOffer | null {
  for (const kind of OFFER_PRIORITY) {
    const found = offers.find((o) => o.kind === kind);
    if (found) return found;
  }
  return null;
}
