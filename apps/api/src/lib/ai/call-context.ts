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
  return storage.exit(fn);
}
