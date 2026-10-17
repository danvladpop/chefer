import { aiUsageRepository, recipeImageRepository, type BackfillCandidate } from '@chefer/database';
import { runWithAiUsageScope } from '../lib/ai/call-context.js';
import {
  CF_FREE_NEURONS_PER_DAY,
  cloudflareNeuronLedger,
  imageNeuronEstimate,
} from '../lib/ai/cloudflare-budget.js';
import { env } from '../lib/env.js';
import {
  generateAndUploadRecipeImage,
  ImagenRateLimitError,
  ImageQuotaExhaustedError,
  ImageStorageError,
  probeRecipeImageStorage,
  type RecipeImageInput,
} from '../lib/image-gen/index.js';
import { logger } from '../lib/logger.js';

export type { BackfillCandidate };

// ─── Recipe image backfill (F3, 2026-10-17) ───────────────────────────────────
// Until 2026-10-17 a recipe whose image could not be generated got a free
// Pollinations URL (512×384, smeared). This worker replaces those, one image
// per tick, with a Cloudflare image (CF_IMAGE_MODEL, 4:3):
//   - it re-reads the remaining Pollinations URLs every tick, so a restart or
//     a partial run just carries on (idempotent: a URL that is gone is done);
//   - one generation per distinct URL: the URL is deterministic per dish, so
//     every row holding it (name reuse, copies) gets the same new image;
//   - order (owner, 2026-10-17): recipes on a current or upcoming plan, then
//     favourites, then the curated pool, then the rest, newest first;
//   - budget (owner, 2026-10-17): at most RECIPE_IMAGE_BACKFILL_DAILY_MAX images
//     per UTC day, counted from stored AI usage (workload recipeImageBackfill)
//     so a restart cannot reset it, and never into the last
//     RECIPE_IMAGE_BACKFILL_RESERVE_NEURONS of Cloudflare's free daily neurons,
//     which stay for user-triggered images;
//   - it runs only with IMAGE_PROVIDER=cloudflare; RECIPE_IMAGE_BACKFILL=false
//     is the kill switch.
// The old image stays until its replacement is stored.

const TICK_INTERVAL_MS = 10 * 60 * 1000;
const FIRST_RUN_DELAY_MS = 2 * 60 * 1000;
/** A dish that fails this often in one process is skipped until the next restart. */
const MAX_FAILURES = 3;
/** The usage-row workload that counts backfill images (usage-recorder.ts). */
export const BACKFILL_WORKLOAD = 'recipeImageBackfill';

export interface RecipeImageBackfillConfig {
  enabled: boolean;
  provider: string;
  dailyMax: number;
  reserveNeurons: number;
  neuronsPerImage: number;
}

export interface RecipeImageBackfillDeps {
  findCandidates: (limit: number, excludeUrls: string[]) => Promise<BackfillCandidate[]>;
  countRemaining: () => Promise<number>;
  replaceImageUrl: (oldUrl: string, newUrl: string) => Promise<number>;
  /** Backfill images made since `since` (stored, so it survives a restart). */
  backfilledSince: (since: Date) => Promise<number>;
  generate: (input: RecipeImageInput) => Promise<string>;
  /** Today's Workers AI neurons, text and images (in memory). */
  neuronsUsedToday: () => number;
  /** Null when the image store is writable, else why not. */
  probeStorage: () => Promise<string | null>;
  config: () => RecipeImageBackfillConfig;
}

function defaultDeps(): RecipeImageBackfillDeps {
  return {
    findCandidates: (limit, exclude) =>
      recipeImageRepository.findBackfillCandidates(limit, exclude),
    countRemaining: () => recipeImageRepository.countPollinationsImages(),
    replaceImageUrl: (oldUrl, newUrl) => recipeImageRepository.replaceImageUrl(oldUrl, newUrl),
    backfilledSince: (since) => aiUsageRepository.countSince(since, BACKFILL_WORKLOAD),
    generate: (input) =>
      runWithAiUsageScope({ billedUserId: null, workload: BACKFILL_WORKLOAD }, () =>
        generateAndUploadRecipeImage(input),
      ),
    neuronsUsedToday: () => cloudflareNeuronLedger.usedToday(),
    probeStorage: probeRecipeImageStorage,
    config: () => ({
      enabled: env.RECIPE_IMAGE_BACKFILL,
      provider: env.IMAGE_PROVIDER,
      dailyMax: env.RECIPE_IMAGE_BACKFILL_DAILY_MAX,
      reserveNeurons: env.RECIPE_IMAGE_BACKFILL_RESERVE_NEURONS,
      neuronsPerImage: imageNeuronEstimate(env.CF_IMAGE_MODEL),
    }),
  };
}

/** "2026-10-17" — Cloudflare's free allocation resets at 00:00 UTC. */
function utcDay(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function startOfUtcDay(d: Date): Date {
  return new Date(`${utcDay(d)}T00:00:00Z`);
}

export class RecipeImageBackfillWorker {
  private timer: NodeJS.Timeout | null = null;
  private firstRun: NodeJS.Timeout | null = null;
  private running = false;
  private inFlight: Promise<void> | null = null; // for graceful shutdown
  /** UTC day the backfill paused on (quota used up, or a store failure). */
  private pausedDay: string | null = null;
  private readonly failures = new Map<string, number>();
  private finishedLogged = false;
  private readonly overrides: Partial<RecipeImageBackfillDeps>;

  constructor(deps: Partial<RecipeImageBackfillDeps> = {}) {
    this.overrides = deps;
  }

  /** Resolved per tick, so env is only read once the worker actually runs. */
  private get deps(): RecipeImageBackfillDeps {
    return { ...defaultDeps(), ...this.overrides };
  }

  start(): void {
    if (this.timer) return;
    const { enabled, provider } = this.deps.config();
    if (!enabled || provider !== 'cloudflare') {
      logger.info({ enabled, provider }, 'recipeImages.backfill.off');
      return;
    }
    console.log('[RecipeImageBackfillWorker] started (one image per 10 min tick)');
    this.timer = setInterval(() => void this.tick(), TICK_INTERVAL_MS);
    this.firstRun = setTimeout(() => void this.tick(), FIRST_RUN_DELAY_MS);
  }

  /** Waits for an image being made, so a deploy never throws away a paid generation. */
  async stop(): Promise<void> {
    if (this.timer) clearInterval(this.timer);
    if (this.firstRun) clearTimeout(this.firstRun);
    this.timer = null;
    this.firstRun = null;
    await this.inFlight;
  }

  /** One pass: replaces at most one Pollinations image (public for tests). */
  async tick(now: Date = new Date()): Promise<void> {
    if (this.running) return;
    this.running = true;
    try {
      this.inFlight = this.runOnce(now);
      await this.inFlight;
    } catch (err) {
      logger.error({ err }, 'recipeImages.backfill.error');
    } finally {
      this.inFlight = null;
      this.running = false;
    }
  }

  private async runOnce(now: Date): Promise<void> {
    const deps = this.deps;
    const config = deps.config();
    if (!config.enabled || config.provider !== 'cloudflare') return;
    const today = utcDay(now);
    if (this.pausedDay === today) return;

    const doneToday = await deps.backfilledSince(startOfUtcDay(now));
    if (doneToday >= config.dailyMax) return;
    const ceiling = CF_FREE_NEURONS_PER_DAY - config.reserveNeurons;
    if (deps.neuronsUsedToday() + config.neuronsPerImage > ceiling) return;

    const skipped = [...this.failures].filter(([, n]) => n >= MAX_FAILURES).map(([url]) => url);
    const [next] = await deps.findCandidates(1, skipped);
    if (!next) {
      if (!this.finishedLogged)
        logger.info({ skipped: skipped.length }, 'recipeImages.backfill.done');
      this.finishedLogged = true;
      return;
    }
    this.finishedLogged = false;

    const storageProblem = await deps.probeStorage();
    if (storageProblem) {
      logger.warn({ storageProblem }, 'recipeImages.backfill.storageNotWritable');
      return;
    }

    let newUrl: string;
    try {
      newUrl = await deps.generate({
        recipeId: next.recipeId,
        recipeName: next.name,
        cuisineType: next.cuisineType,
      });
    } catch (err) {
      this.handleFailure(err, next, today);
      return;
    }

    const replaced = await deps.replaceImageUrl(next.imageUrl, newUrl);
    this.failures.delete(next.imageUrl);
    logger.info(
      {
        recipeId: next.recipeId,
        name: next.name,
        replaced,
        today: doneToday + 1,
        remaining: await deps.countRemaining(),
      },
      'recipeImages.backfill',
    );
  }

  private handleFailure(err: unknown, next: BackfillCandidate, today: string): void {
    if (err instanceof ImagenRateLimitError) {
      logger.warn({ recipeId: next.recipeId }, 'recipeImages.backfill.rateLimited');
      return;
    }
    if (err instanceof ImageQuotaExhaustedError || err instanceof ImageStorageError) {
      // Quota: nothing more today. Store: the image was paid for and lost —
      // don't pay again until tomorrow (the probe covers the usual cause).
      this.pausedDay = today;
      logger.warn({ err: err.message }, 'recipeImages.backfill.pausedForToday');
      return;
    }
    const count = (this.failures.get(next.imageUrl) ?? 0) + 1;
    this.failures.set(next.imageUrl, count);
    logger.warn(
      { recipeId: next.recipeId, attempt: count, err: (err as Error).message },
      'recipeImages.backfill.failed',
    );
  }
}

export const recipeImageBackfillWorker = new RecipeImageBackfillWorker();
