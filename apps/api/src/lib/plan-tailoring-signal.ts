// ─── Live-tailoring wake-up signal ────────────────────────────────────────────
// MealPlanService queues tailoring jobs; PlanTailoringWorker runs them. The
// worker imports the service (through PlanTailoringService), so the service
// cannot import the worker back without an import cycle — it rings this
// bell instead. The worker registers itself on start; with no worker
// running (tests, scripts) a notify is a no-op and the job simply waits for
// the next poll.

let listener: (() => void) | null = null;

/** Registers the one wake-up handler (the worker); null unregisters. */
export function onTailoringQueued(handler: (() => void) | null): void {
  listener = handler;
}

/** A job was queued or resumed — start it now instead of at the next poll. */
export function notifyTailoringQueued(): void {
  try {
    listener?.();
  } catch (err) {
    console.error('[tailoring] wake-up handler threw (ignored):', err);
  }
}
