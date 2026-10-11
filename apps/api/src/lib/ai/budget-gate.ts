// ─── AI budget gates (Phase 2 cost tracking) ──────────────────────────────────
// The two questions every AI spender asks before spending:
//   - a user-initiated action (lib/quotas.ts, the plan-generation fallback):
//     "may THIS user start AI work?" — no when their month is over
//     AI_USER_MONTHLY_HARD_USD or today's global spend is over
//     AI_GLOBAL_DAILY_USD;
//   - background AI (ingredient-price worker, live plan tailoring, the Sunday
//     auto-plan, Cloudflare recipe images): "may background AI spend today?"
//
// The answers come from the API's budget module (lib/ai-budget), installed at
// startup. This module stays env-free so the quota code, workers and provider
// clients can import it in tests: no gates installed (tests, scripts) = always
// allowed. A gate that throws (the DB is down) also answers allowed — the
// budget is a cost guard, not a dependency that may take every AI feature
// down with it.

export interface AiBudgetBlock {
  reason: 'user_monthly' | 'global_daily';
  /** Friendly, user-facing sentence (shown verbatim by web and mobile). */
  message: string;
}

export interface AiBudgetGates {
  /** Null = allowed; otherwise why this user's new AI action is refused. */
  user(userId: string): Promise<AiBudgetBlock | null>;
  /** Whether background AI may spend right now. */
  background(): Promise<boolean>;
}

let gates: AiBudgetGates | null = null;

/** Installs (or with null, removes) the gates. */
export function setAiBudgetGates(next: AiBudgetGates | null): void {
  gates = next;
}

/** Why `userId` may not start AI work right now, or null. Never throws. */
export async function checkUserAiBudget(userId: string): Promise<AiBudgetBlock | null> {
  if (!gates) return null;
  try {
    return await gates.user(userId);
  } catch (err) {
    console.warn('[ai.budget] user budget check failed — allowing', err);
    return null;
  }
}

/** Whether background AI may spend right now. Never throws. */
export async function backgroundAiAllowed(): Promise<boolean> {
  if (!gates) return true;
  try {
    return await gates.background();
  } catch (err) {
    console.warn('[ai.budget] background budget check failed — allowing', err);
    return true;
  }
}
