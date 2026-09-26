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
