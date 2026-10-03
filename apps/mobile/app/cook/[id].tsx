import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useKeepAwake } from 'expo-keep-awake';
import { router, useLocalSearchParams } from 'expo-router';
import {
  Button,
  ChipGroup,
  ConfirmSheet,
  ErrorState,
  KeyboardAwareScrollView,
  Screen,
  Text,
  useQueryState,
} from '@chefer/ui-mobile';
import {
  clampCookServings,
  cn,
  defaultCookServings,
  finishMealCopy,
  formatCookTimer,
  formatFractionalQuantity,
  formatPortion,
  formatScaledQuantity,
  guessMealType,
  isNotFoundError,
  labelCaveatLineText,
  localDateStr,
  parseServingsParam,
  parseStepDuration,
  slotPortion,
  stepIngredientAmounts,
  tableBreakdown,
  userFacingErrorMessage,
} from '@chefer/utils';
import { AllergenWarningBanner } from '../../src/features/recipes/allergen-warning';
import {
  clearCookSession,
  getCookSession,
  saveCookSession,
} from '../../src/features/recipes/cook-session-store';
import { useCookTimers, type CookTimerView } from '../../src/features/recipes/cook-timers';
import { StarRating } from '../../src/features/recipes/star-rating';
import { CheckedForLine } from '../../src/features/safety/checked-for-line';
import { LabelCaveat } from '../../src/features/safety/label-caveat';
import { RebalanceBanner } from '../../src/features/tracker/rebalance-banner';
import { recordRebalance } from '../../src/features/tracker/rebalance-store';
import { useCookingFor } from '../../src/hooks/use-cooking-for';
import { useHousehold } from '../../src/hooks/use-household';
import { useUnits } from '../../src/hooks/use-units';
import { track } from '../../src/lib/analytics';
import { trackMealLogged } from '../../src/lib/analytics-events';
import { trpc } from '../../src/lib/trpc';
import { useUnsavedGuard } from '../../src/lib/use-unsaved-guard';

// Cook mode (P1-3) — port of web features/recipes/components/cook-mode.tsx.
// Step-by-step with inline timers (shared parseStepDuration), screen kept
// awake, ingredient checklist, and finish → tracker log (same append
// semantics as web) → star rating. A premium week rebalance triggered by the
// log shows its banner + undo right here on the finish screen. Servings
// start at a premium household's table portions (P2-3), multiplied by the
// plan slot's portion when opened from the plan (P1-1) — same as web. A
// `servings` param (the recipe page's stepper, UX-COOK-05) wins over all of
// that. Step timers are absolute `endsAt` stamps held at screen level, not in
// the step view (UX-COOK-01), and each step lists its own ingredients with
// scaled amounts (UX-COOK-04).

// Local calendar day, not the UTC one (F-TRK-1-1).
const todayIso = (): string => localDateStr();

const MEAL_SLOTS = [
  { value: 'breakfast', label: 'Breakfast', testID: 'cook-slot-breakfast' },
  { value: 'lunch', label: 'Lunch', testID: 'cook-slot-lunch' },
  { value: 'dinner', label: 'Dinner', testID: 'cook-slot-dinner' },
  { value: 'snack', label: 'Snack', testID: 'cook-slot-snack' },
] as const;
type MealSlot = (typeof MEAL_SLOTS)[number]['value'];

const isMealSlot = (value: string | undefined): value is MealSlot =>
  MEAL_SLOTS.some((slot) => slot.value === value);

function StepTimer({
  view,
  onToggle,
  onReset,
}: {
  view: CookTimerView;
  onToggle: () => void;
  onReset: () => void;
}) {
  const { status, remainingSec } = view;
  const done = status === 'done';
  const running = status === 'running';

  return (
    <View className="flex-row items-center gap-2 self-start">
      <Pressable
        testID="step-timer"
        accessibilityRole="button"
        accessibilityLabel={
          done
            ? 'Timer finished. Tap to reset'
            : running
              ? `Timer running, ${formatCookTimer(remainingSec)} left. Tap to pause`
              : status === 'paused'
                ? `Timer paused at ${formatCookTimer(remainingSec)}. Tap to resume`
                : `Start a ${formatCookTimer(remainingSec)} timer`
        }
        onPress={onToggle}
        className={cn(
          'min-h-11 flex-row items-center gap-2 rounded-full border px-4 py-2',
          done
            ? 'border-emerald-300 bg-emerald-50'
            : running
              ? 'border-primary bg-accent'
              : 'border-border bg-white',
        )}
      >
        <Ionicons
          name={done ? 'checkmark' : running ? 'pause' : 'play'}
          size={16}
          color={done ? '#059669' : '#944a00'}
        />
        <Text
          className={cn(
            'text-sm font-semibold tabular-nums',
            done ? 'text-emerald-700' : 'text-primary',
          )}
        >
          {done ? 'Time!' : formatCookTimer(remainingSec)}
        </Text>
      </Pressable>
      {status === 'paused' ? (
        <Pressable
          testID="step-timer-reset"
          accessibilityRole="button"
          accessibilityLabel="Reset timer"
          onPress={onReset}
          className="h-11 w-11 items-center justify-center"
        >
          <Ionicons name="refresh" size={18} color="#4b5563" />
        </Pressable>
      ) : null}
    </View>
  );
}

export default function CookModeScreen() {
  useKeepAwake();
  const {
    id,
    meal,
    portion,
    servings: servingsParam,
  } = useLocalSearchParams<{
    id: string;
    meal?: string;
    portion?: string;
    servings?: string;
  }>();
  // Tracker logging still needs a real slot (breakfast/lunch/…) even when
  // cook mode was opened with no `meal` param — the clock guess is fine
  // THERE. bug B-21: the finish-screen COPY is different — it must never
  // claim a meal it doesn't actually know, so it uses `meal` directly via
  // `finishMealCopy` below instead of this guessed value.
  const guessedSlot = guessMealType();
  const initialSlot: MealSlot = isMealSlot(meal)
    ? meal
    : isMealSlot(guessedSlot)
      ? guessedSlot
      : 'dinner';
  // P1-1: cooking a portioned plan slot shows its quantities and logs it.
  const planPortion = slotPortion(parseFloat(portion ?? ''));
  const { system: unitSystem } = useUnits();

  const recipeQuery = trpc.mealPlan.getRecipe.useQuery({ recipeId: id });
  const { data: recipe } = recipeQuery;
  // UX-COOK-03: a failed load used to spin forever with no way out.
  const recipeState = useQueryState(recipeQuery);
  // T-02.3: a separate, additive query — see app/recipe/[id].tsx's comment.
  const { data: safetyData } = trpc.recipe.getSafetyChecks.useQuery({ recipeId: id });
  const safetyChecks = safetyData?.safetyChecks ?? null;
  const utils = trpc.useUtils();
  // Premium households cook for the whole table (null otherwise).
  const { scaledMembers } = useHousehold();
  const cookingFor = useCookingFor();
  // UX-COOK-05: the recipe page's chosen servings, when it passed any.
  const [servings, setServings] = useState<number | null>(() => parseServingsParam(servingsParam));

  // UX-COOK-02: leaving and coming back resumes the step and the ticks.
  const [step, setStep] = useState(() => getCookSession(id).step);
  const [finished, setFinished] = useState(false);
  const [logged, setLogged] = useState(false);
  const [checkedIngredients, setCheckedIngredients] = useState<Set<number>>(
    () => new Set(getCookSession(id).checked),
  );
  const [showIngredients, setShowIngredients] = useState(false);
  // UX-COOK-04: the slot "Log this meal" files the meal under — chosen, not guessed.
  const [slot, setSlot] = useState<MealSlot>(initialSlot);
  const [loggedAs, setLoggedAs] = useState<{ date: string; slot: MealSlot } | null>(null);

  // UX-COOK-01: timers are screen state (see cook-timers.ts).
  const [initialSession] = useState(() => getCookSession(id));
  const cookTimers = useCookTimers(
    recipe?.name ?? '',
    initialSession.timers ?? {},
    initialSession.notifications ?? {},
  );

  // WP-13: once per cook, whichever button ends it (finish or "no steps" finish).
  useEffect(() => {
    if (finished) track('cook_finished', {});
  }, [finished]);

  useEffect(() => {
    if (finished) return;
    saveCookSession(id, {
      step,
      checked: [...checkedIngredients],
      timers: cookTimers.timers,
      notifications: { ...cookTimers.notificationIds.current },
    });
  }, [
    id,
    step,
    checkedIngredients,
    finished,
    cookTimers.timers,
    cookTimers.notificationIds,
    cookTimers.notificationVersion,
  ]);

  // UX-COOK-02: BACK (Android), the header ✕ and the iOS swipe close the
  // ingredients panel first, then ask before leaving mid-recipe. The panel
  // counts as "dirty" so the iOS swipe is held while it is open.
  const guard = useUnsavedGuard(!finished && (step > 0 || showIngredients), {
    onBack: () => {
      if (!showIngredients) return undefined;
      setShowIngredients(false);
      return true;
    },
    title: 'Leave cook mode?',
    message: `You are on step ${step + 1}. Your place and ticked ingredients are kept if you come back to this recipe.`,
    discardLabel: 'Leave',
    keepLabel: 'Keep cooking',
  });

  const upsertDay = trpc.tracker.logRecipe.useMutation({
    meta: { silent: true },
    onSuccess: (result, variables) => {
      // WP-13: opened from a plan slot (`meal` param) = planned, else a quick log.
      trackMealLogged(isMealSlot(meal) ? 'planned' : 'quick', variables.mealType);
      setLogged(true);
      setLoggedAs({ date: variables.date, slot });
      recordRebalance(result.rebalance);
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

  const logMeal = () => {
    if (!recipe || logged || upsertDay.isPending) {
      return;
    }
    // Server-side atomic append: never clobbers other entries, and a double
    // tap can't double-log (F-PM-1, F-M-TRK-1-1).
    upsertDay.mutate({
      date: todayIso(),
      recipeId: recipe.id,
      mealType: slot,
      // One serving eaten — cooking for 4 doesn't mean you ate 4×. A plan
      // slot sized to 1.5× means you ate 1.5 servings (P1-1).
      portionMultiplier: Math.min(2, Math.max(0.5, planPortion)),
    });
  };

  if (recipeState.state === 'loading') {
    return (
      <Screen edges={['top', 'bottom', 'left', 'right']} className="items-center justify-center">
        <ActivityIndicator size="large" color="#944a00" />
      </Screen>
    );
  }

  if (recipeState.state === 'error' || !recipe) {
    const notFound = recipeState.state === 'error' && isNotFoundError(recipeQuery.error);
    return (
      <Screen
        edges={['top', 'bottom', 'left', 'right']}
        className="items-center justify-center gap-3"
      >
        {notFound ? (
          <Text testID="cook-not-found" variant="muted">
            Recipe not found.
          </Text>
        ) : (
          <ErrorState
            testID="cook-load-error"
            title="Couldn't load this recipe"
            onRetry={recipeState.retry}
          />
        )}
        <Button testID="cook-error-close" variant="outline" onPress={() => router.back()}>
          Close
        </Button>
      </Screen>
    );
  }

  const finishCooking = () => {
    // Done cooking: the next time this recipe is opened starts from the top,
    // and any timer still running (and its notification) ends here.
    cookTimers.stopAll();
    clearCookSession(id);
    setFinished(true);
  };

  const baseServings = recipe.servings || 1;
  const selectedServings =
    servings ?? defaultCookServings(baseServings, scaledMembers, planPortion, cookingFor);
  const scale = selectedServings / baseServings;

  const totalSteps = recipe.instructions.length;
  // A recipe with no steps has nothing to page through: start (and stay) on
  // the ingredient list instead of "Step 0 of 0" and a NaN progress bar.
  const noSteps = totalSteps === 0;
  const safeStep = Math.max(0, Math.min(step, totalSteps - 1));
  const stepText = recipe.instructions[safeStep] ?? '';
  const stepDuration = parseStepDuration(stepText);
  // UX-COOK-04: the amounts this step uses, scaled to the chosen servings.
  const stepAmounts = stepIngredientAmounts(stepText, recipe.ingredients, scale, unitSystem);

  return (
    <Screen edges={['top', 'bottom', 'left', 'right']} className="px-0">
      {/* Header */}
      <View className="flex-row items-center gap-3 px-4 py-3">
        <Pressable
          testID="cook-close"
          accessibilityRole="button"
          accessibilityLabel="Exit cook mode"
          onPress={() => router.back()}
          className="h-11 w-11 items-center justify-center"
        >
          <Ionicons name="close" size={22} color="#1f2937" />
        </Pressable>
        <View className="min-w-0 flex-1">
          <Text numberOfLines={1} testID="cook-title" variant="heading">
            {recipe.name}
          </Text>
          {!finished && !noSteps && (
            <Text variant="muted" className="text-xs">
              Step {safeStep + 1} of {totalSteps}
            </Text>
          )}
        </View>
        <Pressable
          testID="cook-ingredients-toggle"
          accessibilityRole="button"
          accessibilityLabel="Toggle ingredients"
          onPress={() => setShowIngredients((s) => !s)}
          className="h-11 w-11 items-center justify-center"
        >
          <Ionicons name="list" size={22} color="#944a00" />
        </Pressable>
      </View>

      {/* UX-COOK-01: every timer that is going (or has finished) stays in
          view whichever step you are reading; tapping one jumps to its step. */}
      {!finished && cookTimers.active.length > 0 ? (
        <View testID="cook-timer-chips" className="mx-4 mb-2 flex-row flex-wrap gap-2">
          {cookTimers.active.map((t) => (
            <Pressable
              key={t.step}
              testID={`cook-timer-chip-${t.step}`}
              accessibilityRole="button"
              accessibilityLabel={
                t.status === 'done'
                  ? `Step ${t.step + 1} timer finished. Go to step`
                  : `Step ${t.step + 1} timer, ${formatCookTimer(t.remainingSec)} ${
                      t.status === 'paused' ? 'paused' : 'left'
                    }. Go to step`
              }
              onPress={() => {
                setShowIngredients(false);
                setStep(t.step);
              }}
              className={cn(
                'min-h-11 flex-row items-center gap-1.5 rounded-full border px-3 py-2',
                t.status === 'done'
                  ? 'border-emerald-300 bg-emerald-50'
                  : t.status === 'running'
                    ? 'border-primary bg-accent'
                    : 'border-border bg-white',
              )}
            >
              <Ionicons
                name={
                  t.status === 'done'
                    ? 'checkmark'
                    : t.status === 'paused'
                      ? 'pause'
                      : 'timer-outline'
                }
                size={16}
                color={t.status === 'done' ? '#059669' : '#944a00'}
              />
              <Text
                className={cn(
                  'text-sm font-semibold tabular-nums',
                  t.status === 'done' ? 'text-emerald-700' : 'text-primary',
                )}
              >
                Step {t.step + 1} ·{' '}
                {t.status === 'done' ? 'Time!' : formatCookTimer(t.remainingSec)}
              </Text>
            </Pressable>
          ))}
        </View>
      ) : null}

      {/* Allergen conflicts stay visible while cooking (F-REC-2-3) */}
      <AllergenWarningBanner
        warnings={recipe.allergenWarnings}
        details={safetyChecks?.conflictDetails}
        className="mx-4 mb-2"
      />

      {/* Progress bar */}
      {noSteps ? null : (
        <View className="mx-4 mb-2 h-1.5 overflow-hidden rounded-full bg-gray-100">
          <View
            className="h-full rounded-full bg-primary"
            style={{ width: `${finished ? 100 : ((safeStep + 1) / totalSteps) * 100}%` }}
          />
        </View>
      )}

      {showIngredients || (noSteps && !finished) ? (
        /* Ingredient checklist */
        <ScrollView contentContainerClassName="gap-2 px-4 py-3 pb-8">
          <View className="flex-row items-center justify-between gap-2">
            <Text variant="heading">Ingredients</Text>
            {/* Servings scaler (web cook mode's top-bar stepper) */}
            <View className="flex-row items-center rounded-full border border-border">
              <Pressable
                testID="cook-servings-dec"
                accessibilityRole="button"
                accessibilityLabel="Fewer servings"
                onPress={() => setServings(clampCookServings(selectedServings - 1))}
                className="h-11 w-11 items-center justify-center"
              >
                <Ionicons name="remove" size={18} color="#4b5563" />
              </Pressable>
              <Text
                testID="cook-servings"
                accessibilityLabel={`${formatFractionalQuantity(selectedServings)} servings`}
                className="min-w-[28px] px-1 text-center text-sm font-semibold text-gray-800"
              >
                {formatFractionalQuantity(selectedServings)}
              </Text>
              <Pressable
                testID="cook-servings-inc"
                accessibilityRole="button"
                accessibilityLabel="More servings"
                onPress={() => setServings(clampCookServings(selectedServings + 1))}
                className="h-11 w-11 items-center justify-center"
              >
                <Ionicons name="add" size={18} color="#4b5563" />
              </Pressable>
            </View>
          </View>
          {scaledMembers !== null && (
            <Text testID="cook-table-portions" variant="muted" className="text-xs">
              Sized for your table: {tableBreakdown(planPortion, scaledMembers)}.
            </Text>
          )}
          {scaledMembers === null && planPortion !== 1 && (
            <Text testID="cook-plan-portion" variant="muted" className="text-xs">
              Set for your plan&apos;s {formatPortion(planPortion)} portion.
            </Text>
          )}
          {/* T-02.3: top of the ingredient list — never both with the
              conflict banner above (AC3). */}
          {(recipe.allergenWarnings?.length ?? 0) === 0 && safetyChecks ? (
            <CheckedForLine testID="cook-checked-for" checks={safetyChecks} />
          ) : null}
          {safetyChecks?.labelCaveats && safetyChecks.labelCaveats.length > 0 ? (
            <LabelCaveat
              testID="cook-label-caveat"
              text={labelCaveatLineText(safetyChecks.labelCaveats.map((c) => c.ingredient))}
            />
          ) : null}
          {recipe.ingredients.map((ing, i) => {
            const isChecked = checkedIngredients.has(i);
            return (
              <Pressable
                key={i}
                accessibilityRole="button"
                accessibilityState={{ checked: isChecked }}
                onPress={() =>
                  setCheckedIngredients((prev) => {
                    const next = new Set(prev);
                    if (isChecked) {
                      next.delete(i);
                    } else {
                      next.add(i);
                    }
                    return next;
                  })
                }
                className="min-h-11 flex-row items-center gap-3"
              >
                <View
                  className={cn(
                    'h-6 w-6 items-center justify-center rounded-full border-2',
                    isChecked ? 'border-primary bg-primary' : 'border-gray-300',
                  )}
                >
                  {isChecked && <Ionicons name="checkmark" size={14} color="white" />}
                </View>
                <Text
                  className={cn(
                    'flex-1 text-base',
                    isChecked ? 'text-gray-400 line-through' : 'text-gray-800',
                  )}
                >
                  {formatScaledQuantity(ing.quantity, ing.unit, scale, unitSystem)} {ing.name}
                </Text>
              </Pressable>
            );
          })}
          {noSteps ? (
            <Button testID="cook-no-steps-done" className="mt-2" onPress={() => setFinished(true)}>
              Finish
            </Button>
          ) : (
            <Button className="mt-2" onPress={() => setShowIngredients(false)}>
              Back to cooking
            </Button>
          )}
        </ScrollView>
      ) : finished ? (
        /* Done screen */
        <KeyboardAwareScrollView
          keyboardShouldPersistTaps="handled"
          contentContainerClassName="items-center gap-4 px-6 py-10"
        >
          <Text className="text-5xl">🎉</Text>
          <Text testID="cook-finished" variant="title" className="text-center">
            {finishMealCopy(meal)}
          </Text>
          <Text variant="muted" className="text-center text-sm">
            Log it to today&apos;s tracker so your nutrition stays honest.
          </Text>
          {/* UX-COOK-04: the slot is a choice, preset from the plan or the clock. */}
          {logged ? null : (
            <View className="items-center gap-2 self-stretch">
              <Text variant="muted" className="text-sm">
                Log it as
              </Text>
              <ChipGroup
                testID="cook-slot"
                className="justify-center"
                options={MEAL_SLOTS.map((o) => ({ ...o }))}
                value={[slot]}
                onChange={([next]) => next && setSlot(next)}
              />
            </View>
          )}
          <Button
            testID="cook-log"
            loading={upsertDay.isPending}
            disabled={logged}
            onPress={logMeal}
          >
            {logged ? 'Logged to tracker ✓' : 'Log this meal'}
          </Button>
          {upsertDay.isError && (
            <Text className="text-sm text-red-600">{userFacingErrorMessage(upsertDay.error)}</Text>
          )}
          {logged && loggedAs ? (
            <View className="items-center gap-1">
              <Text testID="cook-logged-as" variant="muted" className="text-sm">
                Logged as {loggedAs.slot}.
              </Text>
              <Button
                testID="cook-log-undo"
                variant="outline"
                loading={undoLog.isPending}
                onPress={() =>
                  undoLog.mutate({
                    date: loggedAs.date,
                    recipeId: recipe.id,
                    mealType: loggedAs.slot,
                  })
                }
              >
                Undo
              </Button>
              {undoLog.isError ? (
                <Text className="text-sm text-red-600">
                  {userFacingErrorMessage(undoLog.error)}
                </Text>
              ) : null}
            </View>
          ) : null}
          {logged && (
            <>
              <RebalanceBanner className="self-stretch" />
              {/* Ratings feed next week's generation (P1-1) — say so. */}
              <StarRating
                recipeId={recipe.id}
                title="How was it?"
                hint="Your rating shapes what the chef cooks up next week."
                className="self-stretch"
              />
            </>
          )}
          <Button variant="outline" onPress={() => router.back()}>
            Done
          </Button>
        </KeyboardAwareScrollView>
      ) : (
        /* Step view — big text, kitchen-distance readable */
        <View className="flex-1 px-4 pb-6">
          <ScrollView contentContainerClassName="gap-5 py-4">
            <Text
              testID="cook-step-text"
              className="text-2xl font-semibold leading-9 text-gray-900"
            >
              {stepText}
            </Text>
            {stepAmounts.length > 0 ? (
              <View
                testID="cook-step-amounts"
                className="gap-1 rounded-xl border border-border bg-white p-3"
              >
                <Text variant="muted" className="text-sm">
                  For {formatFractionalQuantity(selectedServings)}{' '}
                  {selectedServings === 1 ? 'serving' : 'servings'}
                </Text>
                {stepAmounts.map((a) => (
                  <View key={a.index} className="flex-row items-baseline gap-2">
                    <Text className="shrink-0 text-base font-semibold text-gray-900">
                      {a.amount}
                    </Text>
                    <Text className="min-w-0 flex-1 text-base text-gray-700">{a.name}</Text>
                  </View>
                ))}
              </View>
            ) : null}
            {stepDuration !== null && (
              <StepTimer
                view={cookTimers.view(safeStep, stepDuration)}
                onToggle={() => cookTimers.toggle(safeStep, stepDuration)}
                onReset={() => cookTimers.reset(safeStep)}
              />
            )}
          </ScrollView>
          <View className="flex-row gap-3">
            <Button
              testID="cook-prev"
              variant="outline"
              className="flex-1"
              disabled={safeStep === 0}
              onPress={() => setStep((s) => Math.max(0, s - 1))}
            >
              Back
            </Button>
            <Button
              testID="cook-next"
              className="flex-1"
              onPress={() => (safeStep >= totalSteps - 1 ? finishCooking() : setStep((s) => s + 1))}
            >
              {safeStep >= totalSteps - 1 ? 'Finish' : 'Next step'}
            </Button>
          </View>
        </View>
      )}
      <ConfirmSheet testID="cook-leave" {...guard.sheetProps} />
    </Screen>
  );
}
