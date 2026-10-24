// ─── Progress hooks (docs/gamification-2026-10/tech-plan.md §4.2) ─────────────
// What the tracker, gym-sync and shopping services call after their own write.
// They depend on this interface and this light module only: the real recorder
// (and everything it loads) is imported on first use, and tests swap in a
// no-op or a spy with `setProgressRecorder`. Recording happens for EVERY user,
// whatever the `gamification` flag says (D1).

export interface IProgressRecorder {
  /** Re-reads the tracker day and records its meals, full day and protein goal. */
  onDayChanged(userId: string, date: string): Promise<void>;
  /** Records the finished workouts (and their PRs) among these session ids. */
  onWorkoutsCompleted(userId: string, sessionIds: string[]): Promise<void>;
  /** Records the shopping list as done when every item of the plan's list is checked. */
  onShoppingToggled(userId: string, planId: string, localDate: string | undefined): Promise<void>;
}

export const noopProgressRecorder: IProgressRecorder = {
  onDayChanged: () => Promise.resolve(),
  onWorkoutsCompleted: () => Promise.resolve(),
  onShoppingToggled: () => Promise.resolve(),
};

async function real(): Promise<IProgressRecorder> {
  return (await import('./progress-recorder.js')).progressRecorder;
}

/** Resolves the real recorder on first call, so importing a hook costs nothing. */
const lazyRecorder: IProgressRecorder = {
  onDayChanged: async (userId, date) => (await real()).onDayChanged(userId, date),
  onWorkoutsCompleted: async (userId, ids) => (await real()).onWorkoutsCompleted(userId, ids),
  onShoppingToggled: async (userId, planId, localDate) =>
    (await real()).onShoppingToggled(userId, planId, localDate),
};

let current: IProgressRecorder = lazyRecorder;

/** Tests: swap the recorder (`null` restores the real one). */
export function setProgressRecorder(recorder: IProgressRecorder | null): void {
  current = recorder ?? lazyRecorder;
}

export function getProgressRecorder(): IProgressRecorder {
  return current;
}

/**
 * Runs one hook after the parent write. Awaited, so the client's next
 * `progress.inbox` read sees the reward; any error is logged and swallowed,
 * because a progress failure must never fail a log, a sync or a check-off.
 */
export async function notifyProgress(
  hook: string,
  userId: string,
  run: (recorder: IProgressRecorder) => Promise<void>,
  recorder: IProgressRecorder = current,
): Promise<void> {
  try {
    await run(recorder);
  } catch (err) {
    // Loaded here, not at the top: this module is imported by test setup and by
    // services that must stay free of the env/logger graph until something fails.
    try {
      const { logger } = await import('../../lib/logger.js');
      logger.warn({ err, userId, hook }, 'progress hook failed (the parent write is unaffected)');
    } catch {
      console.warn('[progress] hook failed (the parent write is unaffected):', hook, err);
    }
  }
}
