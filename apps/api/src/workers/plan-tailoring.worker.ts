import {
  planTailoringService,
  type PlanTailoringService,
} from '../application/meal-plan/plan-tailoring.service.js';
import { runOutsideAiCallContext } from '../lib/ai/call-context.js';
import { onTailoringQueued } from '../lib/plan-tailoring-signal.js';

// ─── Live plan tailoring worker ───────────────────────────────────────────────
// Premium generation returns a curated week instantly and queues a
// MealPlanTailoring job; this worker replaces the week's days with AI days,
// one day per step, today first (PlanTailoringService). Modelled on
// RecipeImageWorker: DB-polled (a restart loses nothing — the queue is in
// the database and a crashed step's lease simply lapses), woken immediately
// when a job is queued, one step at a time across all users (the free AI
// tier rate-limits; jobs interleave fairly by nextRunAt), graceful stop that
// waits for the in-flight day.

const POLL_INTERVAL_MS = 5_000;

export class PlanTailoringWorker {
  private timer: NodeJS.Timeout | null = null;
  private running = false;
  private stopping = false;
  private inFlight: Promise<void> | null = null;
  /** A wake-up that arrived mid-pass: look again before the pass ends. */
  private rerun = false;

  constructor(
    private readonly service: Pick<PlanTailoringService, 'runNext'> = planTailoringService,
  ) {}

  start(): void {
    if (this.timer) return;
    this.stopping = false;
    onTailoringQueued(() => this.wake());
    console.log('[PlanTailoringWorker] started');
    this.timer = setInterval(() => this.wake(), POLL_INTERVAL_MS);
    this.wake();
  }

  /**
   * Runs a pass now. Called when a job is queued — possibly from inside a
   * user's request, whose AI call context a detached promise would inherit
   * (and look like that user's interactive call); the pass runs outside it.
   */
  wake(): void {
    if (this.stopping) return;
    runOutsideAiCallContext(() => {
      void this.tick();
    });
  }

  async stop(): Promise<void> {
    this.stopping = true;
    onTailoringQueued(null);
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
    if (this.inFlight) {
      console.log('[PlanTailoringWorker] waiting for the in-flight day to finish…');
      await this.inFlight;
    }
    console.log('[PlanTailoringWorker] stopped');
  }

  /** Exposed for tests — drains every due step, one at a time. */
  async tick(): Promise<void> {
    if (this.running) {
      this.rerun = true;
      return;
    }
    this.running = true;
    try {
      for (;;) {
        if (this.stopping) break;
        const step = this.service.runNext();
        this.inFlight = step.then(
          () => undefined,
          () => undefined,
        );
        if (!(await step)) {
          if (!this.rerun) break;
          this.rerun = false;
        }
      }
    } catch (err) {
      console.error('[PlanTailoringWorker] tick error', err);
    } finally {
      this.inFlight = null;
      this.running = false;
    }
  }
}

export const planTailoringWorker = new PlanTailoringWorker();
