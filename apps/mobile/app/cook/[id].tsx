import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, View } from 'react-native';
import Animated from 'react-native-reanimated';
import { useKeepAwake } from 'expo-keep-awake';
import { router, useLocalSearchParams } from 'expo-router';
import {
  AnimatedCheck,
  Celebration,
  ChipGroup,
  ConfirmSheet,
  enterFromSide,
  ErrorState,
  haptics,
  IconButton,
  KeyboardAwareScrollView,
  PopIn,
  PressableScale,
  ProgressBar,
  Screen,
  StrikeLine,
  Text,
  useQueryState,
  useThemeColors,
} from '@chefer/ui-mobile';
import {
  clampCookServings,
  cn,
  cookCountLine,
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
import { Icon } from '../../src/components/icon';
import { BiscuitLine } from '../../src/features/progress/biscuit-line';
import { KitchenReceipt } from '../../src/features/progress/kitchen-receipt';
import { useFinishCook } from '../../src/features/progress/use-finish-cook';
import { useProgressEnabled, useProgressSummary } from '../../src/features/progress/use-progress';
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
import { SectionTitle } from '../../src/features/shell/today/parts';
import { TrainButton } from '../../src/features/shell/train/train-button';
import { RebalanceBanner } from '../../src/features/tracker/rebalance-banner';
import { RebalanceOffer } from '../../src/features/tracker/rebalance-offer';
import {
  REBALANCE_PREVIEW,
  recordRebalanceOutcome,
} from '../../src/features/tracker/rebalance-offer-store';
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
// semantics as web) → star rating. A week rebalance offered by the
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
  const colors = useThemeColors();
  const { status, remainingSec } = view;
  const done = status === 'done';
  const running = status === 'running';

  return (
    <View className="flex-row items-center gap-2 self-start">
      <PressableScale
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
            ? 'border-positive/30 bg-positive/10'
            : running
              ? 'border-brand bg-brand-tint'
              : 'border-separator bg-surface',
        )}
      >
        <Icon
          name={done ? 'checkmark' : running ? 'pause' : 'play'}
          size={18}
          color={done ? colors.positive : colors.brand}
        />
        <Text
          className={cn(
            'text-headline font-semibold tabular-nums',
            done ? 'text-positive' : 'text-brand',
          )}
        >
          {done ? 'Time!' : formatCookTimer(remainingSec)}
        </Text>
      </PressableScale>
      {status === 'paused' ? (
        <IconButton
          testID="step-timer-reset"
          accessibilityLabel="Reset timer"
          icon={<Icon name="refresh" size={20} color={colors.labelSecondary} />}
          onPress={onReset}
        />
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
  const colors = useThemeColors();

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
  const [finishBurst, setFinishBurst] = useState(0);
  // Premium motion #16: which way the last step change went (slide direction).
  const stepDirection = useRef<1 | -1>(1);
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

  // Kitchen progress (mockup 02): finishing records the cook for EVERY user (D1, retried
  // from a queue when offline); the receipt below shows only when the feature is on.
  const cookProgress = useFinishCook({ finished, recipeId: id });
  const progressOn = useProgressEnabled();
  const { summary: progressSummary } = useProgressSummary();

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
      recordRebalanceOutcome(result);
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
      ...REBALANCE_PREVIEW,
      recipeId: recipe.id,
      mealType: slot,
      // One serving eaten — cooking for 4 doesn't mean you ate 4×. A plan
      // slot sized to 1.5× means you ate 1.5 servings (P1-1).
      portionMultiplier: Math.min(2, Math.max(0.5, planPortion)),
    });
  };

  if (recipeState.state === 'loading') {
    return (
      <Screen
        edges={['top', 'bottom', 'left', 'right']}
        className="items-center justify-center bg-canvas"
      >
        <ActivityIndicator size="large" color={colors.brand} />
      </Screen>
    );
  }

  if (recipeState.state === 'error' || !recipe) {
    const notFound = recipeState.state === 'error' && isNotFoundError(recipeQuery.error);
    return (
      <Screen
        edges={['top', 'bottom', 'left', 'right']}
        className="items-center justify-center gap-3 bg-canvas"
      >
        {notFound ? (
          <Text testID="cook-not-found" className="text-body text-label-secondary">
            Recipe not found.
          </Text>
        ) : (
          <ErrorState
            testID="cook-load-error"
            title="Couldn't load this recipe"
            onRetry={recipeState.retry}
          />
        )}
        <TrainButton
          testID="cook-error-close"
          variant="outline"
          label="Close"
          onPress={() => router.back()}
        />
      </Screen>
    );
  }

  const finishCooking = () => {
    // Done cooking: the next time this recipe is opened starts from the top,
    // and any timer still running (and its notification) ends here.
    cookTimers.stopAll();
    clearCookSession(id);
    setFinished(true);
    // MO-18: finishing a cook is a tier-3 moment.
    haptics.success();
    setFinishBurst((n) => n + 1);
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
    <Screen edges={['top', 'bottom', 'left', 'right']} className="bg-canvas px-0">
      {/* Header — a focused full-screen flow: ✕ exits (through the leave
        guard), the recipe is the title, the list glyph shows ingredients. */}
      <View className="min-h-11 flex-row items-center gap-2 px-4 py-2">
        <IconButton
          testID="cook-close"
          accessibilityLabel="Exit cook mode"
          icon={<Icon name="close" size={26} color={colors.label} />}
          onPress={() => router.back()}
          className="-ml-2"
        />
        <View className="min-w-0 flex-1">
          <Text
            numberOfLines={1}
            testID="cook-title"
            accessibilityRole="header"
            className="text-title3 font-bold text-label"
          >
            {recipe.name}
          </Text>
          {!finished && !noSteps && (
            <Text className="text-subhead text-label-secondary">
              Step {safeStep + 1} of {totalSteps}
            </Text>
          )}
        </View>
        <IconButton
          testID="cook-ingredients-toggle"
          accessibilityLabel="Toggle ingredients"
          variant={showIngredients ? 'tinted' : 'plain'}
          icon={<Icon name="list" color={colors.brand} />}
          onPress={() => setShowIngredients((s) => !s)}
          className="-mr-2"
        />
      </View>

      {/* UX-COOK-01: every timer that is going (or has finished) stays in
          view whichever step you are reading; tapping one jumps to its step. */}
      {!finished && cookTimers.active.length > 0 ? (
        <View testID="cook-timer-chips" className="mx-4 mb-2 flex-row flex-wrap gap-2">
          {cookTimers.active.map((t) => (
            <PressableScale
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
                stepDirection.current = t.step >= step ? 1 : -1;
                setStep(t.step);
              }}
              className={cn(
                'min-h-11 flex-row items-center gap-1.5 rounded-full border px-3 py-2',
                t.status === 'done'
                  ? 'border-positive/30 bg-positive/10'
                  : t.status === 'running'
                    ? 'border-brand bg-brand-tint'
                    : 'border-separator bg-surface',
              )}
            >
              <Icon
                name={t.status === 'done' ? 'checkmark' : t.status === 'paused' ? 'pause' : 'timer'}
                size={16}
                color={t.status === 'done' ? colors.positive : colors.brand}
              />
              <Text
                className={cn(
                  'text-callout font-semibold tabular-nums',
                  t.status === 'done' ? 'text-positive' : 'text-brand',
                )}
              >
                Step {t.step + 1} ·{' '}
                {t.status === 'done' ? 'Time!' : formatCookTimer(t.remainingSec)}
              </Text>
            </PressableScale>
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
        // Premium motion #16: the fill glides (scaleX, MO-06) as steps advance.
        <View className="mx-4 mb-2">
          <ProgressBar
            testID="cook-progress"
            progress={finished ? 1 : (safeStep + 1) / totalSteps}
            color={colors.brand}
            className="h-1.5 bg-surface-sunken"
            accessibilityLabel={`Step ${Math.min(safeStep + 1, totalSteps)} of ${totalSteps}`}
          />
        </View>
      )}

      {showIngredients || (noSteps && !finished) ? (
        /* Ingredient checklist */
        <ScrollView contentContainerClassName="gap-2 px-4 py-3 pb-8">
          <View className="flex-row items-center justify-between gap-2">
            <SectionTitle>Ingredients</SectionTitle>
            {/* Servings scaler (web cook mode's top-bar stepper) */}
            <View className="flex-row items-center rounded-full border border-separator bg-surface">
              <IconButton
                testID="cook-servings-dec"
                accessibilityLabel="Fewer servings"
                icon={<Icon name="remove" size={20} color={colors.brand} />}
                onPress={() => setServings(clampCookServings(selectedServings - 1))}
              />
              <Text
                testID="cook-servings"
                accessibilityLabel={`${formatFractionalQuantity(selectedServings)} servings`}
                className="min-w-[28px] px-1 text-center text-callout font-semibold text-label"
              >
                {formatFractionalQuantity(selectedServings)}
              </Text>
              <IconButton
                testID="cook-servings-inc"
                accessibilityLabel="More servings"
                icon={<Icon name="add" size={20} color={colors.brand} />}
                onPress={() => setServings(clampCookServings(selectedServings + 1))}
              />
            </View>
          </View>
          {scaledMembers !== null && (
            <Text testID="cook-table-portions" className="text-caption text-label-secondary">
              Sized for your table: {tableBreakdown(planPortion, scaledMembers)}.
            </Text>
          )}
          {scaledMembers === null && planPortion !== 1 && (
            <Text testID="cook-plan-portion" className="text-caption text-label-secondary">
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
                accessibilityRole="checkbox"
                accessibilityState={{ checked: isChecked }}
                onPress={() => {
                  if (isChecked) haptics.selection();
                  else haptics.tick();
                  setCheckedIngredients((prev) => {
                    const next = new Set(prev);
                    if (isChecked) {
                      next.delete(i);
                    } else {
                      next.add(i);
                    }
                    return next;
                  });
                }}
                className="min-h-11 flex-row items-center gap-3"
              >
                {/* MO-16 / MO-17: the same check and strike as Today and Shop. */}
                <AnimatedCheck
                  checked={isChecked}
                  size={24}
                  fillColor={colors.brand}
                  checkColor={colors.onBrand}
                  ringColor={colors.separator}
                  emptyColor={colors.surface}
                />
                <View className="relative min-w-0 flex-1">
                  <Text
                    className={cn('text-body', isChecked ? 'text-label-tertiary' : 'text-label')}
                  >
                    {formatScaledQuantity(ing.quantity, ing.unit, scale, unitSystem)} {ing.name}
                  </Text>
                  <StrikeLine active={isChecked} color={colors.labelTertiary} />
                </View>
              </Pressable>
            );
          })}
          {noSteps ? (
            <TrainButton
              testID="cook-no-steps-done"
              label="Finish"
              size="lg"
              className="mt-2"
              onPress={() => setFinished(true)}
            />
          ) : (
            <TrainButton
              label="Back to cooking"
              size="lg"
              className="mt-2"
              onPress={() => setShowIngredients(false)}
            />
          )}
        </ScrollView>
      ) : finished ? (
        /* Done screen */
        <KeyboardAwareScrollView
          keyboardShouldPersistTaps="handled"
          contentContainerClassName="items-center gap-4 px-6 py-10"
        >
          <PopIn from={0.4}>
            <Text className="text-display">🎉</Text>
          </PopIn>
          <Text testID="cook-finished" className="text-center text-title1 font-bold text-label">
            {finishMealCopy(meal)}
          </Text>
          <Text className="text-center text-body text-label-secondary">
            Log it to today&apos;s tracker to keep your day&apos;s totals up to date.
          </Text>
          {/* Kitchen progress (mockup 02): Biscuit's line and the receipt, once the API has answered. */}
          {progressOn && cookProgress.receipt && progressSummary?.settings.showXp !== false ? (
            <>
              {progressSummary?.settings.biscuit && !progressSummary.quiet ? (
                <BiscuitLine
                  moment="cookFinished"
                  seed={cookProgress.cookId}
                  loop="cooking"
                  testID="cook-biscuit"
                />
              ) : null}
              {cookProgress.receipt.meta.cookCount ? (
                <Text testID="cook-count" className="text-center text-callout text-label-secondary">
                  {cookCountLine(cookProgress.receipt.meta.cookCount)}
                </Text>
              ) : null}
              <KitchenReceipt
                testID="cook-receipt"
                receipt={cookProgress.receipt}
                xp={progressSummary?.xp}
              />
            </>
          ) : null}
          {/* UX-COOK-04: the slot is a choice, preset from the plan or the clock. */}
          {logged ? null : (
            <View className="items-center gap-2 self-stretch">
              <Text className="text-subhead font-semibold text-label-secondary">Log it as</Text>
              <ChipGroup
                testID="cook-slot"
                className="justify-center"
                options={MEAL_SLOTS.map((o) => ({ ...o }))}
                value={[slot]}
                onChange={([next]) => next && setSlot(next)}
              />
            </View>
          )}
          <TrainButton
            testID="cook-log"
            label={logged ? 'Logged to tracker ✓' : 'Log this meal'}
            size="lg"
            className="self-stretch"
            loading={upsertDay.isPending}
            disabled={logged}
            onPress={logMeal}
          />
          {upsertDay.isError && (
            <Text className="text-subhead text-danger">
              {userFacingErrorMessage(upsertDay.error)}
            </Text>
          )}
          {logged && loggedAs ? (
            <View className="items-center gap-1">
              <Text testID="cook-logged-as" className="text-subhead text-label-secondary">
                Logged as {loggedAs.slot}.
              </Text>
              <TrainButton
                testID="cook-log-undo"
                variant="outline"
                label="Undo"
                loading={undoLog.isPending}
                onPress={() =>
                  undoLog.mutate({
                    date: loggedAs.date,
                    recipeId: recipe.id,
                    mealType: loggedAs.slot,
                  })
                }
              />
              {undoLog.isError ? (
                <Text className="text-subhead text-danger">
                  {userFacingErrorMessage(undoLog.error)}
                </Text>
              ) : null}
            </View>
          ) : null}
          {logged && (
            <>
              <RebalanceOffer className="self-stretch" />
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
          <TrainButton variant="outline" label="Done" onPress={() => router.back()} />
        </KeyboardAwareScrollView>
      ) : (
        /* Step view — big text, kitchen-distance readable */
        <View className="flex-1 px-4 pb-6">
          <ScrollView contentContainerClassName="py-4">
            {/* Premium motion #16: each step slides in from the side you're heading. */}
            <Animated.View
              key={safeStep}
              entering={enterFromSide(stepDirection.current)}
              className="gap-5"
            >
              <Text testID="cook-step-text" className="text-title1 font-semibold text-label">
                {stepText}
              </Text>
              {stepAmounts.length > 0 ? (
                <View
                  testID="cook-step-amounts"
                  className="gap-1 rounded-card border border-separator bg-surface p-4"
                >
                  <Text className="text-subhead text-label-secondary">
                    For {formatFractionalQuantity(selectedServings)}{' '}
                    {selectedServings === 1 ? 'serving' : 'servings'}
                  </Text>
                  {stepAmounts.map((a) => (
                    <View key={a.index} className="flex-row items-baseline gap-2">
                      <Text className="shrink-0 text-body font-semibold text-label">
                        {a.amount}
                      </Text>
                      <Text className="min-w-0 flex-1 text-body text-label-secondary">
                        {a.name}
                      </Text>
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
            </Animated.View>
          </ScrollView>
          <View className="flex-row gap-3">
            <TrainButton
              testID="cook-prev"
              variant="outline"
              label="Back"
              size="lg"
              className="flex-1"
              disabled={safeStep === 0}
              onPress={() => {
                stepDirection.current = -1;
                setStep((s) => Math.max(0, s - 1));
              }}
            />
            <TrainButton
              testID="cook-next"
              label={safeStep >= totalSteps - 1 ? 'Finish' : 'Next step'}
              size="lg"
              className="flex-1"
              onPress={() => {
                if (safeStep >= totalSteps - 1) {
                  finishCooking();
                  return;
                }
                stepDirection.current = 1;
                setStep((s) => s + 1);
              }}
            />
          </View>
        </View>
      )}
      <ConfirmSheet testID="cook-leave" {...guard.sheetProps} />
      <Celebration
        testID="cook-celebration"
        play={finished ? finishBurst : 0}
        colors={[colors.brand, colors.positive, colors.attention, colors.info]}
        origin={{ x: 0.5, y: 0.2 }}
      />
    </Screen>
  );
}
