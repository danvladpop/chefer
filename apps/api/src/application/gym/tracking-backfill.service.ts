import { exerciseRepository } from '@chefer/database';

// ─── Exercise trackingType boot backfill (S18, T-42.0, Δ2.2) ──────────────────
// Customs with `isTimed: true` → `DURATION`; `loadType: BODYWEIGHT` →
// `BODYWEIGHT_REPS`. Curated rows are written by the catalogue sync
// (`ensureExerciseLibrary`, T-42.1) instead. Idempotent, same shape as
// `consentBackfillService`/`householdService.backfillLegacyServingSizes`:
// `exerciseRepository.findTrackingTypeBackfillCandidates` only matches rows
// still at the `trackingType` column default (`WEIGHT_REPS`), so once a row
// is written this boot's next pass — or a later boot — finds nothing left to
// do for it.

export class GymTrackingBackfillService {
  async backfillTrackingTypes(
    batchSize = 200,
  ): Promise<{ duration: number; bodyweightReps: number }> {
    let duration = 0;
    let bodyweightReps = 0;
    for (;;) {
      const candidates = await exerciseRepository.findTrackingTypeBackfillCandidates(batchSize);
      if (candidates.length === 0) break;

      // Safety valve: if a batch makes no progress, stop instead of looping
      // forever (the current WHERE clause can't produce this, but a future
      // change to it shouldn't be able to hang the boot sequence).
      let progressed = false;

      for (const candidate of candidates) {
        // isTimed wins when both signals are present (mirrors trackingTypeOf,
        // @chefer/utils gym/tracking.ts — kept independent here so this
        // package never needs a dependency on @chefer/utils).
        const trackingType = candidate.isTimed
          ? 'DURATION'
          : candidate.loadType === 'BODYWEIGHT'
            ? 'BODYWEIGHT_REPS'
            : null;
        // The WHERE clause behind findTrackingTypeBackfillCandidates already
        // guarantees one of the two above, but stay defensive against a
        // future loosening of that query.
        if (!trackingType) continue;

        await exerciseRepository.setTrackingType(candidate.id, trackingType);
        progressed = true;
        if (trackingType === 'DURATION') duration += 1;
        else bodyweightReps += 1;
      }

      if (!progressed) break;
    }
    return { duration, bodyweightReps };
  }
}

export const gymTrackingBackfillService = new GymTrackingBackfillService();
