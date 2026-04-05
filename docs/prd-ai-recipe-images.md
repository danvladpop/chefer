# PRD: AI-Generated Recipe Images — Async Background Pipeline

**Status:** Ready for implementation
**Date:** 2026-04-05
**Scope:** `apps/api`, `apps/web`, `packages/database`

---

## 1. Overview

### Problem

Recipe images are currently static Unsplash URLs chosen by keyword-matching the recipe name. Every recipe with the same keyword gets the same stock photo, which makes the UI feel generic and impersonal.

### Solution

When a recipe is created (via plan generation or swap), immediately set `imageStatus = PENDING` and `imageUrl = null`. A background worker polls for PENDING recipes, calls **Imagen 3** (via the Gemini API) to generate a food photo tailored to that exact recipe, uploads it to **Cloudinary**, and stores the resulting URL in the database. The frontend shows a shimmer animation for all PENDING/GENERATING recipes and switches to the real image the moment it arrives via **Server-Sent Events (SSE)**.

### Goals

- Every AI-generated recipe gets a unique, contextually relevant image.
- Plan generation and recipe swap remain fully synchronous — no waiting for images.
- The user sees progressive enhancement: shimmer → real image, no page reload.
- Only new recipes (created after this feature ships) go through the pipeline. Existing recipes with Unsplash URLs are left untouched.

### Non-Goals

- Retroactive image generation for existing recipes.
- User-uploaded images (separate feature).
- Image regeneration on demand.

---

## 2. Architecture Summary

```
Plan generate / Swap recipe
        │
        ▼
  Recipe upserted to DB
  imageUrl = null
  imageStatus = PENDING
        │
        ▼
  Background Worker (polling loop, runs inside API process)
  polls DB every 5 s for PENDING recipes — processes ONE at a time (rate-limit safe)
        │
        ├─► Imagen 3 (Gemini API, 30 s timeout) → generates food image bytes
        │
        ├─► Cloudinary SDK → uploads image → returns secure_url
        │
        └─► DB update: imageUrl = secure_url, imageStatus = DONE
                │
                ▼
          SSE EventEmitter notifies all authenticated subscribers for that recipeId
                │
                ▼
          Browser replaces shimmer with <img src={secure_url} />
          (with client-side timeout fallback after 3 min)
```

---

## 3. Technology Choices

| Concern          | Choice                                                       | Reason                                                         |
| ---------------- | ------------------------------------------------------------ | -------------------------------------------------------------- |
| Image generation | Imagen 3 (`imagen-3.0-generate-002`) via Gemini REST API     | Already integrated; 1,500 req/day free tier                    |
| Image hosting    | Cloudinary (free tier: 25 GB storage, 25 GB bandwidth/month) | Simple SDK, automatic CDN, no extra infra                      |
| Job queue        | DB polling (no Redis required)                               | Zero new infrastructure; fits current stack                    |
| Push to client   | Server-Sent Events over a plain Express endpoint             | Simpler than WebSocket; one-directional push fits the use case |

---

## 4. Phase 1 — Database Schema

### 4.1 Add `ImageStatus` enum

File: `packages/database/prisma/schema.prisma`

Add after the existing `RecipeSource` enum:

```prisma
enum ImageStatus {
  PENDING
  GENERATING
  DONE
  FAILED
}
```

### 4.2 Extend the `Recipe` model

Add two fields between `imageUrl` and `source`. **Do not add `imageJobId`** — it has no implementation use and would be dead code.

```prisma
model Recipe {
  // ... existing fields ...
  imageUrl       String?
  imageStatus    ImageStatus  @default(DONE)
  imageRetries   Int          @default(0)
  source         RecipeSource @default(AI)
  // ... rest unchanged ...
}
```

**`imageStatus` default is `DONE`** so all existing rows are never picked up by the worker.
**`imageRetries`** tracks how many times generation has been attempted, enabling retry-with-backoff logic (max 3 attempts before permanently marking as FAILED).

### 4.3 Migration

```bash
pnpm db:migrate   # creates migration: add_image_status_to_recipes
pnpm db:generate  # regenerates Prisma client
```

### 4.4 Export new types from `@chefer/database`

File: `packages/database/src/index.ts`

```ts
export { ImageStatus, RecipeSource /* … other enums */ } from '@prisma/client';
```

---

## 5. Phase 2 — Image Generation Service

### 5.1 Cloudinary client

New file: `apps/api/src/lib/image-cdn/cloudinary.ts`

Install: `pnpm --filter api add cloudinary`

```ts
import { v2 as cloudinary } from 'cloudinary';
import { env } from '../env';

cloudinary.config({
  cloud_name: env.CLOUDINARY_CLOUD_NAME,
  api_key: env.CLOUDINARY_API_KEY,
  api_secret: env.CLOUDINARY_API_SECRET,
});

/**
 * Uploads a base64-encoded image string to Cloudinary.
 * Uses recipeId as the stable public_id — repeated uploads are idempotent.
 * Returns the secure HTTPS CDN URL.
 */
export async function uploadRecipeImage(
  base64Image: string,
  mimeType: string,
  recipeId: string,
): Promise<string> {
  // Use the MIME type returned by Imagen (may be image/png or image/jpeg)
  const dataUri = `data:${mimeType};base64,${base64Image}`;

  const result = await cloudinary.uploader.upload(dataUri, {
    public_id: recipeId, // no 'recipes/' prefix — folder param handles it
    folder: 'chefer/recipes',
    overwrite: true,
    transformation: [
      { width: 800, height: 600, crop: 'fill', quality: 'auto', fetch_format: 'auto' },
    ],
  });

  return result.secure_url;
}
```

### 5.2 Imagen 3 client

New file: `apps/api/src/lib/image-gen/imagen.ts`

Key robustness requirements addressed here:

- **30-second `AbortController` timeout** — prevents the fetch from hanging indefinitely, which would trap the worker in the GENERATING state.
- **HTTP status code classification** — 429 (rate limit) is distinguished from permanent failures so the caller can decide whether to retry.

```ts
import { env } from '../env';

const IMAGEN_ENDPOINT =
  'https://generativelanguage.googleapis.com/v1beta/models/imagen-3.0-generate-002:predict';

const TIMEOUT_MS = 30_000;

export class ImagenRateLimitError extends Error {
  readonly retryAfterMs: number;
  constructor(retryAfterMs = 60_000) {
    super('Imagen rate limit exceeded');
    this.name = 'ImagenRateLimitError';
    this.retryAfterMs = retryAfterMs;
  }
}

export class ImagenContentFilterError extends Error {
  constructor() {
    super('Imagen blocked the prompt due to content policy');
    this.name = 'ImagenContentFilterError';
  }
}

export interface ImagenResult {
  base64: string;
  mimeType: string;
}

/**
 * Generates a food photograph using Imagen 3.
 * Throws ImagenRateLimitError on 429 (caller should not count this as a retry).
 * Throws ImagenContentFilterError on safety block (caller should mark FAILED immediately).
 * Throws generic Error on all other failures.
 */
export async function generateRecipeImage(prompt: string): Promise<ImagenResult> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), TIMEOUT_MS);

  let res: Response;
  try {
    res = await fetch(`${IMAGEN_ENDPOINT}?key=${env.GEMINI_API_KEY}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        instances: [{ prompt }],
        parameters: {
          sampleCount: 1,
          aspectRatio: '4:3',
          safetyFilterLevel: 'block_some',
          personGeneration: 'dont_allow',
        },
      }),
      signal: controller.signal,
    });
  } catch (err) {
    if ((err as Error).name === 'AbortError') {
      throw new Error(`Imagen API timed out after ${TIMEOUT_MS}ms`);
    }
    throw err;
  } finally {
    clearTimeout(timeoutId);
  }

  if (res.status === 429) {
    // Respect Retry-After header if present, otherwise default to 60 s
    const retryAfter = Number(res.headers.get('Retry-After') ?? '60') * 1000;
    throw new ImagenRateLimitError(retryAfter);
  }

  if (!res.ok) {
    const text = await res.text();
    // 400 with a safety-related message = content filter
    if (res.status === 400 && text.toLowerCase().includes('safety')) {
      throw new ImagenContentFilterError();
    }
    throw new Error(`Imagen API error ${res.status}: ${text}`);
  }

  const json = (await res.json()) as {
    predictions: Array<{ bytesBase64Encoded: string; mimeType?: string }>;
  };

  const prediction = json.predictions[0];
  if (!prediction?.bytesBase64Encoded) {
    throw new Error('Imagen returned no image data');
  }

  return {
    base64: prediction.bytesBase64Encoded,
    mimeType: prediction.mimeType ?? 'image/png',
  };
}
```

### 5.3 Prompt builder

New file: `apps/api/src/lib/image-gen/prompt.ts`

```ts
/**
 * Builds an Imagen prompt designed to produce an appetising, consistent food photo.
 */
export function buildRecipeImagePrompt(
  recipeName: string,
  cuisineType: string,
  description: string,
): string {
  return (
    `Professional food photography of "${recipeName}", ${cuisineType} cuisine. ` +
    `${description} ` +
    `Shot from above at a slight angle on a clean white or wooden surface. ` +
    `Natural daylight, shallow depth of field, vibrant colours, highly detailed, ` +
    `appetising and restaurant-quality presentation. No text, no people, no cutlery overlaid.`
  );
}
```

### 5.4 Orchestrator

New file: `apps/api/src/lib/image-gen/index.ts`

```ts
import { uploadRecipeImage } from '../image-cdn/cloudinary';
import { generateRecipeImage } from './imagen';
import { buildRecipeImagePrompt } from './prompt';

export { ImagenRateLimitError, ImagenContentFilterError } from './imagen';

export interface RecipeImageInput {
  recipeId: string;
  recipeName: string;
  cuisineType: string;
  description: string;
}

/**
 * Full pipeline: generate → upload → return CDN URL.
 * Does not catch errors — the worker is responsible for classifying failures.
 */
export async function generateAndUploadRecipeImage(input: RecipeImageInput): Promise<string> {
  const prompt = buildRecipeImagePrompt(input.recipeName, input.cuisineType, input.description);
  const { base64, mimeType } = await generateRecipeImage(prompt);
  return uploadRecipeImage(base64, mimeType, input.recipeId);
}
```

---

## 6. Phase 3 — Background Polling Worker

### 6.1 Rate limit consideration — sequential processing

**Critical design constraint:** Imagen 3's free tier allows 15 requests per minute (= 1 every 4 seconds). Processing recipes concurrently would immediately exhaust this limit. The worker therefore processes recipes **one at a time**, not in parallel batches. The `POLL_INTERVAL_MS` combined with single-recipe processing naturally stays within the quota.

If the paid tier is used in future, this constraint can be relaxed by increasing `BATCH_SIZE` and adding inter-request delays.

### 6.2 Retry strategy

| Failure type                                   | Action                                                                                                               |
| ---------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| `ImagenRateLimitError`                         | Reset recipe to `PENDING`, pause the worker for `retryAfterMs`, do not increment `imageRetries` (not a true failure) |
| `ImagenContentFilterError`                     | Mark as `FAILED` immediately, do not retry                                                                           |
| Any other error (timeout, Cloudinary, network) | Increment `imageRetries`; if `imageRetries < MAX_RETRIES`, reset to `PENDING`; otherwise mark as `FAILED`            |

### 6.3 Crash recovery on startup

Recipes stuck in `GENERATING` from a previous process crash must be reset to `PENDING` before the poll loop starts. This is run once during `start()`.

### 6.4 Worker class

New file: `apps/api/src/workers/recipe-image.worker.ts`

```ts
import { ImageStatus, prisma } from '@chefer/database';
import {
  generateAndUploadRecipeImage,
  ImagenContentFilterError,
  ImagenRateLimitError,
} from '../lib/image-gen/index';
import { recipeImageEventEmitter } from '../lib/sse/recipe-image-emitter';

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
```

### 6.5 Start and gracefully stop the worker

File: `apps/api/src/index.ts`

```ts
import { recipeImageWorker } from './workers/recipe-image.worker';

app.listen(env.PORT, () => {
  console.log(`API listening on port ${env.PORT}`);
  void recipeImageWorker.start(); // async — crash recovery runs before first tick
});

// Graceful shutdown: wait for the in-flight job before exiting
process.on('SIGTERM', async () => {
  await recipeImageWorker.stop();
  // ... existing server.close() / prisma.$disconnect() cleanup ...
  process.exit(0);
});
```

---

## 7. Phase 4 — SSE Endpoint

### 7.1 In-process event emitter

New file: `apps/api/src/lib/sse/recipe-image-emitter.ts`

```ts
import { EventEmitter } from 'events';

export interface RecipeImageEvent {
  imageUrl: string | null;
  status: 'DONE' | 'FAILED';
}

class RecipeImageEventEmitter extends EventEmitter {
  emit(recipeId: string, payload: RecipeImageEvent): boolean {
    return super.emit(recipeId, payload);
  }

  on(recipeId: string, listener: (payload: RecipeImageEvent) => void): this {
    return super.on(recipeId, listener);
  }

  off(recipeId: string, listener: (payload: RecipeImageEvent) => void): this {
    return super.off(recipeId, listener);
  }
}

export const recipeImageEventEmitter = new RecipeImageEventEmitter();
// Each active SSE connection adds one listener per pending recipe.
// 200 allows ~200 concurrent connections each watching 1 recipe.
// Raise this if load testing shows it is reached regularly.
recipeImageEventEmitter.setMaxListeners(200);
```

### 7.2 SSE route

New file: `apps/api/src/routers/recipe-images-sse.router.ts`

This is a **plain Express router** (not tRPC). tRPC's request/response model does not support long-lived streaming connections.

Issues addressed in this implementation:

- **Authentication**: reads the same session/auth cookie used by tRPC. Reject unauthenticated connections with 401.
- **Input validation**: `recipeIds` is capped at 50 entries and each ID is validated to be a non-empty string.
- **CORS**: must be mounted inside the existing CORS middleware scope (see §7.3).
- **Write-after-disconnect guard**: `send()` checks `res.writableEnded` before writing.
- **FAILED recipes returned immediately**: the initial DB query fetches both DONE and FAILED recipes so clients don't wait indefinitely for a resolution event that will never arrive.
- **Listener cleanup**: `req.on('close')` removes all registered listeners, preventing memory leaks.

```ts
import { Router, type Request, type Response } from 'express';
import { ImageStatus, prisma } from '@chefer/database';
import { getSession } from '../lib/auth/session'; // use the same session helper as tRPC context
import { recipeImageEventEmitter, type RecipeImageEvent } from '../lib/sse/recipe-image-emitter';

const MAX_IDS = 50;

export const recipeImagesSseRouter = Router();

recipeImagesSseRouter.get('/stream', async (req: Request, res: Response) => {
  // ── Auth ──────────────────────────────────────────────────────────────────
  const session = await getSession(req);
  if (!session?.userId) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }

  // ── Input validation ──────────────────────────────────────────────────────
  const raw = req.query['recipeIds'];
  const recipeIds: string[] =
    typeof raw === 'string'
      ? raw
          .split(',')
          .filter((id) => id.trim().length > 0)
          .slice(0, MAX_IDS)
      : [];

  if (recipeIds.length === 0) {
    res.status(400).json({ error: 'recipeIds query param required (max 50, comma-separated)' });
    return;
  }

  // ── SSE headers ───────────────────────────────────────────────────────────
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no'); // disable nginx proxy buffering
  res.flushHeaders();

  let closed = false;
  const send = (recipeId: string, payload: RecipeImageEvent) => {
    if (closed || res.writableEnded) return;
    try {
      res.write(`data: ${JSON.stringify({ recipeId, ...payload })}\n\n`);
    } catch {
      // Client disconnected between the guard check and the write — safe to ignore
    }
  };

  // ── 1. Immediately flush already-resolved recipes ────────────────────────
  // Fetch both DONE and FAILED so the client knows the final state right away
  // and does not register listeners for IDs that will never emit.
  const resolved = await prisma.recipe.findMany({
    where: {
      id: { in: recipeIds },
      imageStatus: { in: [ImageStatus.DONE, ImageStatus.FAILED] },
    },
    select: { id: true, imageUrl: true, imageStatus: true },
  });

  const resolvedIds = new Set<string>();
  for (const r of resolved) {
    const isDone = r.imageStatus === ImageStatus.DONE;
    send(r.id, { imageUrl: isDone ? r.imageUrl : null, status: isDone ? 'DONE' : 'FAILED' });
    resolvedIds.add(r.id);
  }

  // ── 2. Register listeners for still-pending recipes ───────────────────────
  const pendingIds = recipeIds.filter((id) => !resolvedIds.has(id));
  const listeners = new Map<string, (payload: RecipeImageEvent) => void>();

  for (const recipeId of pendingIds) {
    const listener = (payload: RecipeImageEvent) => {
      send(recipeId, payload);
      recipeImageEventEmitter.off(recipeId, listener);
      listeners.delete(recipeId);
    };
    listeners.set(recipeId, listener);
    recipeImageEventEmitter.on(recipeId, listener);
  }

  // ── Keep-alive ping (prevents proxy/LB timeout on idle connections) ───────
  const ping = setInterval(() => {
    if (closed || res.writableEnded) {
      clearInterval(ping);
      return;
    }
    res.write(': ping\n\n');
  }, 15_000);

  // ── Cleanup on client disconnect ──────────────────────────────────────────
  req.on('close', () => {
    closed = true;
    clearInterval(ping);
    for (const [recipeId, listener] of listeners) {
      recipeImageEventEmitter.off(recipeId, listener);
    }
    listeners.clear();
  });
});
```

### 7.3 Mount SSE router

File: `apps/api/src/index.ts`

**Mount this AFTER the CORS middleware and BEFORE the tRPC handler** so the SSE endpoint inherits the same CORS policy as the rest of the API.

```ts
import { recipeImagesSseRouter } from './routers/recipe-images-sse.router';

// After cors() middleware, before tRPC handler:
app.use('/api/recipe-images', recipeImagesSseRouter);
```

The CORS origin allowed list must include `http://localhost:3000` (and the production web domain). Verify `apps/api/src/index.ts` already has this in the existing `cors()` configuration — if not, add the web app origin.

---

## 8. Phase 5 — Frontend

### 8.1 SSE hook

New file: `apps/web/src/hooks/useRecipeImageStream.ts`

Issues addressed:

- **Timeout fallback**: after `CLIENT_TIMEOUT_MS` (3 minutes), any recipe still pending is treated as failed in local state — the shimmer never shows indefinitely.
- **Stable dependency**: `stableKey` is a sorted, joined string of IDs so the effect only re-runs when the set of IDs genuinely changes, not on every render where the array reference is new.
- **NEXT_PUBLIC_API_URL guard**: throws a build-time error if the variable is missing.

```ts
import { useEffect, useRef } from 'react';

export interface RecipeImageUpdate {
  recipeId: string;
  imageUrl: string | null;
  status: 'DONE' | 'FAILED';
}

const API_URL = process.env.NEXT_PUBLIC_API_URL;
if (!API_URL) throw new Error('NEXT_PUBLIC_API_URL is not set');

const CLIENT_TIMEOUT_MS = 3 * 60 * 1000; // 3 minutes

/**
 * Opens an SSE connection to stream image updates for the given recipe IDs.
 * Calls `onUpdate` for each resolved recipe.
 * Closes the connection when all IDs are resolved or on unmount.
 * Forces FAILED status for any IDs still pending after CLIENT_TIMEOUT_MS.
 */
export function useRecipeImageStream(
  recipeIds: string[],
  onUpdate: (update: RecipeImageUpdate) => void,
) {
  const onUpdateRef = useRef(onUpdate);
  onUpdateRef.current = onUpdate;

  // Sort for stable comparison — avoids reconnect on array reference churn
  const stableKey = [...recipeIds].sort().join(',');

  useEffect(() => {
    if (!stableKey) return;

    const ids = stableKey.split(',');
    const params = new URLSearchParams({ recipeIds: stableKey });
    const es = new EventSource(`${API_URL}/api/recipe-images/stream?${params}`, {
      withCredentials: true, // send session cookie for auth
    });

    const resolved = new Set<string>();

    const checkAllDone = () => {
      if (ids.every((id) => resolved.has(id))) {
        es.close();
      }
    };

    es.onmessage = (e: MessageEvent<string>) => {
      const data = JSON.parse(e.data) as RecipeImageUpdate;
      onUpdateRef.current(data);
      resolved.add(data.recipeId);
      checkAllDone();
    };

    es.onerror = () => {
      // EventSource auto-reconnects on error — no manual action needed.
      // The server will re-send DONE/FAILED state on reconnect.
    };

    // Client-side timeout: if images haven't arrived after CLIENT_TIMEOUT_MS,
    // stop waiting and show the failure fallback so shimmer doesn't run forever.
    const timeout = setTimeout(() => {
      for (const id of ids) {
        if (!resolved.has(id)) {
          onUpdateRef.current({ recipeId: id, imageUrl: null, status: 'FAILED' });
          resolved.add(id);
        }
      }
      es.close();
    }, CLIENT_TIMEOUT_MS);

    return () => {
      clearTimeout(timeout);
      es.close();
    };
  }, [stableKey]);
}
```

### 8.2 Recipe image component

New file: `apps/web/src/features/recipes/components/RecipeImage.tsx`

Three states: shimmer (PENDING/GENERATING), image (DONE), fallback icon (FAILED).

```tsx
'use client';

import { cn } from '@chefer/utils';

export type ImageStatusType = 'PENDING' | 'GENERATING' | 'DONE' | 'FAILED';

interface RecipeImageProps {
  imageUrl: string | null;
  imageStatus: ImageStatusType;
  recipeName: string;
  className?: string;
}

export function RecipeImage({ imageUrl, imageStatus, recipeName, className }: RecipeImageProps) {
  const isPending = imageStatus === 'PENDING' || imageStatus === 'GENERATING';

  if (isPending) {
    return (
      <div
        className={cn('relative overflow-hidden bg-muted', className)}
        aria-label="Image being prepared"
        role="img"
      >
        {/* Shimmer sweep */}
        <div className="absolute inset-0 -translate-x-full animate-[shimmer_1.5s_infinite] bg-gradient-to-r from-transparent via-white/20 to-transparent" />
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 text-muted-foreground">
          <span className="text-3xl" aria-hidden="true">
            🍽️
          </span>
          <span className="text-xs font-medium">Preparing image…</span>
        </div>
      </div>
    );
  }

  if (imageStatus === 'FAILED' || !imageUrl) {
    return (
      <div
        className={cn('flex items-center justify-center bg-muted text-muted-foreground', className)}
        role="img"
        aria-label={recipeName}
      >
        <span className="text-4xl" aria-hidden="true">
          🍽️
        </span>
      </div>
    );
  }

  return <img src={imageUrl} alt={recipeName} className={cn('object-cover', className)} />;
}
```

Add the shimmer keyframe to `apps/web/tailwind.config.ts`:

```ts
theme: {
  extend: {
    keyframes: {
      shimmer: {
        '100%': { transform: 'translateX(100%)' },
      },
    },
  },
},
```

### 8.3 Week plan page — wire up SSE

File: wherever the week plan grid component lives (the one with recipe cards).

The component must be a **Client Component** (`'use client'`). If the page is currently a Server Component, extract the grid into a separate `WeekPlanGrid` client component and keep data fetching in the server component.

```tsx
'use client';

import { useCallback, useMemo, useState } from 'react';
import { RecipeImage, type ImageStatusType } from '@/features/recipes/components/RecipeImage';
import { useRecipeImageStream, type RecipeImageUpdate } from '@/hooks/useRecipeImageStream';

// imageOverrides merges SSE updates on top of the initial server-fetched state
const [imageOverrides, setImageOverrides] = useState<
  Record<string, { imageUrl: string | null; status: ImageStatusType }>
>({});

// Memoize so the effect dependency only changes when the actual ID set changes
const pendingRecipeIds = useMemo(
  () =>
    plan.days
      .flatMap((d) => d.meals)
      .map((m) => m.recipe)
      .filter((r) => r.imageStatus === 'PENDING' || r.imageStatus === 'GENERATING')
      .map((r) => r.id),
  [plan],
);

const handleImageUpdate = useCallback((update: RecipeImageUpdate) => {
  setImageOverrides((prev) => ({
    ...prev,
    [update.recipeId]: { imageUrl: update.imageUrl, status: update.status as ImageStatusType },
  }));
}, []);

useRecipeImageStream(pendingRecipeIds, handleImageUpdate);

// When rendering each recipe card:
const override = imageOverrides[recipe.id];
const effectiveImageUrl = override?.imageUrl ?? recipe.imageUrl;
const effectiveImageStatus = (override?.status ?? recipe.imageStatus) as ImageStatusType;

// Then render:
<RecipeImage
  imageUrl={effectiveImageUrl}
  imageStatus={effectiveImageStatus}
  recipeName={recipe.name}
  className="h-48 w-full rounded-t-lg"
/>;
```

### 8.4 Recipe detail page — SSE

File: `apps/web/src/app/(dashboard)/recipes/[id]/page.tsx`

The detail page is currently a Server Component. Since SSE requires a client-side hook, extract the image area into a small `RecipeDetailImage` client component that accepts the initial `imageUrl` and `imageStatus` as props and manages its own SSE subscription independently.

```tsx
// RecipeDetailImage.tsx — client component
'use client';

import { useCallback, useState } from 'react';
import { RecipeImage, type ImageStatusType } from '@/features/recipes/components/RecipeImage';
import { useRecipeImageStream } from '@/hooks/useRecipeImageStream';

interface Props {
  recipeId: string;
  recipeName: string;
  initialImageUrl: string | null;
  initialImageStatus: ImageStatusType;
  className?: string;
}

export function RecipeDetailImage({
  recipeId,
  recipeName,
  initialImageUrl,
  initialImageStatus,
  className,
}: Props) {
  const [imageUrl, setImageUrl] = useState(initialImageUrl);
  const [imageStatus, setImageStatus] = useState(initialImageStatus);

  const isPending = initialImageStatus === 'PENDING' || initialImageStatus === 'GENERATING';

  const handleUpdate = useCallback(
    (update: { recipeId: string; imageUrl: string | null; status: string }) => {
      setImageUrl(update.imageUrl);
      setImageStatus(update.status as ImageStatusType);
    },
    [],
  );

  // Only subscribe if still pending — avoids an unnecessary SSE connection
  useRecipeImageStream(isPending ? [recipeId] : [], handleUpdate);

  return (
    <RecipeImage
      imageUrl={imageUrl}
      imageStatus={imageStatus}
      recipeName={recipeName}
      className={className}
    />
  );
}
```

### 8.5 Locations where `RecipeImage` / `RecipeDetailImage` must be applied

Replace every `<img src={recipe.imageUrl} />` or conditional image render with one of these components:

- **Week plan grid cards** → `RecipeImage` with `imageOverrides` merge (§8.3)
- **Recipe detail page** → `RecipeDetailImage` (§8.4)
- **Saved-recipe picker modal** → `RecipeImage` (images are unlikely to be pending here, but use the component anyway for correctness — DONE recipes with a real URL will just render `<img>` normally)

---

## 9. Phase 6 — Integration: Remove `pickRecipeImage` and wire `imageStatus`

### 9.1 Repository — upsert idempotency (critical)

File: `packages/database/src/repositories/meal-plan.repository.ts`

The Prisma upsert **must use separate `create` and `update` blocks** for `imageStatus`. Setting `imageStatus: PENDING` unconditionally in the `update` block would wipe the existing image of a recipe that has already been processed (e.g., same recipe returned in a second plan generation run).

```ts
// Inside upsertRecipes, for each recipe r:
await prisma.recipe.upsert({
  where: { id: r.id },
  create: {
    id: r.id,
    // ... all fields ...
    imageUrl: null,
    imageStatus: 'PENDING', // new recipe — start the pipeline
    imageRetries: 0,
  },
  update: {
    // Structural fields may change if the AI returns an updated version
    name: r.name,
    description: r.description,
    ingredients: r.ingredients,
    instructions: r.instructions,
    nutritionInfo: r.nutritionInfo,
    cuisineType: r.cuisineType,
    dietaryTags: r.dietaryTags,
    prepTimeMins: r.prepTimeMins,
    cookTimeMins: r.cookTimeMins,
    servings: r.servings,
    // imageUrl and imageStatus are intentionally NOT updated here —
    // the worker owns these fields. Re-generating a plan that returns
    // the same recipe ID must not reset its image.
  },
});
```

Update the `IMealPlanRepository` interface and the parameter type accepted by `upsertRecipes` to reflect the new `imageStatus` and `imageRetries` fields on `create`.

### 9.2 Meal plan service — `generate()`

File: `apps/api/src/application/meal-plan/meal-plan.service.ts`

Remove the block that calls `pickRecipeImage`. Replace the recipe collection loop with:

```ts
// Collect unique recipes — no image assignment, the worker handles this async
const recipeMap = new Map<string, RecipeData>();
for (const day of weekPlan.days) {
  for (const slot of day.meals) {
    recipeMap.set(slot.recipe.id, slot.recipe);
  }
}
const recipes = Array.from(recipeMap.values());
```

The `upsertRecipes` call does not need to pass `imageUrl` or `imageStatus` from the service layer — those are handled by the repository's `create` block (see §9.1).

### 9.3 Meal plan service — `swapRecipe()`

Same change: remove the `pickRecipeImage` call. The upsert in `swapRecipe` follows the same idempotency rule — only set `imageStatus: PENDING` in the `create` block, never in the `update` block.

### 9.4 DTOs — expose `imageStatus` to the web

Update `RecipeDto` in `meal-plan.service.ts`:

```ts
export interface RecipeDto {
  id: string;
  name: string;
  description: string;
  ingredients: Ingredient[];
  instructions: string[];
  nutritionInfo: NutritionInfo;
  cuisineType: string;
  dietaryTags: string[];
  prepTimeMins: number;
  cookTimeMins: number;
  servings: number;
  imageUrl: string | null;
  imageStatus: 'PENDING' | 'GENERATING' | 'DONE' | 'FAILED'; // new
}
```

Update both `toRecipeDto()` (maps from `RecipeData` — add `imageStatus: r.imageStatus ?? 'PENDING'`) and `rowToRecipeDto()` (maps from Prisma row — add `imageStatus: row.imageStatus`).

### 9.5 Remove `pickRecipeImage`

Remove the import from `meal-plan.service.ts`:

```ts
// DELETE:
import { pickRecipeImage } from '../../lib/ai/recipe-images.js';
```

Delete the file `apps/api/src/lib/ai/recipe-images.ts` entirely once no imports remain.

---

## 10. Phase 7 — Environment Variables

### New API variables

| Variable                | Description                          | Where      |
| ----------------------- | ------------------------------------ | ---------- |
| `CLOUDINARY_CLOUD_NAME` | Cloudinary account cloud name        | `apps/api` |
| `CLOUDINARY_API_KEY`    | Cloudinary API key (public)          | `apps/api` |
| `CLOUDINARY_API_SECRET` | Cloudinary API secret (keep private) | `apps/api` |

`GEMINI_API_KEY` is already defined and reused by Imagen 3.

Add to `apps/api/src/lib/env.ts` Zod schema:

```ts
CLOUDINARY_CLOUD_NAME: z.string().min(1),
CLOUDINARY_API_KEY: z.string().min(1),
CLOUDINARY_API_SECRET: z.string().min(1),
```

Add to `apps/api/.env.example`:

```
CLOUDINARY_CLOUD_NAME=
CLOUDINARY_API_KEY=
CLOUDINARY_API_SECRET=
```

### New web variable

| Variable              | Description                                        | Where      |
| --------------------- | -------------------------------------------------- | ---------- |
| `NEXT_PUBLIC_API_URL` | Full URL of the API (e.g. `http://localhost:3001`) | `apps/web` |

Check whether this already exists in `apps/web/src/lib/env.ts`. If not, add it:

```ts
NEXT_PUBLIC_API_URL: z.string().url(),
```

Add to `apps/web/.env.example`:

```
NEXT_PUBLIC_API_URL=http://localhost:3001
```

---

## 11. Repository Layer — Full Change Summary

File: `packages/database/src/repositories/meal-plan.repository.ts`

1. Update `upsertRecipes` parameter type to include `imageRetries?: number` in the create-only fields.
2. Implement split `create`/`update` blocks as described in §9.1.
3. Ensure `IMealPlanRepository.upsertRecipes` interface signature is updated to match.

File: `packages/database/src/index.ts`

Re-export `ImageStatus` enum.

---

## 12. Infrastructure Documentation Updates

Per project CLAUDE.md rules, update after implementation:

| File                | Section             | What to add                                                                    |
| ------------------- | ------------------- | ------------------------------------------------------------------------------ |
| `infrastructure.md` | §6 Schema           | `ImageStatus` enum; `imageStatus`, `imageRetries` on `Recipe`                  |
| `infrastructure.md` | §7 Services         | `RecipeImageWorker`, `generateAndUploadRecipeImage`, `RecipeImageEventEmitter` |
| `infrastructure.md` | §9 Routes           | `/api/recipe-images/stream` — auth-gated SSE endpoint                          |
| `infrastructure.md` | §10 Env vars        | Three Cloudinary vars (API only); `NEXT_PUBLIC_API_URL` (web)                  |
| `business_flow.md`  | Image pipeline flow | New async sub-flow from recipe creation to image delivery                      |

---

## 13. Implementation Order

Implement in this sequence to avoid broken intermediate states:

1. **DB schema** (Phase 1) — migration first, everything depends on it
2. **Image gen + Cloudinary services** (Phase 2) — isolate and test independently
3. **Repository upsert split** (§9.1 of Phase 6) — must be done before the worker runs, so PENDING recipes upserted by the service are not overwritten on re-runs
4. **Worker** (Phase 3) — needs Phase 1 + 2 + step 3
5. **SSE emitter + route** (Phase 4) — needs worker emitter; mount in `index.ts`
6. **DTO `imageStatus` field** (§9.4 of Phase 6) — needed before frontend can read it
7. **Frontend hook + `RecipeImage` component** (Phase 5, §8.1–8.2) — needs Phase 4
8. **Wire SSE into week plan page and recipe detail page** (§8.3–8.4) — needs §8.1–8.2
9. **Remove `pickRecipeImage`, set `imageStatus: PENDING` in service** (§9.2–9.5) — final cutover; do not do this before step 8 or images will disappear with no replacement UI
10. **Env vars** (Phase 7) — add to `.env.example` and Zod schemas; set real values in `.env`
11. **`infrastructure.md` / `business_flow.md` updates** (Phase 12)

---

## 14. Known Constraints and Limits

| Constraint                  | Value         | Notes                                                           |
| --------------------------- | ------------- | --------------------------------------------------------------- |
| Imagen 3 free tier RPM      | 15 req/min    | Worker processes 1 recipe at a time to stay within quota        |
| Imagen 3 free tier daily    | 1,500 req/day | ~62 full week plans (24 recipes each) per day                   |
| Cloudinary free storage     | 25 GB         | Each image ≈ 150 KB after transformation; ~166,000 images       |
| Cloudinary free bandwidth   | 25 GB/month   | Monitor in Cloudinary dashboard                                 |
| SSE max IDs per connection  | 50            | Enforced server-side to prevent EventEmitter listener overload  |
| Max image retries           | 3             | After 3 transient failures, recipe is permanently marked FAILED |
| Client-side shimmer timeout | 3 minutes     | Prevents infinite shimmer if SSE consistently fails             |

---

## 15. Testing Checklist (manual)

1. **Happy path**: Generate a new week plan → cards show shimmer → within ~10 s, AI images appear without page reload.
2. **Swap recipe**: Swap a meal slot → new card shows shimmer → image arrives via SSE.
3. **Page refresh mid-generation**: Shimmer appears on load → SSE reconnects → image arrives without full reload.
4. **Rate limit simulation**: Temporarily set `POLL_INTERVAL_MS` to 1 ms and batch 15 recipes. Verify the worker pauses on 429, resets the recipe to PENDING, and retries after back-off.
5. **Server crash recovery**: Insert a recipe with `imageStatus = GENERATING` directly in the DB, restart the API → verify the worker resets it to PENDING and processes it on the next tick.
6. **Max retries**: Make Cloudinary credentials invalid → verify a recipe is retried 3 times then permanently marked FAILED → verify the shimmer switches to the fallback icon.
7. **Content filter**: Use a prompt known to trigger safety filters (requires mocking) → verify the recipe is immediately marked FAILED with no retries.
8. **Upsert idempotency**: Generate a plan, wait for images to arrive (DONE), regenerate the same week → verify existing images are NOT reset to PENDING.
9. **Authentication**: Call the SSE endpoint without a session cookie → verify 401.
10. **Existing recipes unchanged**: Recipes created before this feature was deployed show their Unsplash URL with no shimmer.
11. **Recipe detail page**: Open detail for a PENDING recipe → shimmer shows → image arrives → shimmer replaced.
12. **Client timeout**: Set `CLIENT_TIMEOUT_MS` to a small value, disable the worker → verify shimmer switches to fallback icon after the timeout expires.
