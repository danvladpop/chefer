import { prisma, progressSourceRepository, userRepository } from '@chefer/database';
import { progressBackfillService } from '../application/progress/progress-backfill.service.js';

// ─── Kitchen progress: back-date existing history (tech-plan.md §7) ───────────
// Turns each user's workouts, food log and checked shopping lists into ledger
// events (origin BACKFILL) with the SAME keys as the live hooks, so it can be
// re-run any number of times. A user's first `progress.summary` does the same
// lazily; this runs it ahead of time.
//
//   cd apps/api
//   pnpm exec tsx --env-file=.env src/scripts/progress-backfill.ts [--user=<email>] [--dry-run]
//
// --user=<email>  one account instead of everyone
// --dry-run       builds the events and prints the counts; writes nothing

async function main(): Promise<void> {
  const flags = process.argv.slice(2);
  const email = flags
    .find((f) => f.startsWith('--user='))
    ?.slice('--user='.length)
    .trim()
    .toLowerCase();
  const dryRun = flags.includes('--dry-run');

  let userIds: string[];
  if (email) {
    const user = await userRepository.findByEmail(email);
    if (!user) {
      console.error(`No account for ${email}.`);
      process.exitCode = 1;
      return;
    }
    userIds = [user.id];
  } else {
    userIds = await progressSourceRepository.userIds();
  }

  const prefix = dryRun ? 'Dry run: ' : '';
  console.log(`${prefix}back-dating ${userIds.length} account(s)…`);
  const totals = { users: 0, candidates: 0, inserted: 0, xp: 0, unlocks: 0, failed: 0 };
  for (const userId of userIds) {
    try {
      const res = await progressBackfillService.backfillUser(userId, { dryRun });
      totals.users += 1;
      totals.candidates += res.candidates;
      totals.inserted += res.inserted;
      totals.xp += res.xp;
      totals.unlocks += res.unlocks;
      if (res.candidates > 0) {
        console.log(
          `${userId}: ${res.candidates} candidates (${res.rawXp} raw XP)` +
            (dryRun ? '' : `, wrote ${res.inserted} rows, ${res.xp} XP, ${res.unlocks} badges`),
        );
      }
    } catch (err) {
      // One broken account must not stop the run: it is safe to re-run.
      totals.failed += 1;
      console.error(`${userId}: failed`, err);
    }
  }
  console.log(`${prefix}done.`, totals);
  if (totals.failed > 0) process.exitCode = 1;
}

main()
  .catch((err: unknown) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => void prisma.$disconnect());
