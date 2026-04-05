import { env } from '../env.js';

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
