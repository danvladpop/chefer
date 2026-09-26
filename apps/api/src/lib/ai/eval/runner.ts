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
} from './scorer.js';

// ─── Eval runner ──────────────────────────────────────────────────────────────
// Turns the golden set into calls for one workload, runs them one at a time
// against any IAIService (a provider chain, or the mock), and scores each.
// Sequential on purpose: free tiers rate-limit per minute, and per-case
// token attribution (from the [ai.usage] records) needs one call in flight.

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
}

export async function runEvalCases(
  cases: EvalCase[],
  service: IAIService,
  options: RunOptions = {},
): Promise<CaseResult[]> {
  const now = options.now ?? Date.now;
  const selected = options.limit !== undefined ? cases.slice(0, options.limit) : cases;
  const results: CaseResult[] = [];
  for (const c of selected) {
    let inputTokens = 0;
    let outputTokens = 0;
    const unsubscribe = onAiUsage((u) => {
      inputTokens += u.inputTokens ?? 0;
      outputTokens += u.outputTokens ?? 0;
    });
    const started = now();
    let result: CaseResult;
    try {
      const output = await c.call(service);
      result = { id: c.id, ok: true, ms: now() - started, scores: c.score(output) };
    } catch (err) {
      result = {
        id: c.id,
        ok: false,
        error: (err instanceof Error ? err.message : String(err)).slice(0, 300),
        ms: now() - started,
        scores: { schemaValid: false, allergenViolations: 0, restrictionViolations: 0, checks: {} },
      };
    } finally {
      unsubscribe();
    }
    if (inputTokens || outputTokens) {
      result.inputTokens = inputTokens;
      result.outputTokens = outputTokens;
    }
    results.push(result);
    options.onCase?.(result);
  }
  return results;
}

export async function runEval(
  workload: AiWorkload,
  provider: string,
  service: IAIService,
  golden: GoldenSet,
  options: RunOptions = {},
): Promise<{ summary: EvalSummary; results: CaseResult[] }> {
  const results = await runEvalCases(buildEvalCases(workload, golden), service, options);
  return { summary: summarise(workload, provider, results), results };
}
