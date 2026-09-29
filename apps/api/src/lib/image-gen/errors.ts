// Image-generation errors the recipe-image worker understands (env-free, so
// every provider module can import them). The names predate the provider
// abstraction: RateLimit means "back off without burning a retry".

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

/**
 * The image was generated but could not be STORED (uploads volume not
 * writable, Cloudinary upload failed, unusable bytes). The worker must never
 * regenerate on this: generation is the part that costs Cloudflare neurons, and
 * a broken store fails the same way on every retry.
 */
export class ImageStorageError extends Error {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = 'ImageStorageError';
  }
}

/**
 * The provider's DAILY free allowance is used up (Workers AI: 10,000
 * neurons/day, see ai/cloudflare-budget.ts). Unlike ImagenRateLimitError this
 * does not clear in seconds: the worker stops calling the provider until the
 * next UTC day and serves the free Pollinations fallback instead.
 */
export class ImageQuotaExhaustedError extends Error {
  constructor(message = 'Image provider daily free allocation used up') {
    super(message);
    this.name = 'ImageQuotaExhaustedError';
  }
}
