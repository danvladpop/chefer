import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useKeepAwake } from 'expo-keep-awake';
import { router, useLocalSearchParams } from 'expo-router';
import { Button, KeyboardAwareScrollView, Screen, Text } from '@chefer/ui-mobile';
import { cn, formatQuantity, guessMealType, localDateStr, parseStepDuration } from '@chefer/utils';
import { AllergenWarningBanner } from '../../src/features/recipes/allergen-warning';
import { StarRating } from '../../src/features/recipes/star-rating';
import { RebalanceBanner } from '../../src/features/tracker/rebalance-banner';
import { recordRebalance } from '../../src/features/tracker/rebalance-store';
import { useUnitSystem } from '../../src/hooks/use-unit-system';
import { trpc } from '../../src/lib/trpc';

// Cook mode (P1-3) — port of web features/recipes/components/cook-mode.tsx.
// Step-by-step with inline timers (shared parseStepDuration), screen kept
// awake, ingredient checklist, and finish → tracker log (same append
// semantics as web) → star rating. A premium week rebalance triggered by the
// log shows its banner + undo right here on the finish screen.

// Local calendar day, not the UTC one (F-TRK-1-1).
const todayIso = (): string => localDateStr();

function StepTimer({ seconds }: { seconds: number }) {
  const [remaining, setRemaining] = useState(seconds);
  const [running, setRunning] = useState(false);
  const interval = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (!running) {
      return;
    }
    interval.current = setInterval(() => {
      setRemaining((r) => {
        if (r <= 1) {
          setRunning(false);
          return 0;
        }
        return r - 1;
      });
    }, 1000);
    return () => {
      if (interval.current) {
        clearInterval(interval.current);
      }
    };
  }, [running]);

  const mins = Math.floor(remaining / 60);
  const secs = remaining % 60;
  const done = remaining === 0;

  return (
    <Pressable
      testID="step-timer"
      accessibilityRole="button"
      onPress={() => {
        if (done) {
          setRemaining(seconds);
          setRunning(false);
        } else {
          setRunning((r) => !r);
        }
      }}
      className={cn(
        'flex-row items-center gap-2 self-start rounded-full border px-4 py-2',
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
        {done ? 'Time!' : `${mins}:${secs.toString().padStart(2, '0')}`}
      </Text>
    </Pressable>
  );
}

export default function CookModeScreen() {
  useKeepAwake();
  const { id, meal } = useLocalSearchParams<{ id: string; meal?: string }>();
  const mealType = meal ?? guessMealType();
  const unitSystem = useUnitSystem();

  const { data: recipe, isLoading } = trpc.mealPlan.getRecipe.useQuery({ recipeId: id });
  const utils = trpc.useUtils();

  const [step, setStep] = useState(0);
  const [finished, setFinished] = useState(false);
  const [logged, setLogged] = useState(false);
  const [checkedIngredients, setCheckedIngredients] = useState<Set<number>>(new Set());
  const [showIngredients, setShowIngredients] = useState(false);

  const upsertDay = trpc.tracker.logRecipe.useMutation({
    onSuccess: (result) => {
      setLogged(true);
      recordRebalance(result.rebalance);
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
      mealType,
      // One serving eaten — cooking for 4 doesn't mean you ate 4×.
      portionMultiplier: 1,
    });
  };

  if (isLoading || !recipe) {
    return (
      <Screen edges={['top', 'bottom', 'left', 'right']} className="items-center justify-center">
        <ActivityIndicator size="large" color="#944a00" />
      </Screen>
    );
  }

  const totalSteps = recipe.instructions.length;
  const safeStep = Math.min(step, totalSteps - 1);
  const stepText = recipe.instructions[safeStep] ?? '';
  const stepDuration = parseStepDuration(stepText);

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
          {!finished && (
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

      {/* Allergen conflicts stay visible while cooking (F-REC-2-3) */}
      <AllergenWarningBanner warnings={recipe.allergenWarnings} className="mx-4 mb-2" />

      {/* Progress bar */}
      <View className="mx-4 mb-2 h-1.5 overflow-hidden rounded-full bg-gray-100">
        <View
          className="h-full rounded-full bg-primary"
          style={{ width: `${finished ? 100 : ((safeStep + 1) / totalSteps) * 100}%` }}
        />
      </View>

      {showIngredients ? (
        /* Ingredient checklist */
        <ScrollView contentContainerClassName="gap-2 px-4 py-3 pb-8">
          <Text variant="heading">Ingredients</Text>
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
                  {formatQuantity(ing.quantity, ing.unit, unitSystem)} {ing.name}
                </Text>
              </Pressable>
            );
          })}
          <Button className="mt-2" onPress={() => setShowIngredients(false)}>
            Back to cooking
          </Button>
        </ScrollView>
      ) : finished ? (
        /* Done screen */
        <KeyboardAwareScrollView
          keyboardShouldPersistTaps="handled"
          contentContainerClassName="items-center gap-4 px-6 py-10"
        >
          <Text className="text-5xl">🎉</Text>
          <Text testID="cook-finished" variant="title" className="text-center">
            Enjoy your {mealType}!
          </Text>
          <Text variant="muted" className="text-center text-sm">
            Log it to today&apos;s tracker so your nutrition stays honest.
          </Text>
          <Button
            testID="cook-log"
            loading={upsertDay.isPending}
            disabled={logged}
            onPress={logMeal}
          >
            {logged ? 'Logged to tracker ✓' : 'Log this meal'}
          </Button>
          {upsertDay.isError && (
            <Text className="text-xs text-red-600">{upsertDay.error.message}</Text>
          )}
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
            {stepDuration !== null && <StepTimer key={safeStep} seconds={stepDuration} />}
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
              onPress={() =>
                safeStep >= totalSteps - 1 ? setFinished(true) : setStep((s) => s + 1)
              }
            >
              {safeStep >= totalSteps - 1 ? 'Finish' : 'Next step'}
            </Button>
          </View>
        </View>
      )}
    </Screen>
  );
}
