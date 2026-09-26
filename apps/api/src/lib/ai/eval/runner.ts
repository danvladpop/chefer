// AsyncLocalStorage is stable since Node 16.4; the plugin assumes >=16.0 because
// this package declares no engines (the repo requires Node >=20).
// eslint-disable-next-line n/no-unsupported-features/node-builtins
import { AsyncLocalStorage } from 'node:async_hooks';
import { parseTryAgainIn } from '../rate-limit.js';
import { SHADOWABLE_WORKLOADS, type AiWorkload } from '../routing.js';
import type { IAIService } from '../types.js';
import { onAiUsage } from '../usage.js';
import { swapCases, type GoldenSet } from './golden.js';
import {
  scoreCheferize,
  scoreExtraction,
  scoreMealPlan,
  scorePhoto,
  scorePrices,
  scoreReview,
  scoreShopping,
  scoreSwap,
  summarise,
  type CaseResult,
  type CaseScores,
  type EvalSummary,
  type GateOptions,
} from './scorer.js';

// ─── Eval runner ──────────────────────────────────────────────────────────────
// Turns the golden set into calls for one workload, runs them against any
// IAIService (a provider chain, or the mock), and scores each. Sequential by
// default, because free tiers rate-limit per minute (Groq free: 8K tokens/min):
// --concurrency raises the number of cases in flight, --delay-ms pauses
// between cases, and a 429 is waited out (Retry-After / "try again in Xs")
// and the case retried instead of being scored as an error. Tokens are
// attributed per case through AsyncLocalStorage, so they stay exact with
// several cases in flight.

/** Every workload but chat (its tools write data; it needs a live user context). */
export const EVAL_WORKLOADS: readonly AiWorkload[] = SHADOWABLE_WORKLOADS;

export interface EvalCase {
  id: string;
  call: (service: IAIService) => Promise<unknown>;
  score: (output: unknown) => CaseScores;
}

export function buildEvalCases(workload: AiWorkload, golden: GoldenSet): EvalCase[] {
  switch (workload) {
    case 'mealPlan':
      return golden.profiles.map((p) => ({
        id: p.id,
        call: (s) => s.generateMealPlan(p.input),
        score: (out) => scoreMealPlan(p.input, out),
      }));
    case 'swap':
      return swapCases(golden).map((c) => ({
        id: c.id,
        call: (s) => s.generateRecipeSwap(c.input),
        score: (out) => scoreSwap(c.input.preferences, out),
      }));
    case 'cheferize':
      return golden.cheferize.map((c) => ({
        id: c.id,
        call: (s) => s.cheferizeRecipe(c.input),
        score: (out) => scoreCheferize(c.input, out),
      }));
    case 'importText':
      return golden.imports.map((c) => ({
        id: c.id,
        call: (s) => s.extractRecipe({ text: c.text }),
        score: (out) => scoreExtraction(c.expected, out),
      }));
    case 'vision':
      return golden.photos.map((c) => ({
        id: c.id,
        call: (s) => s.analyzeMealPhoto(c.imageBase64, c.mimeType),
        score: (out) => scorePhoto(c.expected, out),
      }));
    case 'prices':
      return golden.prices.batches.map((names, i) => ({
        id: `batch-${i + 1}`,
        call: (s) => s.estimateIngredientPrices(names),
        score: (out) =>
          scorePrices(
            names,
            Object.fromEntries(
              names.flatMap((n) => {
                const kcal = golden.prices.kcalPer100g[n];
                return kcal === undefined ? [] : [[n, kcal]];
              }),
            ),
            out,
          ),
      }));
    case 'shopping':
      return golden.shopping.map((c) => ({
        id: c.id,
        call: (s) => s.generateShoppingList(c.input),
        score: (out) => scoreShopping(c.input, out),
      }));
    case 'review':
      return golden.reviews.map((c) => ({
        id: c.id,
        call: (s) => s.generateReviewText(c.input),
        score: (out) => scoreReview(out),
      }));
    case 'chat':
      throw new Error('chat is not evaluated offline (its tools write data)');
  }
}

export interface RunOptions {
  /** Run at most this many cases (cost control against live providers). */
  limit?: number | undefined;
  onCase?: ((result: CaseResult) => void) | undefined;
  now?: (() => number) | undefined;
  /** Cases in flight at once (default 1). */
  concurrency?: number | undefined;
  /** Pause before each case after a worker's first (default 0). */
  delayMs?: number | undefined;
  /** Rate-limit (429) retries per case (default 2). */
  rateLimitRetries?: number | undefined;
  /** Longest 429 wait honoured; a longer one (daily quota) is an error. Default 60 s. */
  maxRetryWaitMs?: number | undefined;
  sleep?: ((ms: number) => Promise<void>) | undefined;
}

/** A 429 with no usable hint waits this long. */
const DEFAULT_RATE_LIMIT_WAIT_MS = 10_000;

/**
 * How long to wait before retrying a case that hit a rate limit, or
 * undefined when the error is not a 429 or asks for longer than `max`.
 */
export function rateLimitWaitMs(err: unknown, max: number): number | undefined {
  const e = err as { status?: number; retryAfterMs?: number; message?: string } | null;
  const is429 = e?.status === 429 || /HTTP 429|rate limit/i.test(e?.message ?? '');
  if (!is429) return undefined;
  const wait = e?.retryAfterMs ?? parseTryAgainIn(e?.message ?? '') ?? DEFAULT_RATE_LIMIT_WAIT_MS;
  return wait > max ? undefined : wait + 250;
}

interface TokenCounter {
  input: number;
  output: number;
}

export async function runEvalCases(
  cases: EvalCase[],
  service: IAIService,
  options: RunOptions = {},
): Promise<CaseResult[]> {
  const now = options.now ?? Date.now;
  const sleep = options.sleep ?? ((ms: number) => new Promise((r) => setTimeout(r, ms)));
  const retries = options.rateLimitRetries ?? 2;
  const maxWait = options.maxRetryWaitMs ?? 60_000;
  const delayMs = options.delayMs ?? 0;
  const selected = options.limit !== undefined ? cases.slice(0, options.limit) : cases;

  // One usage listener for the whole run; each case counts into its own
  // counter, found through the async context the provider call runs in.
  const counters = new AsyncLocalStorage<TokenCounter>();
  const unsubscribe = onAiUsage((u) => {
    const counter = counters.getStore();
    if (!counter) return;
    counter.input += u.inputTokens ?? 0;
    counter.output += u.outputTokens ?? 0;
  });

  const runCase = async (c: EvalCase): Promise<CaseResult> => {
    const counter: TokenCounter = { input: 0, output: 0 };
    const result = await counters.run(counter, async (): Promise<CaseResult> => {
      for (let attempt = 0; ; attempt++) {
        const started = now();
        try {
          const output = await c.call(service);
          return { id: c.id, ok: true, ms: now() - started, scores: c.score(output) };
        } catch (err) {
          const wait = attempt < retries ? rateLimitWaitMs(err, maxWait) : undefined;
          if (wait !== undefined) {
            await sleep(wait);
            continue;
          }
          return {
            id: c.id,
            ok: false,
            error: (err instanceof Error ? err.message : String(err)).slice(0, 300),
            ms: now() - started,
            scores: {
              schemaValid: false,
              allergenViolations: 0,
              restrictionViolations: 0,
              checks: {},
            },
          };
        }
      }
    });
    if (counter.input || counter.output) {
      result.inputTokens = counter.input;
      result.outputTokens = counter.output;
    }
    return result;
  };

  const results: CaseResult[] = new Array<CaseResult>(selected.length);
  let next = 0;
  const worker = async (): Promise<void> => {
    let first = true;
    while (next < selected.length) {
      const index = next++;
      if (!first && delayMs > 0) await sleep(delayMs);
      first = false;
      const result = await runCase(selected[index]!);
      results[index] = result;
      options.onCase?.(result);
    }
  };
  try {
    const workers = Math.max(1, Math.min(options.concurrency ?? 1, selected.length));
    await Promise.all(Array.from({ length: workers }, () => worker()));
  } finally {
    unsubscribe();
  }
  return results;
}

export async function runEval(
  workload: AiWorkload,
  provider: string,
  service: IAIService,
  golden: GoldenSet,
  options: RunOptions & { gate?: GateOptions | undefined } = {},
): Promise<{ summary: EvalSummary; results: CaseResult[] }> {
  const results = await runEvalCases(buildEvalCases(workload, golden), service, options);
  return { summary: summarise(workload, provider, results, options.gate), results };
}
