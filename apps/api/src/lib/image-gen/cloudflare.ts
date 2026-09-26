import { logAiUsage } from '../ai/usage.js';
import { ImagenRateLimitError } from './errors.js';
import { buildRecipeImagePrompt } from './prompt.js';
import type { IRecipeImageService, RecipeImageInput } from './types.js';

// Cloudflare Workers AI recipe images (audit P0-5 groundwork). Selected with
// IMAGE_PROVIDER=cloudflare; see index.ts for the factory.

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

    if (res.status === 429) {
      await res.arrayBuffer().catch(() => undefined);
      throw new ImagenRateLimitError(30_000);
    }
    if (!res.ok) {
      const text = await res.text().catch(() => '');
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
    logAiUsage({
      provider: 'cloudflare',
      model: this.config.model,
      op: 'recipeImage',
      ms: Date.now() - started,
    });

    return this.config.upload(base64, mimeType, input.recipeId);
  }
}
