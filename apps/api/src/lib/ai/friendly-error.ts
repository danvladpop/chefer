import { TRPCError } from '@trpc/server';

// ─── Friendly AI-failure mapping (premium_plan.md §4.5.2) ────────────────────
// Upstream AI failures (free-tier 429s, 5xx, timeouts) must never reach the
// user as a raw provider error blob — the import sheet used to render the
// whole 429 JSON. Services wrap their IAIService calls with toFriendlyAiError:
// the raw error goes to the server log, the client gets one calm sentence.

/** Transient/capacity failures — the "try again in a minute" family. */
export const AI_OVER_CAPACITY_MESSAGE =
  'The chef is over capacity right now — give it a minute and try again.';

/**
 * Mirrors gemini.ts#isTransientAiError (429/500/503) plus the failure shapes
 * that never carry a status: network timeouts and aborted fetches.
 */
export function isCapacityAiError(err: unknown): boolean {
  const status = (err as { status?: number } | null)?.status;
  if (status === 429 || status === 500 || status === 502 || status === 503 || status === 504) {
    return true;
  }
  if (err instanceof Error) {
    if (err.name === 'AbortError' || err.name === 'TimeoutError') return true;
    return /timed? ?out|ETIMEDOUT|ECONNRESET|fetch failed|overloaded|RESOURCE_EXHAUSTED|UNAVAILABLE/i.test(
      err.message,
    );
  }
  return false;
}

/**
 * A capacity failure at any layer: the raw upstream error, or the friendly
 * SERVICE_UNAVAILABLE TRPCError a service already turned it into. Callers
 * use it to refund a quota reservation (the user did nothing wrong) and
 * background jobs to back off instead of hammering an exhausted provider.
 */
export function isAiCapacityFailure(err: unknown): boolean {
  if (err instanceof TRPCError) return err.code === 'SERVICE_UNAVAILABLE';
  return isCapacityAiError(err);
}

/**
 * Converts an upstream AI failure into a user-presentable TRPCError.
 * TRPCErrors pass through untouched (quota/validation errors already carry
 * friendly copy); everything else is logged raw and replaced with either the
 * over-capacity message (transient failures → SERVICE_UNAVAILABLE) or the
 * caller's task-specific fallback (→ INTERNAL_SERVER_ERROR).
 */
export function toFriendlyAiError(err: unknown, label: string, fallbackMessage: string): TRPCError {
  if (err instanceof TRPCError) return err;
  console.error(`[AI] ${label} failed:`, err);
  if (isCapacityAiError(err)) {
    return new TRPCError({
      code: 'SERVICE_UNAVAILABLE',
      message: AI_OVER_CAPACITY_MESSAGE,
      cause: err,
    });
  }
  return new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: fallbackMessage, cause: err });
}
