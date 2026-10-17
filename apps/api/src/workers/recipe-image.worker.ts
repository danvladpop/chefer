import { AiCallType, ImageStatus, prisma } from '@chefer/database';
import {
  generateAndUploadRecipeImage,
  ImagenContentFilterError,
  ImagenRateLimitError,
  ImageQuotaExhaustedError,
  ImageStorageError,
  probeRecipeImageStorage,
} from '../lib/image-gen/index.js';
import { onRecipeImageQueued } from '../lib/recipe-image-signal.js';
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

// ─── When generation can't happen (F3, 2026-10-17) ────────────────────────────
// No path writes a Pollinations URL any more (its 512×384 images looked
// smeared in the hero). A recipe waits in the queue instead, and clients show
// their placeholder until the real image lands:
//   - Cloudflare's daily free neurons are used up → back to PENDING, and the
//     queue is not drained again until the next UTC day (in memory);
//   - the image was generated but could not be STORED → back to PENDING, and
//     the queue waits until the store is writable (re-probed every minute);
//   - the last retry of any other failure, or a content-filter refusal →
//     FAILED ("Photo unavailable"); the next start re-queues FAILED rows that
//     have no image, so a fixed outage heals on the next deploy.
// Old Pollinations images are replaced by RecipeImageBackfillWorker.

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

    // Recipes that ended FAILED with no image get another go (same
    // discipline: never fatal).
    try {
      await this.requeueFailedImages();
    } catch (err) {
      console.warn('[RecipeImageWorker] FAILED-image re-queue skipped (database not ready):', err);
    }

    // Report an unwritable image store loudly BEFORE any image is paid for.
    await this.checkStorage();

    console.log(`[RecipeImageWorker] started (concurrency ${CONCURRENCY})`);
    onRecipeImageQueued(() => this.wake());
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
    onRecipeImageQueued(null);
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
   * Puts every `FAILED` recipe without an image back in the queue with fresh
   * retries — the recipes an outage left as "Photo unavailable". One guarded
   * updateMany, so a re-run changes nothing twice. Returns how many rows.
   */
  async requeueFailedImages(): Promise<number> {
    const { count } = await prisma.recipe.updateMany({
      where: { imageStatus: ImageStatus.FAILED, imageUrl: null },
      data: { imageStatus: ImageStatus.PENDING, imageRetries: 0 },
    });
    if (count > 0) console.log(`[RecipeImageWorker] re-queued ${count} FAILED recipe image(s)`);
    return count;
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
        // Recipes wait PENDING (placeholder) until generation can work again.
        if (this.quotaExhaustedToday() || !(await this.storageReady())) break;

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
          'Generated images cannot be saved, so generation is skipped and recipes wait in the ' +
          'queue until it is fixed. Usual cause: the uploads volume is owned by ' +
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

  /** Puts a claimed recipe back in the queue (no retry burned). */
  private async requeue(recipe: ClaimedRecipe, reason: string): Promise<void> {
    await prisma.recipe.update({
      where: { id: recipe.id },
      data: { imageStatus: ImageStatus.PENDING },
    });
    console.log(`[RecipeImageWorker] ↺ ${recipe.id} (${recipe.name}) waits: ${reason}`);
  }

  /** Marks a recipe FAILED ("Photo unavailable") and tells SSE clients. */
  private async fail(recipe: ClaimedRecipe): Promise<void> {
    await prisma.recipe.update({
      where: { id: recipe.id },
      data: { imageStatus: ImageStatus.FAILED },
    });
    recipeImageEventEmitter.emit(recipe.id, { imageUrl: null, status: 'FAILED' });
  }

  private async processOne(recipe: ClaimedRecipe): Promise<void> {
    if (this.quotaExhaustedToday()) {
      return this.requeue(recipe, 'Cloudflare daily free allocation used up');
    }
    if (!(await this.storageReady())) {
      return this.requeue(recipe, 'image storage not writable');
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
            `[RecipeImageWorker] Cloudflare daily free allocation used up — recipes wait until 00:00 UTC (${err.message})`,
          );
        }
        this.quotaExhaustedDay = utcDay(this.now());
        return this.requeue(recipe, 'Cloudflare daily free allocation used up');
      }

      if (err instanceof ImageStorageError) {
        // The image WAS generated (and paid for); regenerating now would fail
        // the same way. Stop generating until the store is writable again.
        this.markStorageBroken(err.message);
        return this.requeue(recipe, 'image storage failed');
      }

      if (err instanceof ImagenContentFilterError) {
        // Permanent failure — do not retry
        await this.fail(recipe);
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
          `[RecipeImageWorker] generation failed ${MAX_RETRIES} times: ${recipe.id}`,
          err,
        );
        await this.fail(recipe);
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
