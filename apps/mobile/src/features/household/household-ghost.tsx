import { View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { Button, Card, Text } from '@chefer/ui-mobile';
import { householdGhostSample, householdPortionSum, type HouseholdGhostKind } from '@chefer/utils';
import { trpc } from '../../lib/trpc';

// Free-tier ghost (§6.4, audit F-PM-12) — port of web's HouseholdGhost in
// features/preferences/components/household-section.tsx. The chip tapped
// decides the sample: the kid chip shows Sam at ½ portion with a peanut
// allergy, the partner chip a vegetarian adult. The demo merges the user's
// own diet; adding the member stays free, scaling is the upsell.

const SAMPLE_WEEK: { day: string; dish: string }[] = [
  { day: 'Mon', dish: 'Chickpea & Roast Pepper Tagine' },
  { day: 'Tue', dish: 'Miso Ginger Noodle Stir-fry' },
  { day: 'Wed', dish: 'Charred Broccoli Rice Bowls' },
];

export function HouseholdGhost({ kind }: { kind: HouseholdGhostKind }) {
  const { data: prefs } = trpc.preferences.get.useQuery(undefined, { staleTime: 60_000 });
  const owner = prefs?.dietaryPreferences;
  const sample = householdGhostSample(kind);
  const servings = householdPortionSum([sample]);
  // The demo runs on THEIR data: the user's own diet merged with the sample.
  const rules = [
    ...new Set(
      [
        ...(owner?.allergies ?? []).map((a) => `no ${a}`),
        ...sample.allergies.map((a) => `no ${a}`),
        ...(owner?.dietaryRestrictions ?? []),
        ...sample.dietaryRestrictions,
      ].map((c) => c.toLowerCase()),
    ),
  ];

  return (
    <Card testID="household-ghost-sample" className="gap-3 border-amber-200 bg-amber-50">
      <View className="flex-row items-center gap-1.5">
        <Ionicons name="sparkles" size={14} color="#b45309" />
        <Text className="text-xs font-semibold uppercase tracking-widest text-amber-700">
          Sample: your week with {sample.name}
        </Text>
      </View>
      <Text className="text-sm text-gray-700">
        Say you add <Text className="text-sm font-semibold text-gray-900">{sample.name}</Text> —{' '}
        {sample.summary}. Every dinner would be safe for you both:
      </Text>
      <View className="gap-1.5">
        {SAMPLE_WEEK.map(({ day, dish }) => (
          <View key={day} className="flex-row items-center gap-2">
            <Text className="w-10 text-xs font-semibold uppercase text-gray-500">{day}</Text>
            <Text numberOfLines={1} className="min-w-0 flex-1 text-sm font-medium text-gray-800">
              {dish}
            </Text>
            <View className="rounded-full bg-white px-2 py-0.5">
              <Text className="text-xs font-medium text-gray-600">{servings} servings</Text>
            </View>
          </View>
        ))}
      </View>
      {rules.length > 0 && (
        <Text testID="household-ghost-rules" className="text-xs text-gray-600">
          Combined table rules: {rules.join(' · ')}
        </Text>
      )}
      <Text className="text-xs text-gray-600">
        Adding {kind === 'kid' ? 'a kid' : 'your partner'} below is free, allergies included.
        Premium also sizes servings and the shopping list for {servings} portions.
      </Text>
      <Button
        testID="household-ghost-upgrade"
        variant="outline"
        size="sm"
        onPress={() => router.push({ pathname: '/profile', params: { source: 'household' } })}
      >
        See Premium
      </Button>
    </Card>
  );
}
