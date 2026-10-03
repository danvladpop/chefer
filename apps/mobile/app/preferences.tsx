import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { DISPLAY_CURRENCIES, type DisplayCurrency } from '@chefer/types';
import {
  Button,
  Card,
  ErrorState,
  Input,
  KeyboardAwareScrollView,
  Screen,
  Text,
} from '@chefer/ui-mobile';
import {
  cn,
  currencySymbol,
  formatKcal,
  fromEur,
  toDisplayCurrency,
  toEur,
  userFacingErrorMessage,
} from '@chefer/utils';
import { AutoPlanToggle } from '../src/features/preferences/auto-plan-toggle';
import { SafetyStep } from '../src/features/preferences/components/safety-step';
import { GoalBodyCard, type GoalBodySavePayload } from '../src/features/preferences/goal-body-card';
import { HomeDisplayToggle } from '../src/features/preferences/home-display-toggle';
import { TargetsCard } from '../src/features/preferences/targets-card';
import type {
  ActivityLevel,
  BiologicalSex,
  Goal,
  SafetyValue,
} from '../src/features/preferences/types';
import { useNumericChain } from '../src/features/preferences/use-numeric-chain';
import { WeeklyUpdatesCard } from '../src/features/preferences/weekly-updates-card';
import { openPremium } from '../src/features/premium/open-premium';
import { HealthDeclinedNotice } from '../src/features/privacy/health-notices';
import { useHealthConsent } from '../src/features/privacy/use-health-consent';
import { MigrationCard } from '../src/features/safety/migration-card';
import type { SafetyPickerHandle } from '../src/features/safety/safety-picker';
import { useIsPremium } from '../src/hooks/use-is-premium';
import { trpc } from '../src/lib/trpc';

// Preferences — port of apps/web /preferences (M2-7), plus dogfood feedback
// #6: goal + body metrics are back, saved through the every-tier
// preferences.saveProfileBasics procedure (not premium-gated) so a free
// account can set a goal and see a real calorie target on the dashboard.
// Safety preferences (allergies, restrictions, dislikes) are FREE (P1-2) and
// save through updateSafety; units + currency are FREE too (backlog P2-6,
// audit F-DASH-3-2) and save through setDisplayPreferences; the weekly
// budget stays premium (updateTargets), typed in the user's currency and
// stored in EUR.

/** EUR budget → input text in `currency` (55.56 EUR → "60" USD). */
function budgetText(budgetEur: number | null | undefined, currency: DisplayCurrency): string {
  if (budgetEur == null) return '';
  return String(Math.round(fromEur(budgetEur, currency) * 100) / 100);
}

export default function PreferencesScreen() {
  const isPremium = useIsPremium();
  const { data, isLoading, isError, refetch } = trpc.preferences.get.useQuery();
  const utils = trpc.useUtils();
  // T-26.2: allergies/diets/dislikes are health information — asked once, on the first save.
  const { requestHealthConsent, healthConsentSheet } = useHealthConsent();
  const [safetyDeclined, setSafetyDeclined] = useState(false);

  // ── Safety (free) ──────────────────────────────────────────────────────────
  const [safety, setSafety] = useState<SafetyValue>({
    dietaryRestrictions: [],
    allergies: [],
    dislikedIngredients: [],
  });
  const [safetyLoaded, setSafetyLoaded] = useState(false);
  // UX-ACC-01: a term typed in "Something else?" but never added with "+" is
  // flushed into the value on Save (and counts as an unsaved edit meanwhile).
  const safetyPickerRef = useRef<SafetyPickerHandle>(null);
  const [safetyTermPending, setSafetyTermPending] = useState(false);

  // ── Units & currency (free) + budget (premium) ─────────────────────────────
  const savedCurrency = toDisplayCurrency(data?.chefProfile?.deliveryCurrency);
  const [units, setUnits] = useState<'METRIC' | 'IMPERIAL'>('METRIC');
  const [currency, setCurrency] = useState<DisplayCurrency>('EUR');
  const [budget, setBudget] = useState('');
  // UX-X-05: the budget pad gets its own "Done" bar (number pads have no Return on iOS).
  const budgetNumeric = useNumericChain('prefs-budget', 1);

  useEffect(() => {
    if (!data || safetyLoaded) {
      return;
    }
    setSafety({
      dietaryRestrictions: data.dietaryPreferences?.dietaryRestrictions ?? [],
      allergies: data.dietaryPreferences?.allergies ?? [],
      dislikedIngredients: data.dietaryPreferences?.dislikedIngredients ?? [],
    });
    const loadedCurrency = toDisplayCurrency(data.chefProfile?.deliveryCurrency);
    setUnits(data.chefProfile?.preferredUnits ?? 'METRIC');
    setCurrency(loadedCurrency);
    setBudget(budgetText(data.chefProfile?.weeklyBudgetEur, loadedCurrency));
    setSafetyLoaded(true);
  }, [data, safetyLoaded]);

  const safetyMutation = trpc.preferences.updateSafety.useMutation({
    meta: { silent: true },
    onSuccess: () => {
      void utils.preferences.get.invalidate();
      void utils.mealPlan.invalidate();
    },
  });
  const displayMutation = trpc.preferences.setDisplayPreferences.useMutation({
    meta: { silent: true },
    onSuccess: (_result, input) => {
      // The typed budget keeps its value in the new currency.
      if (input.currency && input.currency !== savedCurrency) {
        const amount = parseFloat(budget.replace(',', '.'));
        if (Number.isFinite(amount)) {
          setBudget(budgetText(toEur(amount, savedCurrency), input.currency));
        }
      }
      void utils.preferences.get.invalidate();
      // A unit change also moves the gym's kg/lb (one preference, P2-6).
      void utils.gym.invalidate();
    },
  });
  const targetsMutation = trpc.preferences.updateTargets.useMutation({
    meta: { silent: true },
    onSuccess: () => void utils.preferences.get.invalidate(),
  });
  const goalBodyMutation = trpc.preferences.saveProfileBasics.useMutation({
    meta: { silent: true },
    onSuccess: () => {
      void utils.preferences.get.invalidate();
      void utils.dashboard.invalidate();
    },
  });

  // Bug B-38: "Saved ✓" used to stick on every Preferences save button
  // regardless of edits made after the save. Each snapshot below is captured
  // the moment its mutation's `isSuccess` turns true, so a later edit is
  // compared against exactly what was actually persisted. Gated on
  // `safetyLoaded` too: the hydration effect above sets safety/units/
  // currency/budget from the server on the SAME first commit, and without
  // this gate the snapshot could be captured from the pre-hydration default
  // state a beat too early.
  const [savedSafety, setSavedSafety] = useState<SafetyValue | null>(null);
  useEffect(() => {
    if (safetyMutation.isSuccess && safetyLoaded) setSavedSafety(safety);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [safetyMutation.isSuccess, safetyLoaded]);
  const safetyDirty =
    safetyTermPending ||
    (savedSafety !== null && JSON.stringify(savedSafety) !== JSON.stringify(safety));

  const [savedDisplay, setSavedDisplay] = useState<{
    units: 'METRIC' | 'IMPERIAL';
    currency: DisplayCurrency;
  } | null>(null);
  useEffect(() => {
    if (displayMutation.isSuccess && safetyLoaded) setSavedDisplay({ units, currency });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [displayMutation.isSuccess, safetyLoaded]);
  const displayDirty =
    savedDisplay !== null && (savedDisplay.units !== units || savedDisplay.currency !== currency);

  const [savedBudget, setSavedBudget] = useState<string | null>(null);
  useEffect(() => {
    if (targetsMutation.isSuccess && safetyLoaded) setSavedBudget(budget);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [targetsMutation.isSuccess, safetyLoaded]);
  const budgetDirty = savedBudget !== null && savedBudget !== budget;

  const saveSafety = () => {
    // null = a typed term still needs a Keep/Remove choice: don't save yet.
    const toSave = safetyPickerRef.current ? safetyPickerRef.current.flush() : safety;
    if (toSave === null) return;
    setSafetyDeclined(false);
    requestHealthConsent(() => safetyMutation.mutate(toSave), {
      // Clearing every list stores nothing health-related — no consent needed.
      hasHealthData:
        toSave.allergies.length +
          toSave.dietaryRestrictions.length +
          toSave.dislikedIngredients.length >
        0,
      // "Don't save it": nothing health-related is stored; say what that means.
      onDeclined: () => setSafetyDeclined(true),
    });
  };

  const saveDisplay = () => displayMutation.mutate({ preferredUnits: units, currency });

  const saveBudget = () => {
    const parsed = parseFloat(budget.replace(',', '.'));
    targetsMutation.mutate({
      weeklyBudgetEur:
        Number.isFinite(parsed) && parsed > 0 ? Math.min(2000, toEur(parsed, savedCurrency)) : null,
    });
  };

  const saveGoalBody = (payload: GoalBodySavePayload) => goalBodyMutation.mutate(payload);

  return (
    <Screen edges={['top', 'bottom', 'left', 'right']} className="px-0">
      <View className="flex-row items-center gap-3 px-4 py-3">
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Back"
          onPress={() => router.back()}
          className="h-11 w-11 items-center justify-center"
        >
          <Ionicons name="arrow-back" size={20} color="#1f2937" />
        </Pressable>
        <Text testID="preferences-title" variant="title">
          Preferences
        </Text>
      </View>

      {isLoading ? (
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator size="large" color="#944a00" />
        </View>
      ) : isError && !data ? (
        // Never show an empty form over data we couldn't load — saving it
        // wrote empty allergy lists over the real ones (F-ONB-2-1).
        <ErrorState
          title="Couldn't load your preferences"
          description="Nothing has been changed. Check your connection and try again."
          icon={<Ionicons name="cloud-offline-outline" size={40} color="#9ca3af" />}
          onRetry={() => void refetch()}
        />
      ) : (
        // UX-X-05: keyboard-aware, so the budget field and the Save button under
        // it (and the targets fields) scroll clear of the keyboard.
        <KeyboardAwareScrollView
          testID="preferences-scroll"
          contentContainerClassName="gap-4 px-4 pb-8"
        >
          <Text variant="muted" className="text-sm">
            Your allergies and dietary restrictions apply to every plan — free or premium.
          </Text>

          {isPremium === true && data?.chefProfile?.dailyCalorieTarget != null && (
            <View className="self-start rounded-lg border border-primary/30 bg-accent px-4 py-2">
              <Text className="text-sm font-medium text-primary">
                {formatKcal(data.chefProfile.dailyCalorieTarget)} kcal / day — current target
              </Text>
            </View>
          )}

          {/* T-01.3: one-time free-text migration card */}
          <MigrationCard />

          {/* Safety — free for every account (P1-2) */}
          <Card testID="preferences-safety" className="gap-4">
            <Text variant="heading">Food safety</Text>
            <SafetyStep
              ref={safetyPickerRef}
              value={safety}
              onChange={setSafety}
              onPendingChange={setSafetyTermPending}
              testIDPrefix="prefs"
            />
            <Button
              testID="prefs-save-safety"
              loading={safetyMutation.isPending}
              onPress={saveSafety}
            >
              {safetyMutation.isSuccess && !safetyDirty ? 'Saved ✓' : 'Save safety preferences'}
            </Button>
            {safetyMutation.isError && (
              <Text className="text-xs text-red-600">
                {userFacingErrorMessage(safetyMutation.error)}
              </Text>
            )}
            {safetyDeclined && <HealthDeclinedNotice testID="prefs-safety-declined" />}
          </Card>

          {/* Goal & body — every tier (dogfood feedback #6) */}
          <GoalBodyCard
            initial={{
              goal: (data?.chefProfile?.goal as Goal | null) ?? null,
              biologicalSex: (data?.chefProfile?.biologicalSex as BiologicalSex | null) ?? null,
              age: data?.chefProfile?.age ?? null,
              heightCm: data?.chefProfile?.heightCm ?? null,
              weightKg: data?.chefProfile?.weightKg ?? null,
              activityLevel: (data?.chefProfile?.activityLevel as ActivityLevel | null) ?? null,
            }}
            onSave={saveGoalBody}
            isSaving={goalBodyMutation.isPending}
            isSaved={goalBodyMutation.isSuccess}
            errorMessage={
              goalBodyMutation.error ? userFacingErrorMessage(goalBodyMutation.error) : undefined
            }
          />

          {/* §2.11, T-35.3 — Suggested (computed) or My own (never moved
              silently — gym setup, a weigh-in or a goal edit only propose). */}
          <TargetsCard />

          {isPremium === true && (
            <Pressable
              testID="prefs-open-onboarding"
              accessibilityRole="button"
              onPress={() => router.push('/onboarding')}
              className="min-h-11 flex-row items-center justify-between rounded-xl border border-border bg-card px-4"
            >
              <Text className="text-sm font-medium text-gray-800">
                Full setup: cuisine, cadence & targets
              </Text>
              <Ionicons name="chevron-forward" size={16} color="#9ca3af" />
            </Pressable>
          )}

          {/* T-04.5: an explicit choice overrides the goal-derived B-31 default. */}
          <HomeDisplayToggle
            initialEnabled={
              data?.chefProfile?.showNutritionOnToday ?? data?.chefProfile?.goal != null
            }
          />

          {/* Every tier since P2-5: free users get a curated Sunday week. */}
          <AutoPlanToggle
            initialEnabled={data?.chefProfile?.autoPlanWeekly ?? true}
            isPremium={isPremium === true}
          />
          <WeeklyUpdatesCard />

          {/* Units & currency — free for every account (P2-6, F-DASH-3-2) */}
          <Card testID="preferences-display" className="gap-4">
            <Text variant="heading">Units & currency</Text>
            <View className="gap-2">
              <Text variant="label">Measurement units</Text>
              <View className="flex-row gap-2">
                {(['METRIC', 'IMPERIAL'] as const).map((u) => (
                  <Pressable
                    key={u}
                    testID={`prefs-units-${u}`}
                    accessibilityRole="radio"
                    accessibilityState={{ selected: units === u }}
                    onPress={() => setUnits(u)}
                    className={cn(
                      'min-h-11 flex-1 items-center justify-center rounded-md border px-2',
                      units === u ? 'border-primary bg-primary' : 'border-border bg-white',
                    )}
                  >
                    <Text
                      className={cn(
                        'text-sm font-medium',
                        units === u ? 'text-primary-foreground' : 'text-gray-600',
                      )}
                    >
                      {u === 'METRIC' ? 'Metric (g, kg)' : 'Imperial (oz, lb)'}
                    </Text>
                  </Pressable>
                ))}
              </View>
              <Text variant="muted" className="text-xs">
                Recipes, shopping lists, your body weight and gym loads all use this system.
              </Text>
            </View>
            <View className="gap-2">
              <Text variant="label">Currency</Text>
              <View className="flex-row flex-wrap gap-2">
                {DISPLAY_CURRENCIES.map((c) => (
                  <Pressable
                    key={c}
                    testID={`prefs-currency-${c}`}
                    accessibilityRole="radio"
                    accessibilityState={{ selected: currency === c }}
                    onPress={() => setCurrency(c)}
                    className={cn(
                      'h-11 min-w-16 items-center justify-center rounded-md border px-3',
                      currency === c ? 'border-primary bg-primary' : 'border-border bg-white',
                    )}
                  >
                    <Text
                      className={cn(
                        'text-sm font-medium',
                        currency === c ? 'text-primary-foreground' : 'text-gray-600',
                      )}
                    >
                      {c}
                    </Text>
                  </Pressable>
                ))}
              </View>
              <Text variant="muted" className="text-xs">
                Prices are estimates from typical supermarket prices
                {currency !== 'EUR' ? ', converted from euros at an approximate rate' : ''}.
              </Text>
            </View>
            <Button
              testID="prefs-save-display"
              variant="outline"
              loading={displayMutation.isPending}
              onPress={saveDisplay}
            >
              {displayMutation.isSuccess && !displayDirty ? 'Saved ✓' : 'Save units & currency'}
            </Button>
            {displayMutation.isError && (
              <Text className="text-xs text-red-600">
                {userFacingErrorMessage(displayMutation.error)}
              </Text>
            )}
          </Card>

          {/* Weekly budget — premium, saved via updateTargets (stored in EUR).
              B-10 (T-00.13): on free, the field is READ-ONLY — it used to
              stay editable while the Save button was hidden, so anything
              typed there was silently dropped on navigation. */}
          <Card className="gap-4">
            <Text variant="heading">Weekly budget</Text>
            <View className="gap-2">
              <Text variant="label">
                Weekly ingredient budget ({currencySymbol(savedCurrency)}, optional)
              </Text>
              <Input
                testID="prefs-budget"
                {...budgetNumeric.bind(0)}
                accessibilityLabel="Weekly ingredient budget"
                value={budget}
                onChangeText={isPremium === true ? setBudget : undefined}
                editable={isPremium === true}
                keyboardType="decimal-pad"
                placeholder="e.g. 60"
                className={cn(isPremium === false && 'bg-gray-100 text-gray-400')}
              />
              {budgetNumeric.bars}
            </View>
            {isPremium === false ? (
              <View className="flex-row items-center gap-1.5">
                <Ionicons name="lock-closed" size={14} color="#9ca3af" />
                <Text variant="muted" className="min-w-0 flex-1 text-xs">
                  Saving a weekly budget is part of Premium.
                </Text>
                <Pressable
                  testID="prefs-budget-premium"
                  accessibilityRole="button"
                  onPress={() => openPremium('budget')}
                  className="min-h-11 justify-center"
                >
                  <Text className="text-xs font-semibold text-primary">See what Premium adds</Text>
                </Pressable>
              </View>
            ) : (
              <Button
                testID="prefs-save-extras"
                variant="outline"
                loading={targetsMutation.isPending}
                onPress={saveBudget}
              >
                {targetsMutation.isSuccess && !budgetDirty ? 'Saved ✓' : 'Save budget'}
              </Button>
            )}
            {targetsMutation.isError && (
              <Text className="text-xs text-red-600">
                {userFacingErrorMessage(targetsMutation.error)}
              </Text>
            )}
          </Card>
        </KeyboardAwareScrollView>
      )}
      {healthConsentSheet}
    </Screen>
  );
}
