import { prisma, ImageStatus } from '@chefer/database';
import {
  generateAndUploadRecipeImage,
  ImagenRateLimitError,
  ImagenContentFilterError,
} from '../lib/image-gen/index.js';
import { recipeImageEventEmitter } from '../lib/sse/recipe-image-emitter.js';

const POLL_INTERVAL_MS = 5_000;
const MAX_RETRIES = 3;

export class RecipeImageWorker {
  private timer: NodeJS.Timeout | null = null;
  private running = false;
  private rateLimitUntil = 0; // epoch ms — worker pauses if set
  private inFlight: Promise<void> | null = null; // for graceful shutdown

  async start(): Promise<void> {
    if (this.timer) return;

    // Recover any recipes left stuck in GENERATING from a previous crash
    const recovered = await prisma.recipe.updateMany({
      where: { imageStatus: ImageStatus.GENERATING },
      data: { imageStatus: ImageStatus.PENDING },
    });
    if (recovered.count > 0) {
      console.log(`[RecipeImageWorker] recovered ${recovered.count} stuck GENERATING recipes`);
    }

    console.log('[RecipeImageWorker] started');
    this.timer = setInterval(() => {
      void this.tick();
    }, POLL_INTERVAL_MS);
    void this.tick();
  }

  async stop(): Promise<void> {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
    // Wait for any in-flight generation to complete before the process exits
    if (this.inFlight) {
      console.log('[RecipeImageWorker] waiting for in-flight job to finish…');
      await this.inFlight;
    }
    console.log('[RecipeImageWorker] stopped');
  }

  private async tick(): Promise<void> {
    if (this.running) return;

    // Honour rate-limit back-off
    if (Date.now() < this.rateLimitUntil) return;

    this.running = true;
    try {
      const recipe = await prisma.recipe.findFirst({
        where: { imageStatus: ImageStatus.PENDING },
        select: { id: true, name: true, cuisineType: true, description: true },
        orderBy: { createdAt: 'asc' },
      });

      if (!recipe) return;

      // Atomically claim the recipe to prevent another instance picking it up
      // (relevant if the API is ever horizontally scaled)
      const claimed = await prisma.recipe.updateMany({
        where: { id: recipe.id, imageStatus: ImageStatus.PENDING },
        data: { imageStatus: ImageStatus.GENERATING },
      });
      if (claimed.count === 0) return; // already claimed by another instance

      this.inFlight = this.processOne(recipe);
      await this.inFlight;
    } catch (err) {
      console.error('[RecipeImageWorker] tick error', err);
    } finally {
      this.inFlight = null;
      this.running = false;
    }
  }

  private async processOne(recipe: {
    id: string;
    name: string;
    cuisineType: string;
    description: string;
  }): Promise<void> {
    try {
      const cdnUrl = await generateAndUploadRecipeImage({
        recipeId: recipe.id,
        recipeName: recipe.name,
        cuisineType: recipe.cuisineType,
        description: recipe.description,
      });

      await prisma.recipe.update({
        where: { id: recipe.id },
        data: { imageUrl: cdnUrl, imageStatus: ImageStatus.DONE },
      });

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
