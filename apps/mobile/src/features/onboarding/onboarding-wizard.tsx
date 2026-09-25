import { useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { Button, Screen, Text } from '@chefer/ui-mobile';
import { useIsPremium } from '../../hooks/use-is-premium';
import { trpc } from '../../lib/trpc';
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

const FREE_TITLES = ['Diet & safety', 'Your goal', 'Body metrics'];
const PREMIUM_TITLES = ['Your goal', 'Body metrics', 'Diet & restrictions', 'Cuisine & cadence'];

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
    servingSize: 1,
  });

  const setupMutation = trpc.preferences.setup.useMutation({
    onError: (err) => setError(err.message),
  });
  const safetyMutation = trpc.preferences.updateSafety.useMutation({
    onError: (err) => setError(err.message),
  });
  const profileBasicsMutation = trpc.preferences.saveProfileBasics.useMutation({
    onError: (err) => setError(err.message),
  });

  if (isPremium === undefined) {
    return (
      <Screen edges={['top', 'bottom', 'left', 'right']} className="items-center justify-center">
        <ActivityIndicator size="large" color="#944a00" />
      </Screen>
    );
  }

  const totalSteps = isPremium ? 4 : 3;
  const titles = isPremium ? PREMIUM_TITLES : FREE_TITLES;
  const progressPct = Math.round(((step + 1) / totalSteps) * 100);
  const isSubmitting =
    setupMutation.isPending || safetyMutation.isPending || profileBasicsMutation.isPending;

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
          servingSize: cuisine.servingSize,
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

  function handleContinue() {
    if (step < totalSteps - 1) {
      setStep((s) => s + 1);
    } else {
      void handleFinish();
    }
  }

  // ── Step content ─────────────────────────────────────────────────────────

  let content: React.ReactNode = null;
  if (isPremium) {
    if (step === 0) {
      content = <GoalStep value={goal} onChange={setGoal} />;
    } else if (step === 1) {
      content = (
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
    } else if (step === 2) {
      content = <SafetyStep value={safety} onChange={setSafety} testIDPrefix="onb" />;
    } else {
      content = <CuisineStep value={cuisine} onChange={setCuisine} />;
    }
  } else {
    if (step === 0) {
      content = <SafetyStep value={safety} onChange={setSafety} testIDPrefix="onb" />;
    } else if (step === 1) {
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
        </View>
      );
    }
  }

  const canContinue = isPremium
    ? step === 0
      ? goal !== null
      : step === 1
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
            Step {step + 1} of {totalSteps} · {progressPct}%
          </Text>
          <Text testID="onboarding-title" variant="heading">
            {titles[step]}
          </Text>
        </View>
        <Pressable
          testID="onboarding-skip"
          accessibilityRole="button"
          onPress={handleSkip}
          disabled={isSubmitting}
          className="h-11 items-center justify-center px-2"
        >
          <Text className="text-sm font-semibold text-primary">Skip</Text>
        </Pressable>
      </View>

      {/* Progress bar */}
      <View
        testID="onboarding-progress"
        accessibilityRole="progressbar"
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
          {step === totalSteps - 1 ? 'Finish' : 'Continue'}
        </Button>
      </View>
    </Screen>
  );
}
