import { useEffect, useRef, useState } from 'react';
import { View } from 'react-native';
import { skipToken } from '@tanstack/react-query';
import {
  isPlausibleHeightCm,
  isPlausibleWeightKg,
  MAX_BODY_METRICS_AGE,
  MIN_BODY_METRICS_AGE,
} from '@chefer/types';
import { Button, Card, Text } from '@chefer/ui-mobile';
import {
  bodyFieldTexts,
  heightCmFromText,
  lifterProteinNote,
  weightKgFromText,
} from '@chefer/utils';
import { trpc } from '../../lib/trpc';
import { HEALTH_DECLINED_BODY_NOTICE } from '../privacy/copy';
import { HealthDeclinedNotice } from '../privacy/health-notices';
import { useHealthConsent } from '../privacy/use-health-consent';
import { GoalStep } from './components/goal-step';
import { metricsFieldErrors, MetricsStep } from './components/metrics-step';
import type { ActivityLevel, BiologicalSex, Goal, MetricsValue } from './types';

export interface GoalBodyInitialData {
  goal: Goal | null;
  biologicalSex: BiologicalSex | null;
  age: number | null;
  heightCm: number | null;
  weightKg: number | null;
  activityLevel: ActivityLevel | null;
}

export interface GoalBodySavePayload {
  goal?: Goal;
  biologicalSex?: BiologicalSex;
  age?: number;
  heightCm?: number;
  weightKg?: number;
  activityLevel?: ActivityLevel;
}

export interface GoalBodyCardProps {
  initial: GoalBodyInitialData;
  onSave: (payload: GoalBodySavePayload) => void;
  isSaving: boolean;
  isSaved: boolean;
  errorMessage?: string | null;
  /**
   * The unit system height and weight are typed in (the saved preference).
   * Imperial shows feet + inches and pounds; the stored values stay cm / kg.
   * Defaults to metric (UX-ONB-05).
   */
  units?: 'METRIC' | 'IMPERIAL';
}

/**
 * "Goal & body" — dogfood feedback #6: goal + body metrics are storable on
 * EVERY tier via preferences.saveProfileBasics (protectedProcedure, not
 * premium), so the dashboard ring/tracker show a real target instead of the
 * 2,000 kcal default. Port of the goal + metrics steps web's onboarding
 * wizard uses for its free tier, and web's PreferencesForm premium goal/
 * metrics sections (apps/web/src/features/preferences/components/preferences-form.tsx),
 * with height and weight typed in the saved units (feet + inches, or cm; lb or kg).
 */
export function GoalBodyCard({
  initial,
  onSave,
  isSaving,
  isSaved,
  errorMessage,
  units = 'METRIC',
}: GoalBodyCardProps) {
  const [goal, setGoal] = useState<Goal | null>(initial.goal);
  const [metrics, setMetrics] = useState<MetricsValue>({
    biologicalSex: initial.biologicalSex,
    age: initial.age,
    heightCm: initial.heightCm,
    weightKg: initial.weightKg,
    activityLevel: initial.activityLevel,
  });
  const initialTexts = bodyFieldTexts(initial, units);
  const [ageText, setAgeText] = useState(initial.age?.toString() ?? '');
  const [heightText, setHeightText] = useState(initialTexts.heightText);
  const [inchesText, setInchesText] = useState(initialTexts.inchesText);
  const [weightText, setWeightText] = useState(initialTexts.weightText);
  const [loaded, setLoaded] = useState(false);
  // T-26.2: goal + body metrics are health information — asked once, on the first save.
  const { requestHealthConsent, healthConsentSheet } = useHealthConsent();
  const [declined, setDeclined] = useState(false);

  // Bug B-38: "Saved ✓" used to stick regardless of edits made after the
  // save. Captured synchronously at the moment `handleSave` is pressed (not
  // reactively off `isSaved`, which would race the hydration effect below:
  // both could fire in the same commit, off stale pre-hydration closures) —
  // any edit after that point makes the button honest again.
  const [savedSnapshot, setSavedSnapshot] = useState<{
    goal: Goal | null;
    metrics: MetricsValue;
  } | null>(null);
  const dirty =
    savedSnapshot !== null &&
    (savedSnapshot.goal !== goal ||
      JSON.stringify(savedSnapshot.metrics) !== JSON.stringify(metrics));

  // Only hydrate from the server once the query resolves — mirrors the
  // existing preferences.tsx `safetyLoaded` pattern so typing isn't clobbered
  // by a refetch.
  useEffect(() => {
    if (loaded) return;
    if (
      initial.goal === null &&
      initial.biologicalSex === null &&
      initial.age === null &&
      initial.heightCm === null &&
      initial.weightKg === null &&
      initial.activityLevel === null
    ) {
      return;
    }
    setGoal(initial.goal);
    setMetrics({
      biologicalSex: initial.biologicalSex,
      age: initial.age,
      heightCm: initial.heightCm,
      weightKg: initial.weightKg,
      activityLevel: initial.activityLevel,
    });
    const texts = bodyFieldTexts(initial, units);
    setAgeText(initial.age?.toString() ?? '');
    setHeightText(texts.heightText);
    setInchesText(texts.inchesText);
    setWeightText(texts.weightText);
    setLoaded(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- run once per server payload, see comment above
  }, [initial]);

  // The saved units can arrive (or change) after the fields were filled: show
  // the same stored height and weight in the new unit instead of re-reading
  // the typed digits as the wrong one.
  const lastUnits = useRef(units);
  useEffect(() => {
    if (lastUnits.current === units) return;
    lastUnits.current = units;
    const texts = bodyFieldTexts(metrics, units);
    setHeightText(texts.heightText);
    setInchesText(texts.inchesText);
    setWeightText(texts.weightText);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- re-format only when the units change
  }, [units]);

  // Lifter protein (audit follow-up): the server applies the dashboard's
  // rules, so a lifter's preview shows their bodyweight protein and why.
  const previewInput =
    goal !== null &&
    metrics.biologicalSex !== null &&
    metrics.activityLevel !== null &&
    metrics.age !== null &&
    metrics.age >= MIN_BODY_METRICS_AGE &&
    metrics.age <= MAX_BODY_METRICS_AGE &&
    metrics.heightCm !== null &&
    isPlausibleHeightCm(metrics.heightCm) &&
    metrics.weightKg !== null &&
    isPlausibleWeightKg(metrics.weightKg)
      ? {
          goal,
          biologicalSex: metrics.biologicalSex,
          age: Math.round(metrics.age),
          heightCm: metrics.heightCm,
          weightKg: metrics.weightKg,
          activityLevel: metrics.activityLevel,
        }
      : null;
  const preview = trpc.preferences.computeTargets.useQuery(previewInput ?? skipToken, {
    placeholderData: (prev) => prev,
    staleTime: 60_000,
  }).data;
  const lifterProtein =
    previewInput !== null && preview?.lifter
      ? { proteinG: preview.proteinG, note: lifterProteinNote(preview.lifter.proteinGPerKg) }
      : null;

  function handleAgeText(raw: string) {
    setAgeText(raw);
    const n = parseInt(raw, 10);
    setMetrics((m) => ({ ...m, age: raw === '' || isNaN(n) ? null : n }));
  }
  function handleHeightText(raw: string) {
    setHeightText(raw);
    setMetrics((m) => ({ ...m, heightCm: heightCmFromText(raw, inchesText, units) }));
  }
  function handleInchesText(raw: string) {
    setInchesText(raw);
    setMetrics((m) => ({ ...m, heightCm: heightCmFromText(heightText, raw, units) }));
  }
  function handleWeightText(raw: string) {
    setWeightText(raw);
    setMetrics((m) => ({ ...m, weightKg: weightKgFromText(raw, units) }));
  }

  // R-02 / UX-ONB-05: an age under 16 (or over 110) and a height or weight
  // outside the plausible range are never sent; Save stays disabled until they
  // are fixed or cleared. The messages show under the fields.
  const hasFieldError = Object.values(metricsFieldErrors(metrics, units)).some((e) => e !== null);

  function handleSave() {
    if (hasFieldError) return;
    const payload: GoalBodySavePayload = {
      ...(goal !== null && { goal }),
      ...(metrics.biologicalSex !== null && { biologicalSex: metrics.biologicalSex }),
      ...(metrics.age !== null && { age: metrics.age }),
      ...(metrics.heightCm !== null &&
        isPlausibleHeightCm(metrics.heightCm) && { heightCm: metrics.heightCm }),
      ...(metrics.weightKg !== null &&
        isPlausibleWeightKg(metrics.weightKg) && { weightKg: metrics.weightKg }),
      ...(metrics.activityLevel !== null && { activityLevel: metrics.activityLevel }),
    };
    setDeclined(false);
    requestHealthConsent(
      () => {
        // Bug B-38: snapshot exactly what's being sent, so a later edit is judged
        // against it — not against whatever the server eventually echoes back.
        setSavedSnapshot({ goal, metrics });
        onSave(payload);
      },
      {
        hasHealthData: Object.keys(payload).length > 0,
        // "Don't save it": nothing goes to the server; the fields stay on screen.
        onDeclined: () => setDeclined(true),
      },
    );
  }

  return (
    <Card testID="preferences-goal-body" className="gap-4">
      <View className="gap-1">
        <Text variant="heading">Goal & body</Text>
        <Text variant="muted" className="text-xs">
          Optional, and available on every plan — with these, your calorie target is computed from
          your body instead of a default.
        </Text>
      </View>

      <View className="gap-2">
        <Text variant="label">Goal</Text>
        <GoalStep value={goal} onChange={setGoal} compact showDisclaimer={false} />
      </View>

      <MetricsStep
        value={metrics}
        onChange={setMetrics}
        goal={goal}
        lifterProtein={lifterProtein}
        ageText={ageText}
        heightText={heightText}
        heightInchesText={inchesText}
        weightText={weightText}
        onAgeText={handleAgeText}
        onHeightText={handleHeightText}
        onHeightInchesText={handleInchesText}
        onWeightText={handleWeightText}
        units={units}
      />

      <Button
        testID="prefs-save-goal-body"
        loading={isSaving}
        disabled={hasFieldError}
        onPress={handleSave}
      >
        {isSaved && !dirty ? 'Saved ✓' : 'Save goal & body'}
      </Button>
      {errorMessage && <Text className="text-xs text-red-600">{errorMessage}</Text>}
      {declined && (
        <HealthDeclinedNotice
          testID="prefs-goal-body-declined"
          message={HEALTH_DECLINED_BODY_NOTICE}
        />
      )}
      {healthConsentSheet}
    </Card>
  );
}
