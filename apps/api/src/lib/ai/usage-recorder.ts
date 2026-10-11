import type { CreateAiUsageEventData } from '@chefer/database';
import { currentBilledUserId, getAiUsageScope } from './call-context.js';
import { estimateCostMicroUsd } from './pricing.js';
import { onAiUsage, type AiUsage } from './usage.js';

// ─── AI usage recorder (Phase 2 cost tracking) ────────────────────────────────
// Turns every "[ai.usage]" record (one per REAL provider call — usage.ts) into
// an AiUsageEvent row with its estimated cost (pricing.ts). Every client logs
// usage as soon as the provider answered with a usage block, BEFORE its own
// validation, so a reply that is later rejected (a repair retry, a failover
// after a schema failure) is still recorded against the provider and model
// that actually spent the tokens. Calls that failed with no usage (HTTP 4xx/
// 5xx, timeouts) report nothing and cost nothing.
//
// Fire-and-forget: the listener runs synchronously inside the model call, so
// it only builds the row and hands the insert to a detached promise — a slow
// or failing database never slows or fails the user's request.

/** Workload for calls made outside the provider chain (single provider, Whisper, images). */
export function workloadForOp(op: string): string | null {
  if (op.startsWith('generateMealPlan')) return 'mealPlan';
  if (op === 'generateRecipeSwap' || op === 'repairRecipeLines') return 'swap';
  if (op === 'cheferizeRecipe') return 'cheferize';
  if (op.startsWith('extractRecipe')) return 'importText';
  if (op === 'analyzeMealPhoto') return 'vision';
  if (op.startsWith('chat')) return 'chat';
  if (op === 'generateReviewText') return 'review';
  if (op === 'estimateIngredientPrices') return 'prices';
  if (op === 'transcribe') return 'transcription';
  if (op === 'recipeImage') return 'recipeImage';
  return null;
}

const count = (n: number | undefined): number =>
  typeof n === 'number' && Number.isFinite(n) && n > 0 ? Math.round(n) : 0;

/** Pure: the row for one usage record, given who it is billed to and its workload. */
export function toUsageEvent(
  usage: AiUsage,
  attribution: { userId: string | null; workload: string | null },
  warn?: (message: string) => void,
): CreateAiUsageEventData {
  return {
    userId: usage.shadow ? null : attribution.userId,
    operation: usage.op,
    workload: attribution.workload ?? workloadForOp(usage.op),
    provider: usage.provider,
    model: usage.model,
    inputTokens: count(usage.inputTokens),
    cachedInputTokens: count(usage.cachedInputTokens),
    outputTokens: count(usage.outputTokens),
    reasoningTokens: count(usage.reasoningTokens),
    audioSeconds: usage.audioSeconds ?? null,
    images: usage.images ?? null,
    costMicroUsd: estimateCostMicroUsd(usage, warn),
    shadow: usage.shadow === true,
  };
}

export interface AiUsageRecorderDeps {
  /** Persists one row (aiUsageRepository.create). Its failure is logged, never thrown. */
  write: (event: CreateAiUsageEventData) => Promise<unknown>;
  /** Told about every row synchronously (the budget's in-memory running totals). */
  onRecorded?: (event: CreateAiUsageEventData) => void;
  warn?: (message: string) => void;
  error?: (message: string, err: unknown) => void;
}

/** Subscribes the recorder to usage records. Returns an unsubscribe. */
export function startAiUsageRecording(deps: AiUsageRecorderDeps): () => void {
  const error = deps.error ?? ((m, e) => console.error(m, e));
  return onAiUsage((usage) => {
    let event: CreateAiUsageEventData;
    try {
      event = toUsageEvent(
        usage,
        { userId: currentBilledUserId(), workload: getAiUsageScope()?.workload ?? null },
        deps.warn,
      );
      deps.onRecorded?.(event);
    } catch (err) {
      error('[ai.usage] could not build the usage row (ignored)', err);
      return;
    }
    void Promise.resolve()
      .then(() => deps.write(event))
      .catch((err: unknown) => error('[ai.usage] could not record AI usage (ignored)', err));
  });
}
