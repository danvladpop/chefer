import { prisma } from '@chefer/database';
import { isValidTimeZone, todayIn } from '@chefer/utils';
import { gymExportService } from '../gym/gym-export.service.js';
import { collectAccountData } from './account-data.service.js';
import { archiveFilename, buildArchive } from './export-archive.js';

// ─── user.exportArchive (G1) ──────────────────────────────────────────────────
// Gathers the data and hands it to the pure ZIP builder (export-archive.ts).
// Built synchronously: a heavy account (3 years of daily logs, 600 workouts)
// zips in well under a second and a few hundred KB (export-archive.test.ts
// measures it), so a background job and a "we'll email you" step would only
// add a failure mode. Revisit if an export ever passes ~10 MB.

export type ExportArchiveResult = {
  filename: string;
  /** The ZIP, base64 — tRPC carries JSON, and both clients write bytes from it. */
  base64: string;
  bytes: number;
};

const zoneOf = (zone: string | null | undefined): string =>
  zone && isValidTimeZone(zone) ? zone : 'UTC';

/** Every recipe id that plans and logs point at (they store ids only). */
function referencedRecipeIds(data: Awaited<ReturnType<typeof collectAccountData>>): string[] {
  const ids = new Set<string>();
  const collect = (entries: unknown) => {
    if (!Array.isArray(entries)) return;
    for (const e of entries) {
      const id = (e as { recipeId?: unknown } | null)?.recipeId;
      if (typeof id === 'string') ids.add(id);
    }
  };
  for (const log of data.food.dailyLogs) collect(log.loggedMeals);
  for (const plan of data.food.mealPlans) for (const day of plan.days) collect(day.meals);
  collect(data.progress.cookLogs);
  return [...ids];
}

/**
 * `localDate`: the device's `YYYY-MM-DD`, for the filename. Older callers
 * omit it; then the user's saved time zone decides the day (UTC without one).
 */
export async function buildExportArchive(
  userId: string,
  localDate?: string,
): Promise<ExportArchiveResult> {
  const [data, workouts] = await Promise.all([
    collectAccountData(userId),
    gymExportService.exportCsv(userId),
  ]);
  const recipes = await prisma.recipe.findMany({
    where: { id: { in: referencedRecipeIds(data) } },
    select: { id: true, name: true },
  });
  const zip = buildArchive(data, {
    recipeNames: new Map(recipes.map((r) => [r.id, r.name])),
    workoutsCsv: workouts.csv,
  });
  return {
    filename: archiveFilename(localDate ?? todayIn(zoneOf(data.food.chefProfile?.timeZone))),
    base64: Buffer.from(zip).toString('base64'),
    bytes: zip.byteLength,
  };
}
