import { AiCallType, ImageStatus, prisma } from '@chefer/database';
import {
  generateAndUploadRecipeImage,
  ImagenContentFilterError,
  ImagenRateLimitError,
} from '../lib/image-gen/index.js';
import { recipeImageEventEmitter } from '../lib/sse/recipe-image-emitter.js';

const POLL_INTERVAL_MS = 5_000;
const MAX_RETRIES = 3;
// How many images generate in parallel. Pollinations' anonymous tier rate-limits
// aggressively (429 on concurrent generation requests) — 3 gives some overlap
// while the 429→rate-limit back-off (see image-gen/index.ts) absorbs rejections
// without burning retry budgets. 1-at-a-time made a full plan take 5-12 minutes.
const CONCURRENCY = 3;

interface ClaimedRecipe {
  id: string;
  name: string;
  cuisineType: string;
  creatorId: string | null;
}

export class RecipeImageWorker {
  private timer: NodeJS.Timeout | null = null;
  private running = false;
  private rateLimitUntil = 0; // epoch ms — worker pauses if set
  private inFlight: Promise<void> | null = null; // for graceful shutdown

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

  private async tick(): Promise<void> {
    if (this.running) return;
    if (Date.now() < this.rateLimitUntil) return;

    this.running = true;
    try {
      // Drain the queue: keep claiming batches until nothing is PENDING or a
      // rate-limit back-off engages. The poll interval is only a discovery
      // fallback — a plan generation calls wake() and the whole queue drains here.
      for (;;) {
        if (Date.now() < this.rateLimitUntil) break;

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

  private async processOne(recipe: ClaimedRecipe): Promise<void> {
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
        this.rateLimitUntil = Date.now() + err.retryAfterMs;
        await prisma.recipe.update({
          where: { id: recipe.id },
          data: { imageStatus: ImageStatus.PENDING },
        });
        console.warn(`[RecipeImageWorker] rate limited, pausing ${err.retryAfterMs}ms`);
        return;
      }

      if (err instanceof ImagenContentFilterError) {
        // Permanent failure — do not retry
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
        await prisma.recipe.update({
          where: { id: recipe.id },
          data: { imageStatus: ImageStatus.FAILED },
        });
        recipeImageEventEmitter.emit(recipe.id, { imageUrl: null, status: 'FAILED' });
        console.error(
          `[RecipeImageWorker] permanently failed after ${MAX_RETRIES} attempts: ${recipe.id}`,
          err,
        );
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
