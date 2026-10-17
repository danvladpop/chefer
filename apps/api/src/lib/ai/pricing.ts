// ─── AI price table (Phase 2 cost tracking) ──────────────────────────────────
// USD list prices per model id: per 1M input / cached-input / output tokens,
// per audio hour (speech-to-text) and per generated image. Env-free and pure.
//
// FREE-TIER CALLS ARE PRICED AT THE PAID LIST PRICE OF THE SAME MODEL. Today
// production runs AI_FREE_ONLY (Groq free → Workers AI free), so the real bill
// is $0 — but the per-user and global budgets (lib/ai-budget) must already
// mean "what this would cost on the paid tier", so they protect us now and
// keep working unchanged the day the switch to paid models happens.
//
// Prices checked 2026-10-11 against the providers' public pricing pages
// (console.groq.com/pricing, ai.google.dev/pricing,
// developers.cloudflare.com/workers-ai/platform/pricing). Re-check when a
// model id changes or before the paid switch, and update the date.
//
// Tokens × (USD per 1M tokens) is exactly micro-USD, which is the unit the
// usage table stores. Reasoning tokens bill as output: every client reports
// them inside `outputTokens` (usage.ts), so they are not added twice.

export const PRICES_CHECKED_ON = '2026-10-11';

export interface ModelPrice {
  /** USD per 1M (uncached) input tokens. */
  inputPerMTok: number;
  /** USD per 1M cached input tokens; defaults to the input price. */
  cachedInputPerMTok?: number;
  /** USD per 1M output tokens (reasoning included). */
  outputPerMTok: number;
  /** USD per hour of audio (speech-to-text). */
  perAudioHour?: number;
  /** USD per generated image. */
  perImage?: number;
}

export const MODEL_PRICES: Readonly<Record<string, ModelPrice>> = {
  // Groq (console.groq.com/pricing)
  'openai/gpt-oss-120b': { inputPerMTok: 0.15, cachedInputPerMTok: 0.075, outputPerMTok: 0.6 },
  'openai/gpt-oss-20b': { inputPerMTok: 0.075, outputPerMTok: 0.3 },
  'qwen/qwen3.8-27b': { inputPerMTok: 0.8, outputPerMTok: 4.0 },
  'whisper-large-v3-turbo': { inputPerMTok: 0, outputPerMTok: 0, perAudioHour: 0.04 },
  // Google Gemini (ai.google.dev/pricing, paid tier)
  'gemini-2.5-flash': { inputPerMTok: 0.3, outputPerMTok: 2.5 },
  'gemini-2.5-flash-lite': { inputPerMTok: 0.1, outputPerMTok: 0.4 },
  // Cloudflare Workers AI (paid neurons converted to per-token list prices)
  '@cf/openai/gpt-oss-120b': { inputPerMTok: 0.35, outputPerMTok: 0.75 },
  '@cf/openai/gpt-oss-20b': { inputPerMTok: 0.2, outputPerMTok: 0.3 },
  '@cf/google/gemma-4-26b-a4b-it': { inputPerMTok: 0.1, outputPerMTok: 0.3 },
  // ~$0.00064 per 1024×1024 image at 4 steps (our request: steps 4).
  '@cf/black-forest-labs/flux-1-schnell': { inputPerMTok: 0, outputPerMTok: 0, perImage: 0.00064 },
  // ~104 neurons per 1024×768 image × $0.011 per 1,000 neurons (F3 default).
  '@cf/black-forest-labs/flux-2-klein-4b': { inputPerMTok: 0, outputPerMTok: 0, perImage: 0.00115 },
  // Pollinations is free and is never called server-side (the client loads
  // the URL), so it never produces a usage row; listed for completeness.
  pollinations: { inputPerMTok: 0, outputPerMTok: 0, perImage: 0 },
};

/**
 * What an unknown model is priced at: deliberately ABOVE every text model in
 * the table (so a new, unpriced model trips the budgets early rather than
 * late), plus a one-time warning so the table gets updated.
 */
export const FALLBACK_PRICE: ModelPrice = {
  inputPerMTok: 1.0,
  outputPerMTok: 5.0,
  perAudioHour: 0.2,
  perImage: 0.01,
};

const warnedModels = new Set<string>();

/** Model ids as providers report them: Gemini sometimes prefixes `models/`. */
function normalizeModelId(model: string): string {
  return model.trim().replace(/^models\//, '');
}

/** The list price of `model`; unknown models get FALLBACK_PRICE and one warning per model. */
export function priceFor(
  model: string,
  warn: (message: string) => void = (m) => console.warn(m),
): { price: ModelPrice; known: boolean } {
  const id = normalizeModelId(model);
  const price = MODEL_PRICES[id];
  if (price) return { price, known: true };
  if (!warnedModels.has(id)) {
    warnedModels.add(id);
    warn(
      `[ai.pricing] no list price for model "${id}" — using the conservative fallback (${FALLBACK_PRICE.inputPerMTok}/${FALLBACK_PRICE.outputPerMTok} USD per 1M tokens). Add it to lib/ai/pricing.ts.`,
    );
  }
  return { price: FALLBACK_PRICE, known: false };
}

/** Test seam: forget which unknown models were already warned about. */
export function resetPricingWarnings(): void {
  warnedModels.clear();
}

export interface BillableUsage {
  model: string;
  inputTokens?: number | undefined;
  /** Part of inputTokens served from the provider's prompt cache. */
  cachedInputTokens?: number | undefined;
  /** Includes reasoning tokens. */
  outputTokens?: number | undefined;
  audioSeconds?: number | undefined;
  images?: number | undefined;
}

const nonNegative = (n: number | undefined): number =>
  typeof n === 'number' && Number.isFinite(n) && n > 0 ? n : 0;

/** Estimated cost of one call in micro-USD (rounded to a whole micro-dollar). */
export function estimateCostMicroUsd(
  usage: BillableUsage,
  warn?: (message: string) => void,
): number {
  const { price } = priceFor(usage.model, warn);
  const input = nonNegative(usage.inputTokens);
  const cached = Math.min(nonNegative(usage.cachedInputTokens), input);
  const output = nonNegative(usage.outputTokens);
  const micro =
    (input - cached) * price.inputPerMTok +
    cached * (price.cachedInputPerMTok ?? price.inputPerMTok) +
    output * price.outputPerMTok +
    (nonNegative(usage.audioSeconds) / 3600) * (price.perAudioHour ?? 0) * 1_000_000 +
    nonNegative(usage.images) * (price.perImage ?? 0) * 1_000_000;
  return Math.round(micro);
}

/** micro-USD → USD, for logs and API responses. */
export function microToUsd(micro: number): number {
  return Math.round(micro) / 1_000_000;
}

/** USD → micro-USD (env limits are configured in dollars). */
export function usdToMicro(usd: number): number {
  return Math.round(usd * 1_000_000);
}
