import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, TextInput, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { DISPLAY_CURRENCIES, type DisplayCurrency } from '@chefer/types';
import { Button, Card, ErrorState, Screen, Text } from '@chefer/ui-mobile';
import { cn, currencySymbol, fromEur, toDisplayCurrency, toEur } from '@chefer/utils';
import { AutoPlanToggle } from '../src/features/preferences/auto-plan-toggle';
import { SafetyStep } from '../src/features/preferences/components/safety-step';
import { GoalBodyCard, type GoalBodySavePayload } from '../src/features/preferences/goal-body-card';
import type {
  ActivityLevel,
  BiologicalSex,
  Goal,
  SafetyValue,
} from '../src/features/preferences/types';
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

  // ── Safety (free) ──────────────────────────────────────────────────────────
  const [safety, setSafety] = useState<SafetyValue>({
    dietaryRestrictions: [],
    allergies: [],
    dislikedIngredients: [],
  });
  const [safetyLoaded, setSafetyLoaded] = useState(false);

  // ── Units & currency (free) + budget (premium) ─────────────────────────────
  const savedCurrency = toDisplayCurrency(data?.chefProfile?.deliveryCurrency);
  const [units, setUnits] = useState<'METRIC' | 'IMPERIAL'>('METRIC');
  const [currency, setCurrency] = useState<DisplayCurrency>('EUR');
  const [budget, setBudget] = useState('');

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
    onSuccess: () => {
      void utils.preferences.get.invalidate();
      void utils.mealPlan.invalidate();
    },
  });
  const displayMutation = trpc.preferences.setDisplayPreferences.useMutation({
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
    onSuccess: () => void utils.preferences.get.invalidate(),
  });
  const goalBodyMutation = trpc.preferences.saveProfileBasics.useMutation({
    onSuccess: () => {
      void utils.preferences.get.invalidate();
      void utils.dashboard.invalidate();
    },
  });

  const saveSafety = () => safetyMutation.mutate(safety);

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
        <ScrollView contentContainerClassName="gap-4 px-4 pb-8" keyboardShouldPersistTaps="handled">
          <Text variant="muted" className="text-sm">
            Your allergies and dietary restrictions apply to every plan — free or premium.
          </Text>

          {isPremium === true && data?.chefProfile?.dailyCalorieTarget != null && (
            <View className="self-start rounded-lg border border-primary/30 bg-accent px-4 py-2">
              <Text className="text-sm font-medium text-primary">
                {data.chefProfile.dailyCalorieTarget.toLocaleString('en-US')} kcal / day — current
                target
              </Text>
            </View>
          )}

          {/* Safety — free for every account (P1-2) */}
          <Card testID="preferences-safety" className="gap-4">
            <Text variant="heading">Food safety</Text>
            <SafetyStep value={safety} onChange={setSafety} testIDPrefix="prefs" />
            <Button
              testID="prefs-save-safety"
              loading={safetyMutation.isPending}
              onPress={saveSafety}
            >
              {safetyMutation.isSuccess ? 'Saved ✓' : 'Save safety preferences'}
            </Button>
            {safetyMutation.isError && (
              <Text className="text-xs text-red-600">{safetyMutation.error.message}</Text>
            )}
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
            errorMessage={goalBodyMutation.error?.message}
          />

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

          {isPremium === true && (
            <AutoPlanToggle initialEnabled={data?.chefProfile?.autoPlanWeekly ?? true} />
          )}

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
              {displayMutation.isSuccess ? 'Saved ✓' : 'Save units & currency'}
            </Button>
            {displayMutation.isError && (
              <Text className="text-xs text-red-600">{displayMutation.error.message}</Text>
            )}
          </Card>

          {/* Weekly budget — premium, saved via updateTargets (stored in EUR) */}
          <Card className="gap-4">
            <Text variant="heading">Weekly budget</Text>
            <View className="gap-2">
              <Text variant="label">
                Weekly ingredient budget ({currencySymbol(savedCurrency)}, optional)
              </Text>
              <TextInput
                testID="prefs-budget"
                value={budget}
                onChangeText={setBudget}
                keyboardType="decimal-pad"
                placeholder="e.g. 60"
                placeholderTextColor="#9ca3af"
                className="h-11 rounded-md border border-input bg-background px-3 text-base text-foreground"
              />
            </View>
            {isPremium === false ? (
              <Text variant="muted" className="text-xs">
                Budget planning is premium — upgrade from your Profile.
              </Text>
            ) : (
              <Button
                testID="prefs-save-extras"
                variant="outline"
                loading={targetsMutation.isPending}
                onPress={saveBudget}
              >
                {targetsMutation.isSuccess ? 'Saved ✓' : 'Save budget'}
              </Button>
            )}
            {targetsMutation.isError && (
              <Text className="text-xs text-red-600">{targetsMutation.error.message}</Text>
            )}
          </Card>
        </ScrollView>
      )}
    </Screen>
  );
}
