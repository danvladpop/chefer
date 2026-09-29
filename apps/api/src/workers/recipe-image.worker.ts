import { AiCallType, ImageStatus, prisma } from '@chefer/database';
import {
  generateAndUploadRecipeImage,
  ImagenContentFilterError,
  ImagenRateLimitError,
  ImageQuotaExhaustedError,
  ImageStorageError,
  probeRecipeImageStorage,
  recipeImageFallbackUrl,
} from '../lib/image-gen/index.js';
import { recipeImageEventEmitter } from '../lib/sse/recipe-image-emitter.js';

const POLL_INTERVAL_MS = 5_000;
const MAX_RETRIES = 3;
// How many images generate in parallel. Pollinations' anonymous tier rate-limits
// aggressively (429 on concurrent generation requests) — 3 gives some overlap
// while the 429→rate-limit back-off (see image-gen/index.ts) absorbs rejections
// without burning retry budgets. 1-at-a-time made a full plan take 5-12 minutes.
const CONCURRENCY = 3;
// While the image store is known broken, re-probe it at most this often (an
// operator can fix the volume's ownership live, without a restart).
const STORAGE_REPROBE_MS = 60_000;
// Startup backfill of FAILED recipes: rows per batch, and a hard cap on
// batches so a pathological table can never stall boot.
const BACKFILL_BATCH = 100;
const BACKFILL_MAX_BATCHES = 50;

interface ClaimedRecipe {
  id: string;
  name: string;
  cuisineType: string;
  creatorId: string | null;
}

/** "2026-09-28" — Workers AI's free allocation resets at 00:00 UTC. */
function utcDay(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10);
}

// ─── Free fallback (prod incident 2026-09-28) ─────────────────────────────────
// Every path that used to end in FAILED ("Photo unavailable") now ends in the
// recipe's deterministic Pollinations URL with status DONE — free, keyless,
// and loaded by the client (NOT warmed here, so no 10–120 s wait):
//   - Cloudflare's daily free neurons are used up → fallback, and Cloudflare is
//     skipped for the rest of that UTC day (in memory) so the 429s stop and the
//     text fallback isn't raced for whatever is left;
//   - the image was generated but could not be STORED → fallback, never a
//     regeneration (that would pay again for an image that can't be saved);
//     while the store stays broken, generation is skipped entirely;
//   - the last retry of any other failure → fallback.
// ImagenContentFilterError alone stays FAILED: the prompt itself was refused,
// and the Pollinations URL is built from the same prompt. (No current provider
// raises it — only the retired Imagen client did.)

export class RecipeImageWorker {
  private timer: NodeJS.Timeout | null = null;
  private running = false;
  private rateLimitUntil = 0; // epoch ms — worker pauses if set
  private inFlight: Promise<void> | null = null; // for graceful shutdown
  /** UTC day Cloudflare reported its daily free allocation used up. */
  private quotaExhaustedDay: string | null = null;
  /** Why the image store can't be written (null = writable / not probed yet). */
  private storageProblem: string | null = null;
  private storageCheckedAt = 0;

  constructor(private readonly now: () => number = Date.now) {}

  async start(): Promise<void> {
    if (this.timer) return;

    // Recover any recipes left stuck in GENERATING from a previous crash.
    // Never let a DB hiccup here take down the API process: the server may boot
    // before the database is reachable/migrated (fresh deploy), and the global
    // unhandledRejection handler exits the process.
    try {
      const recovered = await prisma.recipe.updateMany({
        where: { imageStatus: ImageStatus.GENERATING },
        data: { imageStatus: ImageStatus.PENDING },
      });
      if (recovered.count > 0) {
        console.log(`[RecipeImageWorker] recovered ${recovered.count} stuck GENERATING recipes`);
      }
    } catch (err) {
      console.warn('[RecipeImageWorker] startup recovery skipped (database not ready):', err);
    }

    // Recipes that ended FAILED with no image get the free fallback (same
    // discipline: never fatal).
    try {
      await this.backfillFailedImages();
    } catch (err) {
      console.warn('[RecipeImageWorker] FAILED-image backfill skipped (database not ready):', err);
    }

    // Report an unwritable image store loudly BEFORE any image is paid for.
    await this.checkStorage();

    console.log(`[RecipeImageWorker] started (concurrency ${CONCURRENCY})`);
    this.timer = setInterval(() => {
      void this.tick();
    }, POLL_INTERVAL_MS);
    void this.tick();
  }

  /**
   * Triggers an immediate processing pass. Called by services right after they
   * enqueue new PENDING recipes so image generation starts with zero poll delay.
   * Safe to call at any time — no-op if a pass is already running.
   */
  wake(): void {
    void this.tick();
  }

  async stop(): Promise<void> {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
    // Wait for any in-flight generation to complete before the process exits
    if (this.inFlight) {
      console.log('[RecipeImageWorker] waiting for in-flight jobs to finish…');
      await this.inFlight;
    }
    console.log('[RecipeImageWorker] stopped');
  }

  /**
   * Gives every `FAILED` recipe without an image its deterministic Pollinations
   * URL and marks it DONE — the recipes a broken pipeline left as "Photo
   * unavailable". Bounded batches; idempotent (the per-row guard re-checks
   * FAILED + null, so a re-run or a concurrent instance changes nothing twice).
   * Returns how many rows were updated.
   */
  async backfillFailedImages(): Promise<number> {
    let total = 0;
    for (let batch = 0; batch < BACKFILL_MAX_BATCHES; batch++) {
      const rows = await prisma.recipe.findMany({
        where: { imageStatus: ImageStatus.FAILED, imageUrl: null },
        select: { id: true, name: true, cuisineType: true },
        orderBy: { id: 'asc' },
        take: BACKFILL_BATCH,
      });
      if (rows.length === 0) break;

      let updated = 0;
      for (const row of rows) {
        const res = await prisma.recipe.updateMany({
          where: { id: row.id, imageStatus: ImageStatus.FAILED, imageUrl: null },
          data: {
            imageUrl: recipeImageFallbackUrl(row.name, row.cuisineType),
            imageStatus: ImageStatus.DONE,
          },
        });
        updated += res.count;
      }
      total += updated;
      // A short batch was the last one; a batch that changed nothing would
      // only be re-read forever.
      if (rows.length < BACKFILL_BATCH || updated === 0) break;
    }
    if (total > 0) {
      console.log(
        `[RecipeImageWorker] backfilled ${total} FAILED recipe image(s) with the free Pollinations fallback`,
      );
    }
    return total;
  }

  /** One processing pass (public for tests; wake() and the poll call it). */
  async tick(): Promise<void> {
    if (this.running) return;
    if (this.now() < this.rateLimitUntil) return;

    this.running = true;
    try {
      // Drain the queue: keep claiming batches until nothing is PENDING or a
      // rate-limit back-off engages. The poll interval is only a discovery
      // fallback — a plan generation calls wake() and the whole queue drains here.
      for (;;) {
        if (this.now() < this.rateLimitUntil) break;

        const batch = await this.claimBatch();
        if (batch.length === 0) break;

        this.inFlight = this.processBatch(batch);
        await this.inFlight;
      }
    } catch (err) {
      console.error('[RecipeImageWorker] tick error', err);
    } finally {
      this.inFlight = null;
      this.running = false;
    }
  }

  /**
   * Atomically claims up to CONCURRENCY pending recipes, lowest imagePriority
   * first (0 = today's meals) so the images the user is looking at resolve first.
   * The per-row updateMany guard keeps this safe if the API is ever scaled
   * horizontally — a row claimed by another instance is simply skipped.
   */
  private async claimBatch(): Promise<ClaimedRecipe[]> {
    const candidates = await prisma.recipe.findMany({
      where: { imageStatus: ImageStatus.PENDING },
      select: { id: true, name: true, cuisineType: true, creatorId: true },
      orderBy: [{ imagePriority: 'asc' }, { createdAt: 'asc' }],
      take: CONCURRENCY,
    });

    const claimed: ClaimedRecipe[] = [];
    for (const recipe of candidates) {
      const res = await prisma.recipe.updateMany({
        where: { id: recipe.id, imageStatus: ImageStatus.PENDING },
        data: { imageStatus: ImageStatus.GENERATING },
      });
      if (res.count > 0) claimed.push(recipe);
    }
    return claimed;
  }

  private async processBatch(batch: ClaimedRecipe[]): Promise<void> {
    await Promise.allSettled(batch.map((recipe) => this.processOne(recipe)));
  }

  /**
   * Probes the image store; logs loudly on a new problem and on recovery.
   * Returns whether it is writable.
   */
  private async checkStorage(): Promise<boolean> {
    this.storageCheckedAt = this.now();
    let problem: string | null;
    try {
      problem = await probeRecipeImageStorage();
    } catch (err) {
      problem = `storage probe failed: ${(err as Error).message}`;
    }
    if (problem) {
      this.markStorageBroken(problem);
      return false;
    }
    if (this.storageProblem) {
      console.log('[RecipeImageWorker] image storage is writable again — generation resumes');
      this.storageProblem = null;
    }
    return true;
  }

  private markStorageBroken(problem: string): void {
    this.storageCheckedAt = this.now();
    if (this.storageProblem === null) {
      console.error(
        `[RecipeImageWorker] ✗ IMAGE STORAGE NOT WRITABLE — ${problem}. ` +
          'Generated images cannot be saved, so generation is skipped and recipes get the free ' +
          'Pollinations fallback until it is fixed. Usual cause: the uploads volume is owned by ' +
          'root — run `chown -R apiuser /app/uploads` in the api container (infrastructure.md §12).',
      );
    }
    this.storageProblem = problem;
  }

  /** False while the store is known broken (re-probed at most every minute). */
  private async storageReady(): Promise<boolean> {
    if (this.storageProblem === null) return true;
    if (this.now() - this.storageCheckedAt < STORAGE_REPROBE_MS) return false;
    return this.checkStorage();
  }

  private quotaExhaustedToday(): boolean {
    return this.quotaExhaustedDay === utcDay(this.now());
  }

  /** Sets the recipe's free Pollinations URL, status DONE, and tells SSE clients. */
  private async useFallback(recipe: ClaimedRecipe, reason: string): Promise<void> {
    const imageUrl = recipeImageFallbackUrl(recipe.name, recipe.cuisineType);
    await prisma.recipe.update({
      where: { id: recipe.id },
      data: { imageUrl, imageStatus: ImageStatus.DONE },
    });
    recipeImageEventEmitter.emit(recipe.id, { imageUrl, status: 'DONE' });
    console.log(`[RecipeImageWorker] ↪ ${recipe.id} (${recipe.name}) → Pollinations (${reason})`);
  }

  private async processOne(recipe: ClaimedRecipe): Promise<void> {
    if (this.quotaExhaustedToday()) {
      return this.useFallback(recipe, 'Cloudflare daily free allocation used up');
    }
    if (!(await this.storageReady())) {
      return this.useFallback(recipe, 'image storage not writable');
    }

    try {
      const cdnUrl = await generateAndUploadRecipeImage({
        recipeId: recipe.id,
        recipeName: recipe.name,
        cuisineType: recipe.cuisineType,
      });

      await prisma.recipe.update({
        where: { id: recipe.id },
        data: { imageUrl: cdnUrl, imageStatus: ImageStatus.DONE },
      });

      // Log image generation against the recipe's creator (if known)
      if (recipe.creatorId) {
        prisma.aiCallLog
          .create({ data: { userId: recipe.creatorId, callType: AiCallType.IMAGE_GENERATION } })
          .catch((err) => console.error('[aiCallLog] Failed to log IMAGE_GENERATION call:', err));
      }

      recipeImageEventEmitter.emit(recipe.id, { imageUrl: cdnUrl, status: 'DONE' });
      console.log(`[RecipeImageWorker] ✓ ${recipe.id} (${recipe.name})`);
    } catch (err) {
      if (err instanceof ImagenRateLimitError) {
        // Not a real failure — reset to PENDING and pause the worker
        this.rateLimitUntil = this.now() + err.retryAfterMs;
        await prisma.recipe.update({
          where: { id: recipe.id },
          data: { imageStatus: ImageStatus.PENDING },
        });
        console.warn(`[RecipeImageWorker] rate limited, pausing ${err.retryAfterMs}ms`);
        return;
      }

      if (err instanceof ImageQuotaExhaustedError) {
        if (!this.quotaExhaustedToday()) {
          console.warn(
            `[RecipeImageWorker] Cloudflare daily free allocation used up — Pollinations fallback until 00:00 UTC (${err.message})`,
          );
        }
        this.quotaExhaustedDay = utcDay(this.now());
        return this.useFallback(recipe, 'Cloudflare daily free allocation used up');
      }

      if (err instanceof ImageStorageError) {
        // The image WAS generated (and paid for); regenerating would fail the
        // same way. Never retry — fall back and stop generating until the
        // store is writable again.
        this.markStorageBroken(err.message);
        return this.useFallback(recipe, 'image storage failed');
      }

      if (err instanceof ImagenContentFilterError) {
        // Permanent failure — do not retry (see the fallback note above)
        await prisma.recipe.update({
          where: { id: recipe.id },
          data: { imageStatus: ImageStatus.FAILED },
        });
        recipeImageEventEmitter.emit(recipe.id, { imageUrl: null, status: 'FAILED' });
        console.warn(`[RecipeImageWorker] content filtered: ${recipe.id}`);
        return;
      }

      // Transient failure — increment retry counter
      const updated = await prisma.recipe.update({
        where: { id: recipe.id },
        data: { imageRetries: { increment: 1 } },
        select: { imageRetries: true },
      });

      if (updated.imageRetries >= MAX_RETRIES) {
        console.error(
          `[RecipeImageWorker] generation failed ${MAX_RETRIES} times, using the fallback: ${recipe.id}`,
          err,
        );
        await this.useFallback(recipe, `failed after ${MAX_RETRIES} attempts`);
      } else {
        await prisma.recipe.update({
          where: { id: recipe.id },
          data: { imageStatus: ImageStatus.PENDING },
        });
        console.warn(
          `[RecipeImageWorker] retrying (attempt ${updated.imageRetries}/${MAX_RETRIES}): ${recipe.id}`,
          err,
        );
      }
    }
  }
}

export const recipeImageWorker = new RecipeImageWorker();
