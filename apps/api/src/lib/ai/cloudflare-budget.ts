// ─── Cloudflare Workers AI neuron budget (free-only mode) ────────────────────
// The Workers AI free plan gives 10,000 neurons per UTC day and then answers
// 429 (code 3036, "You have used up your daily free allocation of 10,000
// neurons") — nothing is billed, the calls just fail. Text and recipe images
// draw from the same 10K, so text stops at a configurable share
// (CF_TEXT_NEURON_BUDGET, 8,000 by default) and images keep the rest.
//
// Pure and env-free. In memory, per UTC day: a restart forgets today's use, so
// after a restart text may spend up to the budget again — Cloudflare's own
// hard 10K cap still holds (it fails, it never bills).

/** Cloudflare's daily free allocation (Workers Free plan). */
export const CF_FREE_NEURONS_PER_DAY = 10_000;

/**
 * Neurons per million tokens, from the Workers AI pricing table
 * (https://developers.cloudflare.com/workers-ai/platform/pricing/, checked
 * 2026-09-26). Only a fallback: every Workers AI chat completion reports its
 * own cost in `usage.neurons` (and the `cf-ai-neurons` header), which wins.
 */
export const CF_NEURON_RATES: Readonly<Record<string, { input: number; output: number }>> = {
  '@cf/openai/gpt-oss-120b': { input: 31_818, output: 68_182 },
  '@cf/openai/gpt-oss-20b': { input: 18_182, output: 27_273 },
  '@cf/meta/llama-3.3-70b-instruct-fp8-fast': { input: 26_668, output: 204_805 },
  '@cf/google/gemma-4-26b-a4b-it': { input: 9_091, output: 27_273 },
  '@cf/mistralai/mistral-small-3.1-24b-instruct': { input: 31_876, output: 50_488 },
};

/** Used for a model missing from the table: the dearest input/output rates above. */
const FALLBACK_RATE = { input: 31_876, output: 204_805 };

/**
 * Neurons one recipe image costs, per Workers AI image model (pricing page,
 * checked 2026-10-17). An estimate: the `cf-ai-neurons` header wins when a
 * response carries it. Also what the backfill worker reserves before a call.
 *   - flux-1-schnell: 4.80 per 512×512 tile + 9.60 per step; the client sends
 *     4 steps and the model only makes 1024×1024 (4 tiles) → ~58.
 *   - flux-2-klein-4b: 26.05 per output tile (steps are fixed); the client asks
 *     for 1024×768, counted as 4 tiles to stay on the safe side → ~104.
 * An unknown model counts as the dearer of the two.
 */
export function imageNeuronEstimate(model: string): number {
  if (model.includes('flux-1-schnell')) return 4 * 4.8 + 4 * 9.6;
  return 4 * 26.05;
}

/** Neurons a call cost, from the model's per-token rates. */
export function estimateNeurons(model: string, inputTokens = 0, outputTokens = 0): number {
  const rate = CF_NEURON_RATES[model] ?? FALLBACK_RATE;
  return (inputTokens * rate.input + outputTokens * rate.output) / 1_000_000;
}

/** "2026-09-26" — the UTC day Cloudflare's allocation resets on. */
function utcDay(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10);
}

/**
 * Today's Workers AI neuron use, text and images together. One per process
 * (cloudflareNeuronLedger below), so the text client and the image worker
 * count against the same day.
 */
export class NeuronLedger {
  private day: string;
  private spent = 0;

  constructor(private readonly now: () => number = Date.now) {
    this.day = utcDay(now());
  }

  private roll(): void {
    const today = utcDay(this.now());
    if (today !== this.day) {
      this.day = today;
      this.spent = 0;
    }
  }

  /** Adds one call's neurons (ignores non-finite or negative values). */
  record(neurons: number): void {
    if (!Number.isFinite(neurons) || neurons <= 0) return;
    this.roll();
    this.spent += neurons;
  }

  /** Neurons used so far today (UTC). */
  usedToday(): number {
    this.roll();
    return this.spent;
  }
}

/** The process-wide ledger shared by the text client and the image service. */
export const cloudflareNeuronLedger = new NeuronLedger();

/** The text client's view: a ledger plus the share text may use. */
export interface NeuronBudget {
  ledger: NeuronLedger;
  /** CF_TEXT_NEURON_BUDGET: text stops once today's total reaches this. */
  textLimit: number;
}

/** Whether another text call may go to Workers AI today. */
export function textBudgetAllows(budget: NeuronBudget): boolean {
  return budget.ledger.usedToday() < budget.textLimit;
}

/**
 * A call's cost: what Workers AI reported (usage.neurons, else the
 * cf-ai-neurons header), else the rate-table estimate.
 */
export function neuronsForCall(opts: {
  reported?: number | undefined;
  header?: string | null | undefined;
  model: string;
  inputTokens?: number | undefined;
  outputTokens?: number | undefined;
}): number {
  if (typeof opts.reported === 'number' && Number.isFinite(opts.reported)) return opts.reported;
  const fromHeader = opts.header ? Number(opts.header) : NaN;
  if (Number.isFinite(fromHeader)) return fromHeader;
  return estimateNeurons(opts.model, opts.inputTokens, opts.outputTokens);
}
