import { TRPCError } from '@trpc/server';
import { moderationRepository, prisma } from '@chefer/database';
import { moderationService } from '../application/friends/moderation.service.js';

// ─── Following: ops undo of one automatic moderation action (PRD §9.5) ────────
// Optional and owner-only — there is deliberately no API procedure, review
// screen or queue for this. Reverses ONE automatic action and writes an UNDO
// row (actor "ops") in the same transaction:
//
//   RECIPE_AUTO_HIDDEN      un-hide the recipe + discount its reports
//   ACCOUNT_FORCED_PRIVATE  clear forcedPrivateAt (visibility stays PRIVATE;
//                           the user may switch it) + discount every report
//                           about them
//   RECIPE_FILTER_HIDDEN    un-hide the recipe
//
// Discounted reports never count toward a threshold again. Find the log id in
// the moderation_log table (or the weekly metrics line's context).
//
//   cd apps/api
//   pnpm exec tsx --env-file=.env src/scripts/moderation-undo.ts --log=<id> [--dry-run]
//
// --dry-run prints the row and what the undo would do, and writes nothing.

async function main(): Promise<void> {
  const flags = process.argv.slice(2);
  const logId = flags
    .find((f) => f.startsWith('--log='))
    ?.slice('--log='.length)
    .trim();
  const dryRun = flags.includes('--dry-run');
  if (!logId) {
    console.error('Usage: moderation-undo.ts --log=<moderation log id> [--dry-run]');
    process.exitCode = 1;
    return;
  }

  const row = await moderationRepository.find(logId);
  if (row) {
    console.log(
      `Log ${row.id}: ${row.action} on user ${row.targetUserId}${row.recipeId ? `, recipe ${row.recipeId}` : ''} — "${row.reason}" (${row.actor}, ${row.createdAt.toISOString()})`,
    );
  }

  try {
    const result = await moderationService.undo(logId, { dryRun });
    console.log(
      dryRun
        ? `Dry run — nothing written. Would: ${result.detail?.replace(/^would /, '') ?? 'undo it'}`
        : `Undone: ${result.detail ?? result.action}. UNDO row ${result.undoLogId}.`,
    );
  } catch (err) {
    if (err instanceof TRPCError) {
      console.error(`Not undone: ${err.message}`);
      process.exitCode = 1;
      return;
    }
    throw err;
  }
}

main()
  .catch((err: unknown) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => void prisma.$disconnect());
