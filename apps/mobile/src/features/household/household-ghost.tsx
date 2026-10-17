import { View } from 'react-native';
import { Text, useThemeColors } from '@chefer/ui-mobile';
import { householdGhostSample, householdPortionSum, type HouseholdGhostKind } from '@chefer/utils';
import { Icon } from '../../components/icon';
import { trpc } from '../../lib/trpc';
import { openPremium } from '../premium/open-premium';
import { BoardCard } from '../shell/today/parts';
import { TrainButton } from '../shell/train/train-button';

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
  const colors = useThemeColors();
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
    <BoardCard testID="household-ghost-sample" className="bg-brand-tint">
      <View className="flex-row items-center gap-1.5">
        <Icon name="chef" size={16} color={colors.brand} />
        <Text className="min-w-0 flex-1 text-subhead font-semibold text-brand">
          Sample: your week with {sample.name}
        </Text>
      </View>
      <Text className="text-body text-label">
        Say you add <Text className="text-body font-semibold text-label">{sample.name}</Text> —{' '}
        {sample.summary}. Every dinner would be safe for you both:
      </Text>
      <View className="gap-1.5">
        {SAMPLE_WEEK.map(({ day, dish }) => (
          <View key={day} className="flex-row items-center gap-2">
            <Text className="w-10 text-caption font-semibold text-label-secondary">{day}</Text>
            <Text numberOfLines={1} className="min-w-0 flex-1 text-callout text-label">
              {dish}
            </Text>
            <View className="rounded-full bg-surface px-2 py-0.5">
              <Text className="text-caption font-semibold text-label-secondary">
                {servings} servings
              </Text>
            </View>
          </View>
        ))}
      </View>
      {rules.length > 0 && (
        <Text testID="household-ghost-rules" className="text-subhead text-label-secondary">
          Combined table rules: {rules.join(' · ')}
        </Text>
      )}
      <Text className="text-subhead text-label-secondary">
        Adding {kind === 'kid' ? 'a kid' : 'your partner'} below is free, allergies included.
        Premium also sizes servings and the shopping list for {servings} portions.
      </Text>
      <TrainButton
        testID="household-ghost-upgrade"
        label="See what Premium adds"
        variant="onBrand"
        onPress={() => openPremium('household')}
      />
    </BoardCard>
  );
}
