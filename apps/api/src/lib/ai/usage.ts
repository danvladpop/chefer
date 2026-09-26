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
}

export function logAiUsage(usage: AiUsage): void {
  console.info(`[ai.usage] ${JSON.stringify(usage)}`);
}
