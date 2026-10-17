// ─── Recipe-image wake-up signal ─────────────────────────────────────────────
// Recipe saves (imports, "Generate with AI") queue a PENDING image; the
// RecipeImageWorker generates it. Importing the worker would pull the image
// provider (and env validation) into every module that imports those
// services, so they ring this bell instead. The worker registers itself on
// start; with no worker running (tests, scripts) a notify is a no-op and the
// image waits for the next poll.

let listener: (() => void) | null = null;

/** Registers the one wake-up handler (the worker); null unregisters. */
export function onRecipeImageQueued(handler: (() => void) | null): void {
  listener = handler;
}

/** A recipe image was queued — generate it now instead of at the next poll. */
export function notifyRecipeImageQueued(): void {
  try {
    listener?.();
  } catch (err) {
    console.error('[recipe-image] wake-up handler threw (ignored):', err);
  }
}
