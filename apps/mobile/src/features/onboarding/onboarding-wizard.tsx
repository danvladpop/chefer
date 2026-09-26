import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { ONBOARDING_INTENTS, type OnboardingIntent } from '@chefer/types';
import { Button, ErrorState, Screen, Text } from '@chefer/ui-mobile';
import { onboardingProgress, onboardingSteps, type OnboardingStepKey } from '@chefer/utils';
import { useIsPremium } from '../../hooks/use-is-premium';
import { trpc } from '../../lib/trpc';
import { setMode } from '../gym/mode-store';
import { HouseholdEditor } from '../household/household-editor';
import { CuisineStep, type CuisineStepValue } from '../preferences/components/cuisine-step';
import { GoalStep } from '../preferences/components/goal-step';
import { MetricsStep } from '../preferences/components/metrics-step';
import { SafetyStep } from '../preferences/components/safety-step';
import type {
  ActivityLevel,
  BiologicalSex,
  Goal,
  MetricsValue,
  SafetyValue,
} from '../preferences/types';
import { IntentStep } from './intent-step';

// Onboarding — dogfood feedback #9: a new account used to land straight on
// the dashboard. Now register (app/(auth)/register.tsx) routes here first.
//
// Mirrors apps/web/src/features/onboarding/components/onboarding-wizard.tsx:
//  - Premium: 4 steps (goal → metrics → diet → cuisine), all saved together
//    via the premium preferences.setup mutation on finish.
//  - Free: 3 steps — safety first (free preferences.updateSafety), then
//    OPTIONAL goal and body metrics (free preferences.saveProfileBasics,
//    P1-2 / ux-fixes-plan 3.1).
// Sign-in never routes here (app/(auth)/login.tsx is unchanged).
//
// Step 0 (backlog P2-3, audit F-PM-6): "What brings you here?" while the
// profile has no intent — households get "Who's at your table?" before the
// food steps, gym-goers go straight to Gym setup (food later). The step list
// is the shared `onboardingSteps`, same as web. No serving-size question:
// the household is the one people model (F-PM-8).

function stepTitle(key: OnboardingStepKey, isPremium: boolean): string {
  switch (key) {
    case 'intent':
      return 'What brings you here?';
    case 'table':
      return 'Who’s at your table?';
    case 'diet':
      return isPremium ? 'Diet & restrictions' : 'Diet & safety';
    case 'goal':
      return 'Your goal';
    case 'metrics':
      return 'Body metrics';
    case 'cuisine':
      return 'Cuisine & cadence';
  }
}

function parseIntent(raw: unknown): OnboardingIntent | null {
  return ONBOARDING_INTENTS.find((i) => i === raw) ?? null;
}

interface CompleteMetrics {
  biologicalSex: BiologicalSex;
  age: number;
  heightCm: number;
  weightKg: number;
  activityLevel: ActivityLevel;
}

/** Type predicate — narrows away the nulls so the setup payload below needs
    no non-null assertions. Mirrors web onboarding-wizard.tsx's canContinue
    validation for its metrics step. */
function isMetricsValid(m: MetricsValue): m is MetricsValue & CompleteMetrics {
  return (
    m.biologicalSex !== null &&
    m.activityLevel !== null &&
    m.age !== null &&
    m.age >= 10 &&
    m.age <= 110 &&
    m.heightCm !== null &&
    m.heightCm > 0 &&
    m.heightCm <= 300 &&
    m.weightKg !== null &&
    m.weightKg > 0 &&
    m.weightKg <= 500
  );
}

function goToDashboard() {
  // Explicit group — bare '/' also matches the guarded (auth)/index and
  // silently no-ops while signed in (same fix as ModeSwitch's onChange).
  router.replace('/(food)');
}

export function OnboardingWizard() {
  const isPremium = useIsPremium();
  const utils = trpc.useUtils();
  const [step, setStep] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const [goal, setGoal] = useState<Goal | null>(null);
  const [metrics, setMetrics] = useState<MetricsValue>({
    biologicalSex: null,
    age: null,
    heightCm: null,
    weightKg: null,
    activityLevel: null,
  });
  const [ageText, setAgeText] = useState('');
  const [heightText, setHeightText] = useState('');
  const [weightText, setWeightText] = useState('');
  const [safety, setSafety] = useState<SafetyValue>({
    dietaryRestrictions: [],
    allergies: [],
    dislikedIngredients: [],
  });
  const [cuisine, setCuisine] = useState<CuisineStepValue>({
    cuisinePreferences: [],
    mealsPerDay: 3,
  });
  const [intent, setIntent] = useState<OnboardingIntent | null>(null);

  // Start from what's already saved: a wizard re-opened after upgrading used
  // to start blank, and Finish saved empty allergy lists over the real ones
  // (audit F-ONB-1-1). Mirrors web's wizardDataFromPreferences.
  const savedPrefs = trpc.preferences.get.useQuery();
  // The saved intent, captured once: a saved answer skips the question.
  const savedIntent = useRef<OnboardingIntent | null | undefined>(undefined);
  if (savedIntent.current === undefined && savedPrefs.data) {
    savedIntent.current = parseIntent(savedPrefs.data.chefProfile?.onboardingIntent);
  }
  const hydrated = useRef(false);
  useEffect(() => {
    const saved = savedPrefs.data;
    if (!saved || hydrated.current) return;
    hydrated.current = true;
    const profile = saved.chefProfile;
    const diet = saved.dietaryPreferences;
    if (profile) {
      setGoal(profile.goal ?? null);
      setMetrics({
        biologicalSex: profile.biologicalSex ?? null,
        age: profile.age ?? null,
        heightCm: profile.heightCm ?? null,
        weightKg: profile.weightKg ?? null,
        activityLevel: profile.activityLevel ?? null,
      });
      setAgeText(profile.age != null ? String(profile.age) : '');
      setHeightText(profile.heightCm != null ? String(profile.heightCm) : '');
      setWeightText(profile.weightKg != null ? String(profile.weightKg) : '');
    }
    if (diet) {
      setSafety({
        dietaryRestrictions: diet.dietaryRestrictions,
        allergies: diet.allergies,
        dislikedIngredients: diet.dislikedIngredients,
      });
      setCuisine({
        cuisinePreferences: diet.cuisinePreferences,
        mealsPerDay: diet.mealsPerDay,
      });
    }
  }, [savedPrefs.data]);

  const setupMutation = trpc.preferences.setup.useMutation({
    onError: (err) => setError(err.message),
  });
  const safetyMutation = trpc.preferences.updateSafety.useMutation({
    onError: (err) => setError(err.message),
  });
  const profileBasicsMutation = trpc.preferences.saveProfileBasics.useMutation({
    onError: (err) => setError(err.message),
  });
  const intentMutation = trpc.preferences.setIntent.useMutation({
    onError: (err) => setError(err.message),
  });

  // Saved prefs failed to load: a blank wizard could save empty safety
  // lists, so show an error instead (F-ONB-1-1, F-X-3-1).
  if (savedPrefs.isError && !savedPrefs.data) {
    return (
      <Screen edges={['top', 'bottom', 'left', 'right']} className="items-center justify-center">
        <ErrorState
          title="Couldn't load your setup"
          description="Nothing has been changed. Check your connection and try again."
          icon={<Ionicons name="cloud-offline-outline" size={40} color="#9ca3af" />}
          onRetry={() => void savedPrefs.refetch()}
        />
      </Screen>
    );
  }

  // Wait for saved prefs too, so Finish can't submit a blank wizard.
  if (isPremium === undefined || savedPrefs.isLoading) {
    return (
      <Screen edges={['top', 'bottom', 'left', 'right']} className="items-center justify-center">
        <ActivityIndicator size="large" color="#944a00" />
      </Screen>
    );
  }

  const askIntent = (savedIntent.current ?? null) === null;
  const steps = onboardingSteps({
    intent: askIntent ? intent : (savedIntent.current ?? null),
    askIntent,
    isPremium,
  });
  const totalSteps = steps.length;
  const stepKey: OnboardingStepKey = steps[Math.min(step, totalSteps - 1)] ?? 'diet';
  // "Step 1" with no total while the intent question is open: the answer
  // changes the total, and the counter must never grow (4 → 5).
  const progress = onboardingProgress(steps, step);
  const progressPct = progress.percent ?? 0;
  const isSubmitting =
    setupMutation.isPending ||
    safetyMutation.isPending ||
    profileBasicsMutation.isPending ||
    intentMutation.isPending;

  function handleAgeText(raw: string) {
    setAgeText(raw);
    const n = parseInt(raw, 10);
    setMetrics((m) => ({ ...m, age: raw === '' || isNaN(n) ? null : n }));
  }
  function handleHeightText(raw: string) {
    setHeightText(raw);
    const n = parseFloat(raw.replace(',', '.'));
    setMetrics((m) => ({ ...m, heightCm: raw === '' || isNaN(n) ? null : n }));
  }
  function handleWeightText(raw: string) {
    setWeightText(raw);
    const n = parseFloat(raw.replace(',', '.'));
    setMetrics((m) => ({ ...m, weightKg: raw === '' || isNaN(n) ? null : n }));
  }

  async function handleFinish() {
    if (isPremium) {
      if (!goal || !isMetricsValid(metrics)) {
        return;
      }
      try {
        await setupMutation.mutateAsync({
          goal,
          biologicalSex: metrics.biologicalSex,
          age: metrics.age,
          heightCm: metrics.heightCm,
          weightKg: metrics.weightKg,
          activityLevel: metrics.activityLevel,
          dietaryRestrictions: safety.dietaryRestrictions,
          allergies: safety.allergies,
          dislikedIngredients: safety.dislikedIngredients,
          cuisinePreferences: cuisine.cuisinePreferences,
          mealsPerDay: cuisine.mealsPerDay,
        });
        void utils.preferences.invalidate();
        void utils.dashboard.invalidate();
        goToDashboard();
      } catch {
        // onError already surfaced the message.
      }
      return;
    }

    // Free tier: safety is always saved; goal + metrics are optional but
    // storable (every-tier saveProfileBasics) — same finish action as web.
    try {
      await safetyMutation.mutateAsync(safety);
      const basics = {
        ...(goal !== null && { goal }),
        ...(metrics.biologicalSex !== null && { biologicalSex: metrics.biologicalSex }),
        ...(metrics.age !== null && metrics.age > 0 && { age: metrics.age }),
        ...(metrics.heightCm !== null && metrics.heightCm > 0 && { heightCm: metrics.heightCm }),
        ...(metrics.weightKg !== null && metrics.weightKg > 0 && { weightKg: metrics.weightKg }),
        ...(metrics.activityLevel !== null && { activityLevel: metrics.activityLevel }),
      };
      if (Object.keys(basics).length > 0) {
        await profileBasicsMutation.mutateAsync(basics);
      }
      void utils.preferences.invalidate();
      void utils.dashboard.invalidate();
      goToDashboard();
    } catch {
      // onError already surfaced the message.
    }
  }

  function handleSkip() {
    if (isPremium) {
      // The premium setup mutation is all-or-nothing (needs goal + full
      // metrics), so there's nothing partial to save — just leave.
      goToDashboard();
      return;
    }
    // Free tier: every field is optional and its procedures accept partial
    // data any time, so Skip saves whatever is already filled in, same as
    // Finish would.
    void handleFinish();
  }

  function handleBack() {
    if (step > 0) {
      setStep((s) => s - 1);
      return;
    }
    goToDashboard();
  }

  async function handleIntentContinue() {
    if (intent === null) {
      return;
    }
    try {
      await intentMutation.mutateAsync({ intent });
    } catch {
      return; // onError surfaced it
    }
    if (intent === 'TRAIN') {
      // Gym-goers set up training first; food setup can wait (F-PM-6). Same
      // path as the Food | Gym switch: Today underneath, Setup on top.
      setMode('gym');
      router.replace('/today');
      router.push('/gym/setup');
      return;
    }
    setStep((s) => s + 1);
  }

  function handleContinue() {
    setError(null);
    if (stepKey === 'intent') {
      void handleIntentContinue();
      return;
    }
    if (step < totalSteps - 1) {
      setStep((s) => s + 1);
    } else {
      void handleFinish();
    }
  }

  // ── Step content ─────────────────────────────────────────────────────────

  let content: React.ReactNode = null;
  const metricsStep = (
    <MetricsStep
      value={metrics}
      onChange={setMetrics}
      goal={goal}
      ageText={ageText}
      heightText={heightText}
      weightText={weightText}
      onAgeText={handleAgeText}
      onHeightText={handleHeightText}
      onWeightText={handleWeightText}
    />
  );
  if (stepKey === 'intent') {
    content = <IntentStep value={intent} onChange={setIntent} />;
  } else if (stepKey === 'table') {
    content = (
      <View className="gap-3">
        <Text variant="muted" className="text-sm">
          Add the people you cook for. Their allergies and restrictions apply to every plan — free.
          You can change this any time from Profile → Household.
        </Text>
        <HouseholdEditor variant="onboarding" />
      </View>
    );
  } else if (stepKey === 'diet') {
    content = <SafetyStep value={safety} onChange={setSafety} testIDPrefix="onb" />;
  } else if (stepKey === 'cuisine') {
    content = <CuisineStep value={cuisine} onChange={setCuisine} />;
  } else if (isPremium) {
    content = stepKey === 'goal' ? <GoalStep value={goal} onChange={setGoal} /> : metricsStep;
  } else if (stepKey === 'goal') {
    content = (
      <View className="gap-3">
        <Text variant="muted" className="text-center text-sm">
          Optional — skip if you just want chef-picked meals.
        </Text>
        <GoalStep value={goal} onChange={setGoal} />
      </View>
    );
  } else {
    content = (
      <View className="gap-3">
        <Text variant="muted" className="text-center text-sm">
          Optional — with these, your calorie target is computed from your body instead of a
          default.
        </Text>
        {metricsStep}
      </View>
    );
  }

  const canContinue =
    stepKey === 'intent'
      ? intent !== null
      : isPremium
        ? stepKey === 'goal'
          ? goal !== null
          : stepKey === 'metrics'
            ? isMetricsValid(metrics)
            : true
        : true;

  return (
    <Screen edges={['top', 'bottom', 'left', 'right']} className="px-0">
      {/* Header: back, progress, skip */}
      <View className="flex-row items-center gap-2 px-4 py-3">
        <Pressable
          testID="onboarding-back"
          accessibilityRole="button"
          accessibilityLabel="Back"
          onPress={handleBack}
          className="h-11 w-11 items-center justify-center"
        >
          <Ionicons name="arrow-back" size={20} color="#1f2937" />
        </Pressable>
        <View className="flex-1">
          <Text variant="muted" className="text-xs">
            {progress.percent === null
              ? progress.label
              : `${progress.label} · ${progress.percent}%`}
          </Text>
          <Text testID="onboarding-title" variant="heading">
            {stepTitle(stepKey, isPremium)}
          </Text>
        </View>
      </View>

      {/* Progress bar */}
      <View
        testID="onboarding-progress"
        accessibilityRole="progressbar"
        accessibilityValue={
          progress.total === null
            ? { text: progress.label }
            : { min: 1, max: progress.total, now: step + 1 }
        }
        className="mx-4 mb-2 h-1.5 overflow-hidden rounded-full bg-gray-100"
      >
        <View className="h-full rounded-full bg-primary" style={{ width: `${progressPct}%` }} />
      </View>

      <ScrollView
        contentContainerClassName="gap-4 px-4 py-3 pb-8"
        keyboardShouldPersistTaps="handled"
      >
        {content}
        {error && (
          <View className="rounded-md bg-red-50 px-4 py-3">
            <Text className="text-sm text-red-600">{error}</Text>
          </View>
        )}
      </ScrollView>

      {/* Primary Continue button — bottom, thumb reach */}
      <View className="gap-2 border-t border-border px-4 pb-2 pt-3">
        <Button
          testID="onboarding-continue"
          loading={isSubmitting}
          disabled={!canContinue || isSubmitting}
          onPress={handleContinue}
        >
          {stepKey === 'intent' && intent === 'TRAIN'
            ? 'Set up training'
            : step === totalSteps - 1
              ? 'Finish'
              : 'Continue'}
        </Button>
        {/* Skip sits under Continue: thumb reach, and clear of the top-right
            corner (the dev-client Tools bubble swallowed taps there). */}
        <Pressable
          testID="onboarding-skip"
          accessibilityRole="button"
          onPress={handleSkip}
          disabled={isSubmitting}
          className="h-11 items-center justify-center"
        >
          <Text className="text-sm font-semibold text-primary">Skip for now</Text>
        </Pressable>
      </View>
    </Screen>
  );
}
