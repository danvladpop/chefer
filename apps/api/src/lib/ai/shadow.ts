import { getAiCallContext, runOutsideAiCallContext, runWithAiCallContext } from './call-context.js';
import {
  scoreCheferize,
  scoreExtraction,
  scoreMealPlan,
  scorePhoto,
  scorePrices,
  scoreReview,
  scoreShopping,
  scoreSwap,
  type CaseScores,
} from './eval/scorer.js';
import type { ShadowHook, ShadowObservation } from './failover.js';
import type { AiWorkload } from './routing.js';
import type {
  AnnotatedExtraction,
  CheferizeInput,
  IAIService,
  MealPlanInput,
  ShoppingListInput,
  SwapInput,
} from './types.js';
import { logAiShadow, onAiUsage, type AiShadowScores } from './usage.js';

// ─── Shadow mode (research §5.4 step 3) ───────────────────────────────────────
// AI_SHADOW_ROUTE=<workload>:<chain> + AI_SHADOW_SAMPLE=<0..1>: after the
// real chain has served a call, a sampled share of those calls is replayed on
// the candidate chain in the background. The candidate's output is DISCARDED;
// only eval-style scores for both outputs are logged ("[ai.shadow]").
//
// Guarantees:
// - never on the user's critical path: scheduled with setImmediate after the
//   result is returned, every step wrapped, nothing is ever rethrown;
// - only premium, consented, user-initiated calls: requires the per-request
//   AI call context (set by the tRPC middleware / Express AI routes; absent
//   in workers and sweeps), premium=true, and AI data consent;
// - bounded: at most MAX_IN_FLIGHT shadow calls at once (the rest are skipped).

const MAX_IN_FLIGHT = 2;

export interface ShadowRunnerOptions {
  /** Candidate service per shadowed workload (a chain built from AI_SHADOW_ROUTE). */
  candidates: Map<AiWorkload, { chain: string; service: IAIService }>;
  /** 0..1 share of eligible calls to replay. */
  sample: number;
  /** AI data consent for the user (PR #45). Errors count as "no". */
  hasConsent: (userId: string) => Promise<boolean>;
  random?: () => number;
  schedule?: (task: () => void) => void;
  maxInFlight?: number;
}

export class ShadowRunner implements ShadowHook {
  private inFlight = 0;
  private readonly random: () => number;
  private readonly schedule: (task: () => void) => void;
  private readonly maxInFlight: number;

  constructor(private readonly options: ShadowRunnerOptions) {
    this.random = options.random ?? Math.random;
    this.schedule = options.schedule ?? ((task) => setImmediate(task));
    this.maxInFlight = options.maxInFlight ?? MAX_IN_FLIGHT;
  }

  /** Synchronous, cheap, never throws: decides, then schedules the replay. */
  observe(observation: ShadowObservation): void {
    try {
      const candidate = this.options.candidates.get(observation.workload);
      if (!candidate || this.options.sample <= 0) return;
      const context = getAiCallContext();
      // No context = background job; shadow calls never shadow themselves.
      if (!context || context.shadow || !context.premium) return;
      if (this.random() >= this.options.sample) return;
      if (this.inFlight >= this.maxInFlight) return;
      this.inFlight++;
      const userId = context.userId;
      // The replay runs outside the user's request context (so nothing it
      // triggers looks like a user call), tagged as a shadow call instead.
      runOutsideAiCallContext(() =>
        this.schedule(() => {
          void this.replay(observation, candidate, userId).finally(() => {
            this.inFlight--;
          });
        }),
      );
    } catch {
      // Never let shadow mode touch the user's request.
    }
  }

  private async replay(
    observation: ShadowObservation,
    candidate: { chain: string; service: IAIService },
    userId: string,
  ): Promise<void> {
    try {
      const consent = await this.options.hasConsent(userId).catch(() => false);
      if (!consent) return;

      let inputTokens = 0;
      let outputTokens = 0;
      const started = Date.now();
      let output: unknown;
      let error: string | undefined;
      const unsubscribe = onAiUsage((u) => {
        if (!u.shadow) return;
        inputTokens += u.inputTokens ?? 0;
        outputTokens += u.outputTokens ?? 0;
      });
      try {
        output = await runWithAiCallContext({ userId, premium: true, shadow: true }, () =>
          observation.invoke(candidate.service),
        );
      } catch (err) {
        error = (err instanceof Error ? err.message : String(err)).slice(0, 300);
      } finally {
        unsubscribe();
      }

      logAiShadow({
        workload: observation.workload,
        op: observation.op,
        primary: {
          servedBy: observation.servedBy,
          ms: observation.ms,
          scores: toShadowScores(scoreLiveCall(observation, observation.result)),
        },
        candidate: {
          chain: candidate.chain,
          ms: Date.now() - started,
          ok: error === undefined,
          error,
          scores:
            error === undefined ? toShadowScores(scoreLiveCall(observation, output)) : undefined,
          inputTokens: inputTokens || undefined,
          outputTokens: outputTokens || undefined,
        },
      });
    } catch (err) {
      console.warn('[ai.shadow] replay failed (ignored):', err);
    }
  }
}

function toShadowScores(scores: CaseScores): AiShadowScores {
  return {
    schemaValid: scores.schemaValid,
    allergenViolations: scores.allergenViolations,
    kcalErrorPct: scores.kcalErrorPct,
    macroErrorPct: scores.macroErrorPct,
  };
}

/**
 * Scores a live output with the eval scorers. Live calls carry no golden
 * label, so extraction/photo scores are schema + (for plans, swaps and
 * cheferize) allergen checks against the user's own preferences.
 */
export function scoreLiveCall(
  observation: Pick<ShadowObservation, 'op' | 'input'>,
  output: unknown,
): CaseScores {
  // ChainAIService pairs every op label with its own input type, so the
  // label narrows `input` (the observation carries it as unknown).
  const input = observation.input;
  switch (observation.op) {
    case 'generateMealPlan':
      return scoreMealPlan(input as MealPlanInput, output);
    case 'generateRecipeSwap':
      return scoreSwap((input as SwapInput).preferences, output);
    case 'cheferizeRecipe':
      return scoreCheferize(input as CheferizeInput, output);
    case 'extractRecipe':
      return scoreExtraction({}, output);
    case 'extractRecipeAnnotated':
      return scoreExtraction({}, (output as AnnotatedExtraction | undefined)?.recipe);
    case 'analyzeMealPhoto':
      return scorePhoto({}, output);
    case 'generateShoppingList':
      return scoreShopping(input as ShoppingListInput, output);
    case 'generateReviewText':
      return scoreReview(output);
    case 'estimateIngredientPrices':
      return scorePrices(input as string[], {}, output);
    default:
      // Anything new: presence only until it gets a scorer.
      return {
        schemaValid: output !== undefined && output !== null,
        allergenViolations: 0,
        restrictionViolations: 0,
        checks: {},
      };
  }
}
