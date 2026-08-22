'use client';

import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useCallback, useEffect, useRef, useState } from 'react';
import { StarRatingWidget } from '@/features/recipe/components/StarRatingWidget';
import { useUnitSystem } from '@/hooks/useUnitSystem';
import { capture } from '@/lib/analytics';
import { trpc } from '@/lib/trpc';
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
import { Drawer } from '@chefer/ui';
import { formatQuantity } from '@chefer/utils';
import { guessMealType, parseStepDuration } from './cook-mode-utils';

// ─── Cook mode (P1-3) ─────────────────────────────────────────────────────────
// Full-screen, one-instruction-at-a-time stepper: the product finally follows
// the user into the kitchen. Finishing logs the meal to today's tracker AND
// opens the star rating — closing the tracking loop and the P1-1
// personalisation loop in one tap.

function todayIso(): string {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

// ── Inline step timer ─────────────────────────────────────────────────────────

function StepTimer({ seconds }: { seconds: number }) {
  const [remaining, setRemaining] = useState(seconds);
  const [running, setRunning] = useState(false);

  // A new step remounts the timer via key; keep the interval simple.
  useEffect(() => {
    if (!running || remaining <= 0) return;
    const t = setInterval(() => setRemaining((r) => Math.max(0, r - 1)), 1000);
    return () => clearInterval(t);
  }, [running, remaining]);

  useEffect(() => {
    if (remaining === 0 && running) {
      setRunning(false);
      // Feature-detect: vibration exists on Android Chrome, not iOS Safari.
      navigator.vibrate?.([200, 100, 200]);
    }
  }, [remaining, running]);

  const mins = Math.floor(remaining / 60);
  const secs = remaining % 60;
  const done = remaining === 0;

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
        {done ? 'Done!' : `${mins}:${String(secs).padStart(2, '0')}`}
      </span>
      {!done && (
        <button
          onClick={() => setRunning((r) => !r)}
          aria-label={running ? 'Pause timer' : 'Start timer'}
          className="flex h-11 w-11 items-center justify-center rounded-full bg-[#944a00] text-white hover:bg-[#7a3d00]"
        >
          {running ? <Pause className="h-5 w-5" /> : <Play className="ml-0.5 h-5 w-5" />}
        </button>
      )}
      <button
        onClick={() => {
          setRemaining(seconds);
          setRunning(false);
        }}
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
  const mealType = searchParams.get('meal') ?? guessMealType();

  const { data: recipe, isLoading } = trpc.mealPlan.getRecipe.useQuery({ recipeId });

  const [step, setStep] = useState(0);
  const [finished, setFinished] = useState(false);
  const [servings, setServings] = useState<number | null>(null);
  const [checkedIngredients, setCheckedIngredients] = useState<Set<number>>(new Set());
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [logged, setLogged] = useState(false);

  const baseServings = recipe?.servings ?? 1;
  const selectedServings = servings ?? baseServings;
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
  const upsertDay = trpc.tracker.upsertDay.useMutation({
    onSuccess: () => {
      setLogged(true);
      capture('meal_cooked', { mealType });
      void utils.tracker.getDay.invalidate();
      void utils.tracker.weeklySummary.invalidate();
      void utils.dashboard.summary.invalidate();
    },
  });

  const logMeal = useCallback(async () => {
    if (!recipe || logged || upsertDay.isPending) return;
    const today = todayIso();
    // upsertDay REPLACES the day's meals — fetch what's already logged and append.
    const day = await utils.tracker.getDay.fetch({ date: today });
    const existing = (day.log?.loggedMeals ?? []) as {
      recipeId: string;
      mealType: string;
      portionMultiplier: number;
      kcal: number;
      protein: number;
      carbs: number;
      fat: number;
    }[];
    const n = recipe.nutritionInfo;
    upsertDay.mutate({
      date: today,
      loggedMeals: [
        ...existing,
        {
          recipeId: recipe.id,
          mealType,
          // One serving eaten — cooking for 4 doesn't mean you ate 4×.
          portionMultiplier: 1,
          kcal: n.calories,
          protein: n.protein,
          carbs: n.carbs,
          fat: n.fat,
        },
      ],
    });
  }, [recipe, logged, upsertDay, utils, mealType]);

  if (isLoading || !recipe) {
    return (
      <div className="flex min-h-dvh items-center justify-center bg-white">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-[#944a00]/20 border-t-[#944a00]" />
      </div>
    );
  }

  const totalSteps = recipe.instructions.length;
  // Defensive clamp: batched rapid taps can momentarily overshoot the state.
  const safeStep = Math.min(step, totalSteps - 1);
  const instruction = recipe.instructions[safeStep] ?? '';
  const timerSeconds = parseStepDuration(instruction);
  const isLastStep = safeStep === totalSteps - 1;

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
              ? `Logged to today's tracker as ${mealType}.`
              : 'Log it to your tracker and tell the chef what you thought.'}
          </p>
        </div>

        {!logged ? (
          <button
            onClick={() => void logMeal()}
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
        {upsertDay.isError && (
          <p className="text-sm text-red-600">Could not log the meal — try again.</p>
        )}

        <div className="flex items-center gap-4 text-sm">
          <button onClick={() => setFinished(false)} className="text-gray-500 hover:underline">
            Back to steps
          </button>
          <Link href={`/recipes/${recipe.id}`} className="text-[#944a00] hover:underline">
            Done
          </Link>
        </div>
      </div>
    );
  }

  // ── Stepper ──
  return (
    <div
      className="flex min-h-dvh flex-col bg-white pb-safe"
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
            onClick={() => setServings(Math.max(1, selectedServings - 1))}
            aria-label="Fewer servings"
            className="flex h-11 w-9 items-center justify-center text-gray-500 hover:text-gray-900"
          >
            <Minus className="h-4 w-4" />
          </button>
          <span className="min-w-6 text-center text-sm font-semibold text-gray-800">
            {selectedServings}
          </span>
          <button
            onClick={() => setServings(Math.min(20, selectedServings + 1))}
            aria-label="More servings"
            className="flex h-11 w-9 items-center justify-center text-gray-500 hover:text-gray-900"
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

      {/* Progress */}
      <div className="h-1.5 bg-gray-100">
        <div
          className="h-full bg-[#944a00] transition-all duration-300"
          style={{ width: `${((safeStep + 1) / totalSteps) * 100}%` }}
        />
      </div>

      {/* The step — large type, one instruction at a time */}
      <div className="flex flex-1 flex-col items-center justify-center px-6 py-8 text-center">
        <p className="mb-4 text-xs font-semibold uppercase tracking-widest text-gray-400">
          Step {safeStep + 1} of {totalSteps}
        </p>
        <p className="max-w-xl text-2xl font-medium leading-relaxed text-gray-900 sm:text-3xl">
          {instruction}
        </p>
        {timerSeconds !== null && (
          <StepTimer key={`${safeStep}-${timerSeconds}`} seconds={timerSeconds} />
        )}
      </div>

      {/* Navigation — swipe also works */}
      <div className="flex items-center gap-3 border-t px-4 py-4">
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
            Ingredients · {selectedServings} serving{selectedServings === 1 ? '' : 's'}
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
