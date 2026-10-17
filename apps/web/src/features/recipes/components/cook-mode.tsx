'use client';

import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useCallback, useEffect, useRef, useState } from 'react';
import { RebalanceBanner } from '@/features/meal-plan/components/RebalanceBanner';
import { StarRatingWidget } from '@/features/recipe/components/StarRatingWidget';
import {
  handleRebalanceOutcome,
  REBALANCE_PREVIEW,
} from '@/features/tracker/lib/rebalance-storage';
import { useCookingFor } from '@/hooks/useCookingFor';
import { useHousehold } from '@/hooks/useHousehold';
import { useUnitSystem } from '@/hooks/useUnitSystem';
import { capture } from '@/lib/analytics';
import { trackMealLogged } from '@/lib/analytics-events';
import { trpc } from '@/lib/trpc';
import { useQueryState } from '@/lib/use-query-state';
import {
  Check,
  ChefHat,
  ChevronLeft,
  ChevronRight,
  ListChecks,
  Minus,
  Pause,
  Play,
  Plus,
  RotateCcw,
  Timer,
  X,
} from 'lucide-react';
import { Drawer, ErrorState } from '@chefer/ui';
import {
  clampCookServings,
  defaultCookServings,
  formatCookTimer,
  formatFractionalQuantity,
  formatQuantity,
  isNotFoundError,
  parseServingsParam,
  slotPortion,
  stepIngredientAmounts,
} from '@chefer/utils';
import { AllergenWarningBanner } from './AllergenWarning';
import {
  guessMealType,
  isSpaceOwnedByTarget,
  parseStepDuration,
  shouldIgnoreCookModeKey,
} from './cook-mode-utils';
import { useCookTimers, type CookTimerView } from './use-cook-timers';

// ─── Cook mode (P1-3) ─────────────────────────────────────────────────────────
// Full-screen, one-instruction-at-a-time stepper: the product finally follows
// the user into the kitchen. Finishing logs the meal to today's tracker AND
// opens the star rating — closing the tracking loop and the P1-1
// personalisation loop in one tap. A `servings` query param (the recipe page's
// stepper, UX-COOK-05) wins over the household default; step timers are
// absolute `endsAt` stamps held here (UX-COOK-01); each step lists its own
// ingredient amounts (UX-COOK-04).

const MEAL_SLOTS = [
  { value: 'breakfast', label: 'Breakfast' },
  { value: 'lunch', label: 'Lunch' },
  { value: 'dinner', label: 'Dinner' },
  { value: 'snack', label: 'Snack' },
] as const;
type MealSlot = (typeof MEAL_SLOTS)[number]['value'];

const isMealSlot = (value: string | null | undefined): value is MealSlot =>
  MEAL_SLOTS.some((slot) => slot.value === value);

function todayIso(): string {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

const KBD_CLS =
  'rounded border border-gray-300 bg-gray-50 px-1.5 py-0.5 font-sans text-xs font-medium text-gray-700';

// ── Inline step timer ─────────────────────────────────────────────────────────

function StepTimer({
  view,
  onToggle,
  onReset,
  shortcutsEnabled,
}: {
  view: CookTimerView;
  onToggle: () => void;
  onReset: () => void;
  /** Space starts/pauses the timer (off while the ingredients drawer is open). */
  shortcutsEnabled: boolean;
}) {
  const { status, remainingSec } = view;
  const done = status === 'done';
  const running = status === 'running';

  // Space = start/pause (F-REC-6-5). Leaves Space alone on buttons/links,
  // where it natively activates the focused control.
  useEffect(() => {
    if (!shortcutsEnabled || done) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== ' ' && e.key !== 'Spacebar') return;
      if (shouldIgnoreCookModeKey(e) || isSpaceOwnedByTarget(e)) return;
      e.preventDefault(); // don't scroll the page
      if (!e.repeat) onToggle();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [shortcutsEnabled, done, onToggle]);

  return (
    <div
      className={`mt-6 flex items-center justify-center gap-3 rounded-2xl border px-4 py-3 ${
        done ? 'border-emerald-300 bg-emerald-50' : 'border-[#944a00]/20 bg-[#fff3e8]'
      }`}
    >
      <Timer className={`h-5 w-5 ${done ? 'text-emerald-600' : 'text-[#944a00]'}`} />
      <span
        className={`font-mono text-2xl font-bold tabular-nums ${
          done ? 'text-emerald-700' : 'text-[#944a00]'
        }`}
      >
        {done ? 'Done!' : formatCookTimer(remainingSec)}
      </span>
      {!done && (
        <button
          onClick={onToggle}
          aria-label={running ? 'Pause timer' : 'Start timer'}
          className="flex h-11 w-11 items-center justify-center rounded-full bg-[#944a00] text-white hover:bg-[#7a3d00]"
        >
          {running ? <Pause className="h-5 w-5" /> : <Play className="ml-0.5 h-5 w-5" />}
        </button>
      )}
      <button
        onClick={onReset}
        aria-label="Reset timer"
        className="flex h-11 w-11 items-center justify-center rounded-full border border-gray-200 text-gray-500 hover:bg-gray-50"
      >
        <RotateCcw className="h-4 w-4" />
      </button>
    </div>
  );
}

// ── Cook mode ─────────────────────────────────────────────────────────────────

export function CookMode({ recipeId }: { recipeId: string }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const unitSystem = useUnitSystem();
  const mealParam = searchParams.get('meal');
  const guessedSlot = guessMealType();
  const initialSlot: MealSlot = isMealSlot(mealParam)
    ? mealParam
    : isMealSlot(guessedSlot)
      ? guessedSlot
      : 'dinner';
  // P1-1: cooking a portioned plan slot starts at that portion and logs it.
  const planPortion = slotPortion(parseFloat(searchParams.get('portion') ?? ''));

  const recipeQuery = trpc.mealPlan.getRecipe.useQuery({ recipeId });
  const { data: recipe } = recipeQuery;
  // UX-COOK-03: a failed load used to spin forever with no way out.
  const recipeState = useQueryState(recipeQuery);
  // F2: with household members, cooking defaults to the whole table's
  // portion sum (the same number generation scaled the plan's servings to).
  const { scaledMembers } = useHousehold();
  const cookingFor = useCookingFor();

  const [step, setStep] = useState(0);
  const [finished, setFinished] = useState(false);
  // UX-PO-02: once per cook, whichever control ends it (Next on the last step,
  // the swipe or the arrow key all land on the finish screen).
  const finishedTracked = useRef(false);
  useEffect(() => {
    if (!finished || finishedTracked.current) return;
    finishedTracked.current = true;
    capture('cook_finished', {});
  }, [finished]);
  // UX-COOK-05: the recipe page's chosen servings, when it passed any.
  const [servings, setServings] = useState<number | null>(() =>
    parseServingsParam(searchParams.get('servings')),
  );
  // UX-COOK-04: the slot "Made it!" files the meal under — chosen, not guessed.
  const [slot, setSlot] = useState<MealSlot>(initialSlot);
  const [loggedAs, setLoggedAs] = useState<{ date: string; slot: MealSlot } | null>(null);
  const cookTimers = useCookTimers(recipeQuery.data?.name ?? '');
  const [checkedIngredients, setCheckedIngredients] = useState<Set<number>>(new Set());
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [logged, setLogged] = useState(false);

  const baseServings = recipe?.servings ?? 1;
  const selectedServings =
    servings ?? defaultCookServings(baseServings, scaledMembers, planPortion, cookingFor);
  const scale = selectedServings / baseServings;

  // ── Wake lock: the screen must survive a 10-step recipe (feature-detect,
  // degrade silently — Safari < 16.4 and desktop Firefox have no wakeLock).
  useEffect(() => {
    let lock: { release: () => Promise<void> } | null = null;
    let cancelled = false;
    const acquire = async () => {
      try {
        const wl = (
          navigator as unknown as { wakeLock?: { request(type: 'screen'): Promise<never> } }
        ).wakeLock;
        if (!wl) return;
        const sentinel = await wl.request('screen');
        if (cancelled) void (sentinel as { release(): Promise<void> }).release();
        else lock = sentinel;
      } catch {
        // Denied (low battery, background tab) — cooking continues without it.
      }
    };
    void acquire();
    // The lock is released automatically when the tab is hidden — reacquire
    // when the user comes back mid-recipe.
    const onVisible = () => {
      if (document.visibilityState === 'visible') void acquire();
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      cancelled = true;
      document.removeEventListener('visibilitychange', onVisible);
      void lock?.release().catch(() => undefined);
    };
  }, []);

  // ── Swipe navigation (left = next, right = back) ──
  const touchStartX = useRef<number | null>(null);
  const onTouchStart = (e: React.TouchEvent) => {
    touchStartX.current = e.touches[0]?.clientX ?? null;
  };
  const onTouchEnd = (e: React.TouchEvent) => {
    const startX = touchStartX.current;
    touchStartX.current = null;
    if (startX === null || !recipe) return;
    const delta = (e.changedTouches[0]?.clientX ?? startX) - startX;
    if (Math.abs(delta) < 60) return;
    const last = recipe.instructions.length - 1;
    if (delta < 0 && step < last) setStep((s) => Math.min(last, s + 1));
    if (delta < 0 && step === last) setFinished(true);
    if (delta > 0 && step > 0) setStep((s) => Math.max(0, s - 1));
  };

  // ── "Made it!": append to today's log, then rate ──
  const utils = trpc.useUtils();
  const upsertDay = trpc.tracker.logRecipe.useMutation({
    meta: { silent: true },
    onSuccess: (result, variables) => {
      setLogged(true);
      setLoggedAs({ date: variables.date, slot });
      capture('meal_cooked', { mealType: slot });
      // UX-PO-02: opened from a plan slot (`meal` param) = planned, else a quick log.
      trackMealLogged(isMealSlot(mealParam) ? 'planned' : 'quick', variables.mealType);
      // F4: a cook-mode log can trigger a week rebalance too — hand the swaps
      // off to the meal-plan banner (with undo).
      handleRebalanceOutcome(result);
      void utils.tracker.getDay.invalidate();
      void utils.tracker.weeklySummary.invalidate();
      void utils.dashboard.summary.invalidate();
    },
  });

  // UX-COOK-04: a tap on the wrong slot used to leave a second "lunch" in the
  // tracker until you found it there — the log can be taken back right here.
  const undoLog = trpc.tracker.unlogRecipe.useMutation({
    meta: { silent: true },
    onSuccess: () => {
      setLogged(false);
      setLoggedAs(null);
      void utils.tracker.getDay.invalidate();
      void utils.tracker.weeklySummary.invalidate();
      void utils.dashboard.summary.invalidate();
    },
  });

  // ── Keyboard: ← / → move between steps on desktop (F-REC-6-5). Space for
  // the timer lives in StepTimer. Off on the finish screen and while the
  // ingredients drawer has focus.
  const instructionCount = recipe?.instructions.length ?? 0;
  useEffect(() => {
    if (instructionCount === 0 || finished || drawerOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
      if (shouldIgnoreCookModeKey(e)) return;
      e.preventDefault();
      const current = Math.min(step, instructionCount - 1);
      if (e.key === 'ArrowRight') {
        // Mirrors the Next button: past the last step is the finish screen.
        if (current >= instructionCount - 1) setFinished(true);
        else setStep(current + 1);
      } else if (current > 0) {
        setStep(current - 1);
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [instructionCount, finished, drawerOpen, step]);

  const logMeal = useCallback(() => {
    if (!recipe || logged || upsertDay.isPending) return;
    // Server-side atomic append: never clobbers other entries, and a double
    // tap can't double-log (F-PM-1, F-TRK-1-2).
    upsertDay.mutate({
      ...REBALANCE_PREVIEW,
      date: todayIso(),
      recipeId: recipe.id,
      mealType: slot,
      // One serving eaten — cooking for 4 doesn't mean you ate 4×. A plan
      // slot sized to 1.5× means you ate 1.5 servings (P1-1).
      portionMultiplier: Math.min(2, Math.max(0.5, planPortion)),
    });
  }, [recipe, logged, upsertDay, slot, planPortion]);

  if (recipeState.state === 'error') {
    const notFound = isNotFoundError(recipeQuery.error);
    return (
      <div className="flex min-h-dvh flex-col items-center justify-center gap-3 bg-white px-6">
        {notFound ? (
          <p data-testid="cook-not-found" className="text-sm text-gray-500">
            Recipe not found.
          </p>
        ) : (
          <div data-testid="cook-load-error">
            <ErrorState title="Couldn't load this recipe" onRetry={recipeState.retry} />
          </div>
        )}
        <Link
          href="/recipes"
          data-testid="cook-error-close"
          className="flex min-h-11 items-center px-3 text-sm font-medium text-[#944a00] hover:underline"
        >
          Close
        </Link>
      </div>
    );
  }
  if (!recipe) {
    return (
      <div className="flex min-h-dvh items-center justify-center bg-white">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-[#944a00]/20 border-t-[#944a00]" />
      </div>
    );
  }

  const totalSteps = recipe.instructions.length;
  // A recipe with no steps has nothing to page through: no "Step 1 of 0" and
  // no NaN progress bar — the ingredient drawer is the content.
  const noSteps = totalSteps === 0;
  // Defensive clamp: batched rapid taps can momentarily overshoot the state.
  const safeStep = Math.max(0, Math.min(step, totalSteps - 1));
  const instruction = recipe.instructions[safeStep] ?? '';
  const timerSeconds = parseStepDuration(instruction);
  // UX-COOK-04: the amounts this step uses, scaled to the chosen servings.
  const stepAmounts = stepIngredientAmounts(instruction, recipe.ingredients, scale, unitSystem);
  const isLastStep = noSteps || safeStep === totalSteps - 1;

  // ── Finish screen ──
  if (finished) {
    return (
      <div className="flex min-h-dvh flex-col items-center justify-center gap-6 bg-white px-6 pb-safe text-center">
        <div className="flex h-20 w-20 items-center justify-center rounded-full bg-emerald-100">
          <ChefHat className="h-10 w-10 text-emerald-600" />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Enjoy your {recipe.name}!</h1>
          <p className="mt-1 text-sm text-gray-500">
            {logged
              ? `Logged to today's tracker as ${loggedAs?.slot ?? slot}.`
              : 'Log it to your tracker and tell the chef what you thought.'}
          </p>
        </div>

        {!logged ? (
          <div
            role="group"
            aria-label="Log it as"
            data-testid="cook-slot"
            className="flex flex-wrap justify-center gap-2"
          >
            {MEAL_SLOTS.map((option) => (
              <button
                key={option.value}
                type="button"
                aria-pressed={slot === option.value}
                onClick={() => setSlot(option.value)}
                className={`min-h-11 rounded-full border px-4 text-sm font-medium ${
                  slot === option.value
                    ? 'border-[#944a00] bg-[#944a00] text-white'
                    : 'border-gray-200 bg-white text-gray-700 hover:bg-gray-50'
                }`}
              >
                {option.label}
              </button>
            ))}
          </div>
        ) : null}
        {!logged ? (
          <button
            onClick={logMeal}
            disabled={upsertDay.isPending}
            className="flex min-h-12 items-center gap-2 rounded-2xl bg-[#944a00] px-8 text-base font-semibold text-white shadow-sm hover:bg-[#7a3d00] disabled:opacity-50"
          >
            <Check className="h-5 w-5" />
            {upsertDay.isPending ? 'Logging…' : 'Made it! Log this meal'}
          </button>
        ) : (
          <div className="w-full max-w-sm rounded-2xl border bg-white p-4 text-left shadow-sm">
            <p className="mb-2 text-sm font-semibold text-gray-800">How was it?</p>
            {/* Ratings feed next week's generation (P1-1) — say so. */}
            <p className="mb-3 text-xs text-gray-500">
              Your rating shapes what the chef cooks up next week.
            </p>
            <StarRatingWidget recipeId={recipe.id} />
          </div>
        )}
        {/* If logging this meal adjusted the rest of the week, say so here
            (audit F-TRK-3-2). */}
        {logged && (
          <div className="w-full max-w-sm text-left">
            <RebalanceBanner onUndone={() => void utils.mealPlan.invalidate()} />
          </div>
        )}
        {upsertDay.isError && (
          <p className="text-sm text-red-600">Could not log the meal — try again.</p>
        )}
        {logged && loggedAs ? (
          <button
            data-testid="cook-log-undo"
            onClick={() =>
              undoLog.mutate({
                date: loggedAs.date,
                recipeId: recipe.id,
                mealType: loggedAs.slot,
              })
            }
            disabled={undoLog.isPending}
            className="flex min-h-11 items-center rounded-xl border border-gray-200 px-4 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
          >
            Undo
          </button>
        ) : null}
        {undoLog.isError && (
          <p className="text-sm text-red-600">Could not undo that — try again.</p>
        )}

        <div className="flex items-center gap-4 text-sm">
          <button
            onClick={() => setFinished(false)}
            className="flex min-h-11 items-center px-1 text-gray-600 hover:underline"
          >
            Back to steps
          </button>
          <Link
            href={`/recipes/${recipe.id}`}
            className="flex min-h-11 items-center px-1 text-[#944a00] hover:underline"
          >
            Done
          </Link>
        </div>
      </div>
    );
  }

  // ── Stepper ──
  return (
    <div
      className="flex min-h-[calc(100dvh-4rem)] flex-col bg-white lg:min-h-dvh"
      onTouchStart={onTouchStart}
      onTouchEnd={onTouchEnd}
    >
      {/* Top bar: exit, title, servings, ingredients drawer */}
      <div className="flex items-center gap-2 border-b px-4 py-3">
        <button
          onClick={() => router.back()}
          aria-label="Exit cook mode"
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg text-gray-500 hover:bg-gray-100"
        >
          <X className="h-5 w-5" />
        </button>
        <p className="min-w-0 flex-1 truncate text-sm font-semibold text-gray-900">{recipe.name}</p>

        {/* Servings scaler */}
        <div className="flex shrink-0 items-center gap-1 rounded-full border border-gray-200 px-1">
          <button
            onClick={() => setServings(clampCookServings(selectedServings - 1))}
            aria-label="Fewer servings"
            className="flex h-11 w-11 items-center justify-center text-gray-500 hover:text-gray-900"
          >
            <Minus className="h-4 w-4" />
          </button>
          <span className="min-w-6 text-center text-sm font-semibold text-gray-800">
            {formatFractionalQuantity(selectedServings)}
          </span>
          <button
            onClick={() => setServings(clampCookServings(selectedServings + 1))}
            aria-label="More servings"
            className="flex h-11 w-11 items-center justify-center text-gray-500 hover:text-gray-900"
          >
            <Plus className="h-4 w-4" />
          </button>
        </div>

        <button
          onClick={() => setDrawerOpen(true)}
          aria-label="Show ingredients"
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg text-[#944a00] hover:bg-[#fff3e8]"
        >
          <ListChecks className="h-5 w-5" />
        </button>
      </div>

      {/* UX-COOK-01: every timer that is going (or has finished) stays in
          view whichever step you are reading; a click jumps to its step. */}
      {cookTimers.active.length > 0 && (
        <div data-testid="cook-timer-chips" className="mx-4 mt-3 flex flex-wrap gap-2">
          {cookTimers.active.map((t) => (
            <button
              key={t.step}
              type="button"
              data-testid={`cook-timer-chip-${t.step}`}
              onClick={() => setStep(t.step)}
              aria-label={
                t.status === 'done'
                  ? `Step ${t.step + 1} timer finished. Go to step`
                  : `Step ${t.step + 1} timer, ${formatCookTimer(t.remainingSec)} ${
                      t.status === 'paused' ? 'paused' : 'left'
                    }. Go to step`
              }
              className={`flex min-h-11 items-center gap-1.5 rounded-full border px-3 text-sm font-semibold tabular-nums ${
                t.status === 'done'
                  ? 'border-emerald-300 bg-emerald-50 text-emerald-700'
                  : 'border-[#944a00]/30 bg-[#fff3e8] text-[#944a00]'
              }`}
            >
              {t.status === 'done' ? (
                <Check className="h-4 w-4" aria-hidden="true" />
              ) : t.status === 'paused' ? (
                <Pause className="h-4 w-4" aria-hidden="true" />
              ) : (
                <Timer className="h-4 w-4" aria-hidden="true" />
              )}
              Step {t.step + 1} · {t.status === 'done' ? 'Done!' : formatCookTimer(t.remainingSec)}
            </button>
          ))}
        </div>
      )}

      {/* Allergen conflicts stay visible while cooking (F-REC-2-3) */}
      <AllergenWarningBanner warnings={recipe.allergenWarnings} className="mx-4 mt-3" />

      {/* Progress */}
      {!noSteps && (
        <div className="h-1.5 bg-gray-100">
          <div
            className="h-full bg-[#944a00] transition-all duration-300"
            style={{ width: `${((safeStep + 1) / totalSteps) * 100}%` }}
          />
        </div>
      )}

      {/* The step — large type, one instruction at a time */}
      <div className="flex flex-1 flex-col items-center justify-center px-6 py-8 text-center">
        {/* Announce each step change (button, swipe or keyboard). The timer
            stays outside the live region so its ticking isn't read out. */}
        <div aria-live="polite" aria-atomic="true">
          {noSteps ? (
            <p
              data-testid="cook-no-steps"
              className="max-w-xl text-xl font-medium leading-relaxed text-gray-900"
            >
              This recipe has no steps yet. Its ingredients are one tap away.
            </p>
          ) : (
            <>
              <p className="mb-4 text-xs font-semibold uppercase tracking-widest text-gray-500">
                Step {safeStep + 1} of {totalSteps}
              </p>
              <p className="max-w-xl text-2xl font-medium leading-relaxed text-gray-900 sm:text-3xl">
                {instruction}
              </p>
            </>
          )}
        </div>
        {stepAmounts.length > 0 && (
          <div
            data-testid="cook-step-amounts"
            className="mt-6 w-full max-w-md rounded-2xl border bg-gray-50 p-3 text-left"
          >
            <p className="mb-1 text-xs font-medium text-gray-600">
              For {formatFractionalQuantity(selectedServings)}{' '}
              {selectedServings === 1 ? 'serving' : 'servings'}
            </p>
            <ul className="space-y-0.5">
              {stepAmounts.map((a) => (
                <li key={a.index} className="flex items-baseline gap-2 text-base text-gray-800">
                  <strong className="shrink-0">{a.amount}</strong>
                  <span className="min-w-0">{a.name}</span>
                </li>
              ))}
            </ul>
          </div>
        )}
        {timerSeconds !== null && (
          <StepTimer
            view={cookTimers.view(safeStep, timerSeconds)}
            onToggle={() => cookTimers.toggle(safeStep, timerSeconds)}
            onReset={() => cookTimers.reset(safeStep)}
            shortcutsEnabled={!drawerOpen}
          />
        )}
      </div>

      {/* Keyboard hint — desktop only, where the shortcuts matter. */}
      <p className="hidden items-center justify-center gap-1.5 pb-3 text-xs text-gray-600 lg:flex">
        <kbd className={KBD_CLS}>←</kbd>
        <kbd className={KBD_CLS}>→</kbd>
        <span>steps</span>
        {timerSeconds !== null && (
          <>
            <span aria-hidden="true">·</span>
            <kbd className={KBD_CLS}>Space</kbd>
            <span>start/pause timer</span>
          </>
        )}
      </p>

      {/* Navigation — swipe also works. Pinned to the bottom of the screen:
          the stepper sits under the app header, so a full-height column put
          Back/Next below the fold (audit F-REC-6-1). */}
      <div className="sticky bottom-0 flex items-center gap-3 border-t bg-white px-4 py-4 pb-safe">
        <button
          onClick={() => setStep((s) => Math.max(0, s - 1))}
          disabled={step === 0}
          className="flex min-h-12 items-center gap-1 rounded-xl border border-gray-200 px-4 text-sm font-medium text-gray-600 hover:bg-gray-50 disabled:opacity-40"
        >
          <ChevronLeft className="h-4 w-4" />
          Back
        </button>
        <button
          onClick={() =>
            isLastStep ? setFinished(true) : setStep((s) => Math.min(totalSteps - 1, s + 1))
          }
          className="flex min-h-12 flex-1 items-center justify-center gap-1 rounded-xl bg-[#944a00] text-base font-semibold text-white hover:bg-[#7a3d00]"
        >
          {isLastStep ? 'Finish' : 'Next step'}
          <ChevronRight className="h-5 w-5" />
        </button>
      </div>

      {/* Ingredients drawer — reachable from any step */}
      <Drawer
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        label="Ingredients"
        side="left"
      >
        <div className="flex items-center justify-between border-b px-4 py-3">
          <p className="text-sm font-semibold text-gray-900">
            Ingredients · {formatFractionalQuantity(selectedServings)} serving
            {selectedServings === 1 ? '' : 's'}
          </p>
          <button
            onClick={() => setDrawerOpen(false)}
            aria-label="Close ingredients"
            className="flex h-11 w-11 items-center justify-center rounded-lg text-gray-500 hover:bg-gray-100"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
        <ul className="space-y-1 overflow-y-auto p-3">
          {recipe.ingredients.map((ing, i) => {
            const checked = checkedIngredients.has(i);
            return (
              <li key={`${ing.name}-${i}`}>
                <button
                  onClick={() =>
                    setCheckedIngredients((prev) => {
                      const next = new Set(prev);
                      if (next.has(i)) next.delete(i);
                      else next.add(i);
                      return next;
                    })
                  }
                  aria-pressed={checked}
                  className="flex min-h-11 w-full items-center gap-3 rounded-lg px-2 text-left hover:bg-gray-50"
                >
                  <span
                    className={`flex h-5 w-5 shrink-0 items-center justify-center rounded border ${
                      checked ? 'border-emerald-500 bg-emerald-500 text-white' : 'border-gray-300'
                    }`}
                  >
                    {checked && <Check className="h-3.5 w-3.5" />}
                  </span>
                  <span
                    className={`text-sm ${checked ? 'text-gray-400 line-through' : 'text-gray-800'}`}
                  >
                    <strong>{formatQuantity(ing.quantity * scale, ing.unit, unitSystem)}</strong>{' '}
                    {ing.name}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      </Drawer>
    </div>
  );
}
