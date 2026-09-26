import { getAiCallContext } from './call-context.js';

// ─── AI usage logging (audit P0-5 groundwork) ─────────────────────────────────
// One structured line per model call: provider, model, operation, tokens and
// latency. Before moving text AI off Gemini's free tier, this is what tells us
// the real per-feature token volume (the research doc's estimates were
// derived from prompt sizes, not measured) and lets a cost dashboard be built
// from logs alone — no schema change. Plain console (one JSON line with a
// stable "[ai.usage]" prefix) rather than the pino logger: provider modules
// must stay importable without the full env (tests, scripts).

export interface AiUsage {
  provider: string;
  model: string;
  /** The IAIService operation, e.g. generateMealPlan or chat. */
  op: string;
  inputTokens?: number | undefined;
  outputTokens?: number | undefined;
  ms: number;
  /** True when the call was made by shadow mode (never served to a user). */
  shadow?: boolean | undefined;
}

type UsageListener = (usage: AiUsage) => void;
const listeners = new Set<UsageListener>();

export function logAiUsage(usage: AiUsage): void {
  const record: AiUsage = getAiCallContext()?.shadow ? { ...usage, shadow: true } : usage;
  console.info(`[ai.usage] ${JSON.stringify(record)}`);
  for (const listener of listeners) {
    try {
      listener(record);
    } catch {
      // A listener (eval harness token counter) must never break a model call.
    }
  }
}

/** Subscribes to usage records (eval harness token counting). Returns an unsubscribe. */
export function onAiUsage(listener: UsageListener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

// ─── Shadow-mode scores (research §5.4 step 3) ───────────────────────────────
// One "[ai.shadow]" line per sampled call: what served the user, what the
// candidate chain did with the same input, and eval-style scores for both.
// The candidate's own model calls also log "[ai.usage]" lines with shadow:true.

export interface AiShadowScores {
  schemaValid: boolean;
  allergenViolations?: number | undefined;
  kcalErrorPct?: number | undefined;
  macroErrorPct?: number | undefined;
}

export interface AiShadowRecord {
  workload: string;
  op: string;
  primary: { servedBy: string; ms: number; scores: AiShadowScores };
  candidate: {
    chain: string;
    servedBy?: string | undefined;
    ms: number;
    ok: boolean;
    error?: string | undefined;
    scores?: AiShadowScores | undefined;
    inputTokens?: number | undefined;
    outputTokens?: number | undefined;
  };
}

export function logAiShadow(record: AiShadowRecord): void {
  console.info(`[ai.shadow] ${JSON.stringify(record)}`);
}
