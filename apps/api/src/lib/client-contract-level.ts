import { TRAINER_MODE_API_LEVEL } from '@chefer/types';

// ─── The contract level a response is shaped for ──────────────────────────────
// Mobile bundles in the field send `x-chefer-api-level` and must never meet a
// field or notice kind they cannot render, so the RAW header level gates new
// additive shapes. The web app is redeployed with the API and always renders
// the current contract, whatever level its header says (it sends 6): it is
// treated as current.

type LevelContext = { isMobileClient: boolean; clientApiLevel: number };

/** The raw header level for a mobile bundle; Infinity for web. */
export function contractLevelOf(ctx: LevelContext): number {
  return ctx.isMobileClient ? ctx.clientApiLevel : Number.POSITIVE_INFINITY;
}

/** Trainer mode M3 (bookings, coached workouts): `TRAINER_MODE_API_LEVEL` or web. */
export function understandsTrainerMode(ctx: LevelContext): boolean {
  return contractLevelOf(ctx) >= TRAINER_MODE_API_LEVEL;
}
