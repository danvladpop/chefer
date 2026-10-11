// AsyncLocalStorage is stable since Node 16.4; the plugin assumes >=16.0 because
// this package declares no engines (the repo requires Node >=20).
// eslint-disable-next-line n/no-unsupported-features/node-builtins
import { AsyncLocalStorage } from 'node:async_hooks';

// ─── AI call context ──────────────────────────────────────────────────────────
// Who an AI call is for, without threading a parameter through IAIService.
// Set by the tRPC middleware and the Express AI routes for authenticated user
// requests; background jobs (workers, sweeps) never set it. Shadow mode reads
// it and runs ONLY when a context is present and says premium — so free
// users' calls and background jobs are never shadowed (fail-closed: no
// context = no shadow). Env-free.

export interface AiCallContext {
  userId: string;
  /** Premium (or admin) — per-user AI is premium-only (owner decision). */
  premium: boolean;
  /** Set on calls made BY shadow mode itself: usage lines are tagged, no recursion. */
  shadow?: boolean;
}

const storage = new AsyncLocalStorage<AiCallContext>();

/** Runs `fn` with `context` visible to every AI call it makes (sync or async). */
export function runWithAiCallContext<T>(context: AiCallContext, fn: () => T): T {
  return storage.run(context, fn);
}

/** The context of the current user request, or undefined (background job). */
export function getAiCallContext(): AiCallContext | undefined {
  return storage.getStore();
}

/**
 * Runs `fn` with NO context. Timers and detached promises inherit the context
 * they were created in, so a worker woken from inside a user request would
 * otherwise look like that user's request.
 */
export function runOutsideAiCallContext<T>(fn: () => T): T {
  // The usage scope below is left too: a worker woken from a billed request
  // must not charge its background calls to that user.
  return storage.exit(() => usageScopeStorage.exit(fn));
}

// ─── AI usage scope (Phase 2 cost tracking) ──────────────────────────────────
// Who a model call is BILLED to and which routing workload it served, for the
// usage recorder (usage-recorder.ts). Deliberately a separate store from the
// call context above: setting it changes nothing about how a call runs (no
// shadow sampling, no interactive-vs-background 429 handling) — it only
// labels the usage row. Nested scopes merge: an inner scope keeps the outer
// one's fields it does not set.

export interface AiUsageScope {
  /**
   * The user to charge. Set for per-user work that runs without a request
   * context (the plan-tailoring worker, the Sunday auto-plan, the /api/chat
   * route); `null` explicitly marks system work.
   */
  billedUserId?: string | null;
  /** The routing workload (routing.ts AiWorkload), set by the provider chain. */
  workload?: string;
}

const usageScopeStorage = new AsyncLocalStorage<AiUsageScope>();

/** Runs `fn` with `scope` merged over the current usage scope. */
export function runWithAiUsageScope<T>(scope: AiUsageScope, fn: () => T): T {
  return usageScopeStorage.run({ ...usageScopeStorage.getStore(), ...scope }, fn);
}

/** The current usage scope, or undefined. */
export function getAiUsageScope(): AiUsageScope | undefined {
  return usageScopeStorage.getStore();
}

/**
 * The user a model call made right now is charged to: the usage scope's
 * `billedUserId` when one is set, else the signed-in request's user, else
 * null (system). Shadow replays are never charged to anyone — they are our
 * experiment, not the user's request.
 */
export function currentBilledUserId(): string | null {
  const context = getAiCallContext();
  if (context?.shadow) return null;
  const scope = usageScopeStorage.getStore();
  if (scope?.billedUserId !== undefined) return scope.billedUserId;
  return context?.userId ?? null;
}
