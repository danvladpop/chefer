import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, TextInput, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { Button, Card, Screen, Text } from '@chefer/ui-mobile';
import { cn } from '@chefer/utils';
import { useIsPremium } from '../src/hooks/use-is-premium';
import { trpc } from '../src/lib/trpc';

// Preferences — port of apps/web /preferences (M2-7). Safety preferences
// (allergies, restrictions, dislikes) are FREE (P1-2) and save through
// updateSafety; units + weekly budget save through premium updateTargets.
// Deviations, deliberate: the full onboarding wizard (goal/body metrics/
// activity → computeTargets) is not ported yet — premium users edit those on
// web; tracked in the plan.

function ChipEditor({
  label,
  values,
  onChange,
  placeholder,
  max,
  testID,
}: {
  label: string;
  values: string[];
  onChange: (next: string[]) => void;
  placeholder: string;
  max: number;
  testID: string;
}) {
  const [draft, setDraft] = useState('');

  const add = () => {
    const v = draft.trim();
    if (!v || values.includes(v) || values.length >= max) {
      return;
    }
    onChange([...values, v]);
    setDraft('');
  };

  return (
    <View className="gap-2">
      <Text variant="label">{label}</Text>
      <View className="flex-row gap-2">
        <TextInput
          testID={`${testID}-input`}
          value={draft}
          onChangeText={setDraft}
          onSubmitEditing={add}
          placeholder={placeholder}
          placeholderTextColor="#9ca3af"
          returnKeyType="done"
          className="h-11 flex-1 rounded-md border border-input bg-background px-3 text-base text-foreground"
        />
        <Pressable
          testID={`${testID}-add`}
          accessibilityRole="button"
          accessibilityLabel={`Add to ${label}`}
          onPress={add}
          className="h-11 w-11 items-center justify-center rounded-md border border-border"
        >
          <Ionicons name="add" size={20} color="#944a00" />
        </Pressable>
      </View>
      {values.length > 0 && (
        <View className="flex-row flex-wrap gap-1.5">
          {values.map((v) => (
            <Pressable
              key={v}
              accessibilityRole="button"
              accessibilityLabel={`Remove ${v}`}
              onPress={() => onChange(values.filter((x) => x !== v))}
              className="min-h-9 flex-row items-center gap-1 rounded-full bg-accent px-3"
            >
              <Text className="text-xs font-medium text-primary">{v}</Text>
              <Ionicons name="close" size={12} color="#944a00" />
            </Pressable>
          ))}
        </View>
      )}
    </View>
  );
}

export default function PreferencesScreen() {
  const isPremium = useIsPremium();
  const { data, isLoading } = trpc.preferences.get.useQuery();
  const utils = trpc.useUtils();

  // ── Safety (free) ──────────────────────────────────────────────────────────
  const [restrictions, setRestrictions] = useState<string[]>([]);
  const [allergies, setAllergies] = useState<string[]>([]);
  const [disliked, setDisliked] = useState<string[]>([]);
  const [safetyLoaded, setSafetyLoaded] = useState(false);

  // ── Premium extras ─────────────────────────────────────────────────────────
  const [units, setUnits] = useState<'METRIC' | 'IMPERIAL'>('METRIC');
  const [budget, setBudget] = useState('');

  useEffect(() => {
    if (!data || safetyLoaded) {
      return;
    }
    setRestrictions(data.dietaryPreferences?.dietaryRestrictions ?? []);
    setAllergies(data.dietaryPreferences?.allergies ?? []);
    setDisliked(data.dietaryPreferences?.dislikedIngredients ?? []);
    setUnits(data.chefProfile?.preferredUnits ?? 'METRIC');
    setBudget(data.chefProfile?.weeklyBudgetEur?.toString() ?? '');
    setSafetyLoaded(true);
  }, [data, safetyLoaded]);

  const safetyMutation = trpc.preferences.updateSafety.useMutation({
    onSuccess: () => {
      void utils.preferences.get.invalidate();
      void utils.mealPlan.invalidate();
    },
  });
  const targetsMutation = trpc.preferences.updateTargets.useMutation({
    onSuccess: () => void utils.preferences.get.invalidate(),
  });

  const saveSafety = () =>
    safetyMutation.mutate({
      dietaryRestrictions: restrictions,
      allergies,
      dislikedIngredients: disliked,
    });

  const saveExtras = () => {
    const parsed = parseFloat(budget.replace(',', '.'));
    targetsMutation.mutate({
      preferredUnits: units,
      weeklyBudgetEur: Number.isFinite(parsed) && parsed > 0 ? parsed : null,
    });
  };

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
      ) : (
        <ScrollView contentContainerClassName="gap-4 px-4 pb-8">
          <Text variant="muted" className="text-sm">
            {isPremium
              ? 'Your allergies and restrictions apply to every plan. Goals and body metrics are edited on the web for now.'
              : 'Your allergies and dietary restrictions apply to every plan — free or premium.'}
          </Text>

          {isPremium === true && data?.chefProfile?.dailyCalorieTarget != null && (
            <View className="self-start rounded-lg border border-primary/30 bg-accent px-4 py-2">
              <Text className="text-sm font-medium text-primary">
                {data.chefProfile.dailyCalorieTarget.toLocaleString()} kcal / day — current target
              </Text>
            </View>
          )}

          {/* Safety — free for every account (P1-2) */}
          <Card testID="preferences-safety" className="gap-4">
            <Text variant="heading">Food safety</Text>
            <ChipEditor
              testID="prefs-restrictions"
              label="Dietary restrictions"
              values={restrictions}
              onChange={setRestrictions}
              placeholder="e.g. vegetarian"
              max={20}
            />
            <ChipEditor
              testID="prefs-allergies"
              label="Allergies"
              values={allergies}
              onChange={setAllergies}
              placeholder="e.g. peanuts"
              max={20}
            />
            <ChipEditor
              testID="prefs-disliked"
              label="Disliked ingredients"
              values={disliked}
              onChange={setDisliked}
              placeholder="e.g. cilantro"
              max={30}
            />
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

          {/* Units + budget — saved via premium updateTargets */}
          <Card className="gap-4">
            <Text variant="heading">Units & budget</Text>
            <View className="gap-2">
              <Text variant="label">Measurement units</Text>
              <View className="flex-row gap-2">
                {(['METRIC', 'IMPERIAL'] as const).map((u) => (
                  <Pressable
                    key={u}
                    accessibilityRole="button"
                    onPress={() => setUnits(u)}
                    className={cn(
                      'h-11 flex-1 items-center justify-center rounded-md border',
                      units === u ? 'border-primary bg-primary' : 'border-border bg-white',
                    )}
                  >
                    <Text
                      className={cn(
                        'text-sm font-medium',
                        units === u ? 'text-primary-foreground' : 'text-gray-600',
                      )}
                    >
                      {u === 'METRIC' ? 'Metric (g, ml)' : 'Imperial (oz, cups)'}
                    </Text>
                  </Pressable>
                ))}
              </View>
            </View>
            <View className="gap-2">
              <Text variant="label">Weekly ingredient budget (€, optional)</Text>
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
                Units and budget personalisation are premium — upgrade from your Profile.
              </Text>
            ) : (
              <Button
                testID="prefs-save-extras"
                variant="outline"
                loading={targetsMutation.isPending}
                onPress={saveExtras}
              >
                {targetsMutation.isSuccess ? 'Saved ✓' : 'Save units & budget'}
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
