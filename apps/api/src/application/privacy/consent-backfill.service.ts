import { consentEventRepository, ConsentKind, userRepository } from '@chefer/database';

// ─── ConsentEvent boot backfill (§2.13, T-39.2/T-00.10) ────────────────────────
// A boot-time, idempotent job: every non-null `User.aiDataConsentAt` gets a
// `source: migration` AI ConsentEvent, so the log is the source of truth for
// consent from day one — even for users who granted it before the log
// existed. `User.aiDataConsentAt` stays as a cache for old clients; this job
// never touches it. Safe to run every boot: `existsForUserKindSource` skips
// anyone already backfilled.

export class ConsentBackfillService {
  async backfillAiConsentEvents(batchSize = 200): Promise<{ users: number; skipped: number }> {
    let users = 0;
    let skipped = 0;
    let skip = 0;
    for (;;) {
      const rows = await userRepository.findMany({
        where: { aiDataConsentAt: { not: null } },
        skip,
        take: batchSize,
        orderBy: { createdAt: 'asc' },
      });
      if (rows.length === 0) break;
      skip += rows.length;

      for (const user of rows) {
        // The query filters aiDataConsentAt: { not: null }, but the field
        // itself is nullable — skip defensively instead of asserting.
        if (!user.aiDataConsentAt) {
          skipped += 1;
          continue;
        }
        const already = await consentEventRepository.existsForUserKindSource(
          user.id,
          ConsentKind.AI,
          'migration',
        );
        if (already) {
          skipped += 1;
          continue;
        }
        await consentEventRepository.record({
          userId: user.id,
          kind: ConsentKind.AI,
          granted: true,
          source: 'migration',
          // The log must say WHEN consent was given, not when this boot job
          // happened to run.
          createdAt: user.aiDataConsentAt,
        });
        users += 1;
      }
    }
    return { users, skipped };
  }
}

export const consentBackfillService = new ConsentBackfillService();
