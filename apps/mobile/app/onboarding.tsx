import { useState } from 'react';
import { Pressable, ScrollView, TextInput, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { Button, Card, Screen, Text } from '@chefer/ui-mobile';
import { cn } from '@chefer/utils';
import { useIsPremium } from '../src/hooks/use-is-premium';
import { trpc } from '../src/lib/trpc';

// Onboarding wizard — port of apps/web features/onboarding (M2-7 completion).
// Same four steps, options, and Mifflin-St Jeor preview as web; submits the
// identical preferences.setup payload (premium — server-gated).

type Goal = 'LOSE_WEIGHT' | 'MAINTAIN' | 'GAIN_MUSCLE' | 'EAT_HEALTHIER';
type ActivityLevel =
  | 'SEDENTARY'
  | 'LIGHTLY_ACTIVE'
  | 'MODERATELY_ACTIVE'
  | 'VERY_ACTIVE'
  | 'ATHLETE';
type BiologicalSex = 'MALE' | 'FEMALE';

const GOALS: { value: Goal; label: string; icon: string; description: string; effect: string }[] = [
  {
    value: 'LOSE_WEIGHT',
    label: 'Lose Weight',
    icon: '⚖️',
    description: 'Reduce body fat and reach a healthier weight',
    effect: '−500 kcal/day deficit',
  },
  {
    value: 'MAINTAIN',
    label: 'Maintain Weight',
    icon: '🎯',
    description: 'Keep your current weight while eating well',
    effect: 'Maintenance calories',
  },
  {
    value: 'GAIN_MUSCLE',
    label: 'Gain Muscle',
    icon: '💪',
    description: 'Build strength and increase lean muscle mass',
    effect: '+300 kcal/day surplus',
  },
  {
    value: 'EAT_HEALTHIER',
    label: 'Eat Healthier',
    icon: '🥗',
    description: 'Better habits without changing your weight',
    effect: 'Maintenance calories',
  },
];

const ACTIVITY_OPTIONS: { value: ActivityLevel; label: string; description: string }[] = [
  { value: 'SEDENTARY', label: 'Sedentary', description: 'Little or no exercise, desk job' },
  { value: 'LIGHTLY_ACTIVE', label: 'Lightly Active', description: 'Light exercise 1–3 days/week' },
  {
    value: 'MODERATELY_ACTIVE',
    label: 'Moderately Active',
    description: 'Moderate exercise 3–5 days/week',
  },
  { value: 'VERY_ACTIVE', label: 'Very Active', description: 'Hard exercise 6–7 days/week' },
  { value: 'ATHLETE', label: 'Athlete', description: 'Twice daily training or physical job' },
];

const ACTIVITY_MULTIPLIERS: Record<ActivityLevel, number> = {
  SEDENTARY: 1.2,
  LIGHTLY_ACTIVE: 1.375,
  MODERATELY_ACTIVE: 1.55,
  VERY_ACTIVE: 1.725,
  ATHLETE: 1.9,
};

// Mirrors the API's GOAL_ADJUSTMENTS so the preview shows the SAME number the
// planner will use (web review P-3).
const GOAL_ADJUSTMENTS: Record<Goal, number> = {
  LOSE_WEIGHT: -500,
  MAINTAIN: 0,
  GAIN_MUSCLE: 300,
  EAT_HEALTHIER: 0,
};

const DIET_OPTIONS = [
  { value: 'Omnivore', icon: '🍖' },
  { value: 'Vegetarian', icon: '🥦' },
  { value: 'Vegan', icon: '🌱' },
  { value: 'Pescatarian', icon: '🐟' },
  { value: 'Keto', icon: '🥑' },
  { value: 'Paleo', icon: '🍗' },
  { value: 'Gluten-Free', icon: '🌾' },
  { value: 'Dairy-Free', icon: '🥛' },
];

const CUISINE_OPTIONS = [
  { value: 'Italian', icon: '🍝' },
  { value: 'Mexican', icon: '🌮' },
  { value: 'Asian', icon: '🍜' },
  { value: 'Mediterranean', icon: '🫒' },
  { value: 'American', icon: '🍔' },
  { value: 'Indian', icon: '🍛' },
  { value: 'Middle Eastern', icon: '🧆' },
  { value: 'Japanese', icon: '🍱' },
  { value: 'Thai', icon: '🌶️' },
  { value: 'Greek', icon: '🥙' },
  { value: 'French', icon: '🥐' },
  { value: 'Korean', icon: '🥢' },
];

/** Mifflin-St Jeor, mirrored from web's step-metrics. */
function estimateCalories(
  weightKg: number,
  heightCm: number,
  age: number,
  activityLevel: ActivityLevel | null,
  biologicalSex: BiologicalSex | null,
): number {
  const sexConstant = biologicalSex === 'MALE' ? 5 : biologicalSex === 'FEMALE' ? -161 : -78;
  const bmr = 10 * weightKg + 6.25 * heightCm - 5 * age + sexConstant;
  const multiplier = activityLevel ? ACTIVITY_MULTIPLIERS[activityLevel] : 1.55;
  return Math.round(bmr * multiplier);
}

function OptionRow({
  selected,
  onPress,
  icon,
  label,
  description,
  testID,
}: {
  selected: boolean;
  onPress: () => void;
  icon?: string;
  label: string;
  description?: string;
  testID?: string;
}) {
  return (
    <Pressable
      testID={testID}
      accessibilityRole="button"
      accessibilityState={{ selected }}
      onPress={onPress}
      className={cn(
        'flex-row items-center gap-3 rounded-xl border p-3',
        selected ? 'border-primary bg-accent' : 'border-border bg-card',
      )}
    >
      {icon && <Text className="text-xl">{icon}</Text>}
      <View className="min-w-0 flex-1">
        <Text className={cn('text-sm font-semibold', selected ? 'text-primary' : 'text-gray-800')}>
          {label}
        </Text>
        {description && (
          <Text variant="muted" className="text-xs">
            {description}
          </Text>
        )}
      </View>
      {selected && <Ionicons name="checkmark-circle" size={20} color="#944a00" />}
    </Pressable>
  );
}

function NumberField({
  label,
  value,
  onChange,
  placeholder,
  testID,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
  testID: string;
}) {
  return (
    <View className="flex-1 gap-1">
      <Text variant="label">{label}</Text>
      <TextInput
        testID={testID}
        value={value}
        onChangeText={onChange}
        keyboardType="decimal-pad"
        placeholder={placeholder}
        placeholderTextColor="#9ca3af"
        className="h-11 rounded-md border border-input bg-background px-3 text-base text-foreground"
      />
    </View>
  );
}

export default function OnboardingScreen() {
  const isPremium = useIsPremium();
  const utils = trpc.useUtils();
  const [step, setStep] = useState(0);

  const [goal, setGoal] = useState<Goal | null>(null);
  const [sex, setSex] = useState<BiologicalSex | null>(null);
  const [age, setAge] = useState('');
  const [heightCm, setHeightCm] = useState('');
  const [weightKg, setWeightKg] = useState('');
  const [activity, setActivity] = useState<ActivityLevel | null>(null);
  const [restrictions, setRestrictions] = useState<string[]>([]);
  const [dislikedText, setDislikedText] = useState('');
  const [allergyText, setAllergyText] = useState('');
  const [cuisines, setCuisines] = useState<string[]>([]);
  const [mealsPerDay, setMealsPerDay] = useState(3);
  const [servingSize, setServingSize] = useState(2);

  const setupMutation = trpc.preferences.setup.useMutation({
    onSuccess: () => {
      void utils.preferences.invalidate();
      void utils.dashboard.invalidate();
      router.replace('/');
    },
  });

  const ageN = parseInt(age, 10);
  const heightN = parseFloat(heightCm.replace(',', '.'));
  const weightN = parseFloat(weightKg.replace(',', '.'));
  const metricsValid =
    sex !== null &&
    activity !== null &&
    Number.isFinite(ageN) &&
    ageN >= 10 &&
    ageN <= 110 &&
    Number.isFinite(heightN) &&
    heightN > 0 &&
    heightN <= 300 &&
    Number.isFinite(weightN) &&
    weightN > 0 &&
    weightN <= 500;

  const preview =
    metricsValid && goal
      ? estimateCalories(weightN, heightN, ageN, activity, sex) + GOAL_ADJUSTMENTS[goal]
      : null;

  const canNext = [goal !== null, metricsValid, true, cuisines.length > 0][step] ?? false;

  const submit = () => {
    if (!goal || !sex || !activity || !metricsValid) {
      return;
    }
    setupMutation.mutate({
      goal,
      biologicalSex: sex,
      age: ageN,
      heightCm: heightN,
      weightKg: weightN,
      activityLevel: activity,
      dietaryRestrictions: restrictions,
      allergies: allergyText
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean),
      dislikedIngredients: dislikedText
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean),
      cuisinePreferences: cuisines,
      mealsPerDay,
      servingSize,
    });
  };

  if (isPremium === false) {
    return (
      <Screen
        edges={['top', 'bottom', 'left', 'right']}
        className="items-center justify-center gap-4 px-6"
      >
        <Text variant="title">Personal profile is premium</Text>
        <Text variant="muted" className="text-center text-sm">
          The AI chef builds plans around your goals, body metrics and tastes. Upgrade from your
          Profile — free during the beta.
        </Text>
        <Button variant="outline" onPress={() => router.back()}>
          Go back
        </Button>
      </Screen>
    );
  }

  const stepTitles = ['Your goal', 'About you', 'Diet & dislikes', 'Tastes & portions'];

  return (
    <Screen edges={['top', 'bottom', 'left', 'right']} className="px-0">
      {/* Header + progress */}
      <View className="flex-row items-center gap-3 px-4 py-3">
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Back"
          onPress={() => (step === 0 ? router.back() : setStep((s) => s - 1))}
          className="h-11 w-11 items-center justify-center"
        >
          <Ionicons name="arrow-back" size={20} color="#1f2937" />
        </Pressable>
        <View className="flex-1">
          <Text variant="muted" className="text-xs">
            Step {step + 1} of 4
          </Text>
          <Text testID="onboarding-title" variant="heading">
            {stepTitles[step]}
          </Text>
        </View>
      </View>
      <View className="mx-4 mb-2 h-1.5 overflow-hidden rounded-full bg-gray-100">
        <View
          className="h-full rounded-full bg-primary"
          style={{ width: `${((step + 1) / 4) * 100}%` }}
        />
      </View>

      <ScrollView contentContainerClassName="gap-3 px-4 py-3 pb-8">
        {step === 0 &&
          GOALS.map((g) => (
            <OptionRow
              key={g.value}
              testID={`goal-${g.value}`}
              selected={goal === g.value}
              onPress={() => setGoal(g.value)}
              icon={g.icon}
              label={g.label}
              description={`${g.description} · ${g.effect}`}
            />
          ))}

        {step === 1 && (
          <>
            <View className="flex-row gap-2">
              {(['MALE', 'FEMALE'] as const).map((s) => (
                <Pressable
                  key={s}
                  testID={`sex-${s}`}
                  accessibilityRole="button"
                  onPress={() => setSex(s)}
                  className={cn(
                    'h-11 flex-1 items-center justify-center rounded-md border',
                    sex === s ? 'border-primary bg-primary' : 'border-border bg-white',
                  )}
                >
                  <Text
                    className={cn(
                      'text-sm font-medium',
                      sex === s ? 'text-primary-foreground' : 'text-gray-600',
                    )}
                  >
                    {s === 'MALE' ? 'Male' : 'Female'}
                  </Text>
                </Pressable>
              ))}
            </View>
            <View className="flex-row gap-2">
              <NumberField
                testID="onb-age"
                label="Age"
                value={age}
                onChange={setAge}
                placeholder="34"
              />
              <NumberField
                testID="onb-height"
                label="Height (cm)"
                value={heightCm}
                onChange={setHeightCm}
                placeholder="175"
              />
              <NumberField
                testID="onb-weight"
                label="Weight (kg)"
                value={weightKg}
                onChange={setWeightKg}
                placeholder="72"
              />
            </View>
            <View className="gap-2">
              {ACTIVITY_OPTIONS.map((a) => (
                <OptionRow
                  key={a.value}
                  testID={`activity-${a.value}`}
                  selected={activity === a.value}
                  onPress={() => setActivity(a.value)}
                  label={a.label}
                  description={a.description}
                />
              ))}
            </View>
            {preview !== null && (
              <Card testID="calorie-preview" className="border-primary/30 bg-accent">
                <Text className="text-sm font-semibold text-primary">
                  ≈ {preview.toLocaleString()} kcal / day
                </Text>
                <Text className="text-xs text-primary/80">
                  Your estimated daily target — the planner uses this exact number.
                </Text>
              </Card>
            )}
          </>
        )}

        {step === 2 && (
          <>
            <Text variant="label">Diet style (pick any that apply)</Text>
            <View className="flex-row flex-wrap gap-2">
              {DIET_OPTIONS.map((d) => {
                const selected = restrictions.includes(d.value);
                return (
                  <Pressable
                    key={d.value}
                    accessibilityRole="button"
                    onPress={() =>
                      setRestrictions((prev) =>
                        selected ? prev.filter((r) => r !== d.value) : [...prev, d.value],
                      )
                    }
                    className={cn(
                      'min-h-11 flex-row items-center gap-1.5 rounded-full border px-3',
                      selected ? 'border-primary bg-accent' : 'border-border bg-white',
                    )}
                  >
                    <Text>{d.icon}</Text>
                    <Text
                      className={cn(
                        'text-sm',
                        selected ? 'font-semibold text-primary' : 'text-gray-700',
                      )}
                    >
                      {d.value}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
            <View className="gap-1">
              <Text variant="label">Allergies (comma-separated)</Text>
              <TextInput
                testID="onb-allergies"
                value={allergyText}
                onChangeText={setAllergyText}
                placeholder="e.g. peanuts, shellfish"
                placeholderTextColor="#9ca3af"
                className="h-11 rounded-md border border-input bg-background px-3 text-base text-foreground"
              />
            </View>
            <View className="gap-1">
              <Text variant="label">Disliked ingredients (comma-separated)</Text>
              <TextInput
                testID="onb-dislikes"
                value={dislikedText}
                onChangeText={setDislikedText}
                placeholder="e.g. cilantro, olives"
                placeholderTextColor="#9ca3af"
                className="h-11 rounded-md border border-input bg-background px-3 text-base text-foreground"
              />
            </View>
          </>
        )}

        {step === 3 && (
          <>
            <Text variant="label">Cuisines you love (pick at least one)</Text>
            <View className="flex-row flex-wrap gap-2">
              {CUISINE_OPTIONS.map((c) => {
                const selected = cuisines.includes(c.value);
                return (
                  <Pressable
                    key={c.value}
                    testID={`cuisine-${c.value}`}
                    accessibilityRole="button"
                    onPress={() =>
                      setCuisines((prev) =>
                        selected ? prev.filter((x) => x !== c.value) : [...prev, c.value],
                      )
                    }
                    className={cn(
                      'min-h-11 flex-row items-center gap-1.5 rounded-full border px-3',
                      selected ? 'border-primary bg-accent' : 'border-border bg-white',
                    )}
                  >
                    <Text>{c.icon}</Text>
                    <Text
                      className={cn(
                        'text-sm',
                        selected ? 'font-semibold text-primary' : 'text-gray-700',
                      )}
                    >
                      {c.value}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
            <View className="gap-1">
              <Text variant="label">Meals per day</Text>
              <View className="flex-row gap-2">
                {[2, 3, 4, 5].map((n) => (
                  <Pressable
                    key={n}
                    accessibilityRole="button"
                    onPress={() => setMealsPerDay(n)}
                    className={cn(
                      'h-11 flex-1 items-center justify-center rounded-md border',
                      mealsPerDay === n ? 'border-primary bg-primary' : 'border-border bg-white',
                    )}
                  >
                    <Text
                      className={cn(
                        'text-sm font-semibold',
                        mealsPerDay === n ? 'text-primary-foreground' : 'text-gray-600',
                      )}
                    >
                      {n}
                    </Text>
                  </Pressable>
                ))}
              </View>
            </View>
            <View className="gap-1">
              <Text variant="label">Servings per meal (household size)</Text>
              <View className="flex-row gap-2">
                {[1, 2, 3, 4, 5, 6].map((n) => (
                  <Pressable
                    key={n}
                    accessibilityRole="button"
                    onPress={() => setServingSize(n)}
                    className={cn(
                      'h-11 flex-1 items-center justify-center rounded-md border',
                      servingSize === n ? 'border-primary bg-primary' : 'border-border bg-white',
                    )}
                  >
                    <Text
                      className={cn(
                        'text-sm font-semibold',
                        servingSize === n ? 'text-primary-foreground' : 'text-gray-600',
                      )}
                    >
                      {n}
                    </Text>
                  </Pressable>
                ))}
              </View>
            </View>
          </>
        )}

        {setupMutation.isError && (
          <Card className="border-red-200 bg-red-50">
            <Text className="text-sm text-red-600">{setupMutation.error.message}</Text>
          </Card>
        )}

        <Button
          testID="onboarding-next"
          loading={setupMutation.isPending}
          disabled={!canNext}
          onPress={() => (step < 3 ? setStep((s) => s + 1) : submit())}
        >
          {step < 3 ? 'Continue' : 'Finish — build my profile'}
        </Button>
      </ScrollView>
    </Screen>
  );
}
