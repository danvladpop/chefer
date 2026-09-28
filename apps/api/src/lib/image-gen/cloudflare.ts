import { CF_IMAGE_NEURONS_ESTIMATE, cloudflareNeuronLedger } from '../ai/cloudflare-budget.js';
import { logAiUsage } from '../ai/usage.js';
import { ImagenRateLimitError, ImageQuotaExhaustedError, ImageStorageError } from './errors.js';
import { buildRecipeImagePrompt } from './prompt.js';
import type { IRecipeImageService, RecipeImageInput } from './types.js';

// Cloudflare Workers AI recipe images (audit P0-5 groundwork). Selected with
// IMAGE_PROVIDER=cloudflare; see index.ts for the factory.

/**
 * Workers AI's "daily free allocation used up" answer. The REST API returns
 * HTTP 429 with `{"errors":[{"code":3036,"message":"You have used up your
 * daily free allocation of 10,000 neurons…"}]}` (the same body the text client
 * sees, ai/cloudflare.test.ts); the Workers binding reports it as code 4006
 * with the same wording. Matched on the code OR the wording, whatever the
 * status, so a changed code or status still lands here.
 */
export function isDailyQuotaError(body: string): boolean {
  return /"code"\s*:\s*(3036|4006)\b/.test(body) || /daily free allocation/i.test(body);
}

export interface CloudflareImageConfig {
  accountId: string;
  apiToken: string;
  model: string;
  /** Stores the bytes and returns the public URL (local uploads volume by default, see index.ts). */
  upload: (base64: string, mimeType: string, recipeId: string) => Promise<string>;
}

const CLOUDFLARE_TIMEOUT_MS = 60_000;

/**
 * Workers AI text-to-image. Uses the JSON input/output of the flux-1-schnell
 * family ({ prompt, steps } → { result: { image: base64 } }); models that
 * answer with raw image bytes are handled too. Rate limits map to the
 * worker's back-off error so they don't burn a recipe's retries.
 */
export class CloudflareImageService implements IRecipeImageService {
  readonly name = 'cloudflare';
  constructor(private readonly config: CloudflareImageConfig) {}

  async generate(input: RecipeImageInput): Promise<string> {
    const prompt = buildRecipeImagePrompt(input.recipeName, input.cuisineType);
    const url = `https://api.cloudflare.com/client/v4/accounts/${this.config.accountId}/ai/run/${this.config.model}`;
    const started = Date.now();
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${this.config.apiToken}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({ prompt, steps: 4 }),
      signal: AbortSignal.timeout(CLOUDFLARE_TIMEOUT_MS),
    });

    if (!res.ok) {
      const text = await res.text().catch(() => '');
      // The daily free allocation is gone until 00:00 UTC — not a short
      // back-off (the worker switches to the free fallback for the day).
      if (isDailyQuotaError(text)) {
        throw new ImageQuotaExhaustedError(
          `Cloudflare daily free allocation used up (HTTP ${res.status}) — ${text.slice(0, 200)}`,
        );
      }
      if (res.status === 429) throw new ImagenRateLimitError(30_000);
      throw new Error(
        `Cloudflare image generation returned ${res.status} for recipe ${input.recipeId}${
          text ? ` — ${text.slice(0, 200)}` : ''
        }`,
      );
    }

    let base64: string;
    let mimeType = 'image/jpeg';
    const contentType = res.headers.get('content-type') ?? '';
    if (contentType.startsWith('image/')) {
      mimeType = contentType.split(';')[0] ?? mimeType;
      base64 = Buffer.from(await res.arrayBuffer()).toString('base64');
    } else {
      const body = (await res.json()) as { result?: { image?: string }; success?: boolean };
      const image = body.result?.image;
      if (!image) {
        throw new Error(`Cloudflare image generation returned no image for ${input.recipeId}`);
      }
      base64 = image;
    }
    // Images share the free 10K neurons/day with Workers AI text: count them
    // in the same ledger so text stops at CF_TEXT_NEURON_BUDGET and leaves
    // images the rest (cloudflare-budget.ts).
    const reported = Number(res.headers.get('cf-ai-neurons'));
    const spent = Number.isFinite(reported) && reported > 0 ? reported : CF_IMAGE_NEURONS_ESTIMATE;
    cloudflareNeuronLedger.record(spent);
    logAiUsage({
      provider: 'cloudflare',
      model: this.config.model,
      op: 'recipeImage',
      ms: Date.now() - started,
      neurons: Math.round(spent * 100) / 100,
      neuronsToday: Math.round(cloudflareNeuronLedger.usedToday()),
    });

    // From here on the neurons are spent: a failure is a STORAGE failure and
    // must not make the worker pay for a second generation.
    try {
      return await this.config.upload(base64, mimeType, input.recipeId);
    } catch (err) {
      if (err instanceof ImageStorageError) throw err;
      throw new ImageStorageError(
        `Storing the generated image for ${input.recipeId} failed: ${(err as Error).message}`,
        { cause: err },
      );
    }
  }
}
