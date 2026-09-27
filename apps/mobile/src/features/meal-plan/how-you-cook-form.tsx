import { Switch, View } from 'react-native';
import { Link } from 'expo-router';
import type { PlanShape } from '@chefer/types';
import { ChipGroup, SegmentedControl, Text } from '@chefer/ui-mobile';
import { planShapeSummary } from '@chefer/utils';

// HOW YOU COOK (UX-07 §1) — one form used in three places: onboarding
// (UX-03), Settings › How you cook, and the Plan's own "Plan settings"
// sheet (plan-settings-sheet.tsx). This component holds only the shape's
// own four fields; leftovers and training-day options live in each host's
// "Options" section (they're on the same DietaryPreferences row but are not
// part of the shared `PlanShape` type).

const SLOT_OPTIONS = [
  { value: 'breakfast' as const, label: 'Breakfast', testID: 'how-you-cook-slot-breakfast' },
  { value: 'lunch' as const, label: 'Lunch', testID: 'how-you-cook-slot-lunch' },
  { value: 'dinner' as const, label: 'Dinner', testID: 'how-you-cook-slot-dinner' },
  { value: 'snack' as const, label: 'Snacks', testID: 'how-you-cook-slot-snack' },
];

const DAY_OPTIONS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((label, value) => ({
  value,
  label,
  testID: `how-you-cook-day-${value}`,
}));

const TIME_CAP_OPTIONS = [
  { value: '15' as const, label: '≤ 15 min', testID: 'how-you-cook-time-15' },
  { value: '30' as const, label: '≤ 30 min', testID: 'how-you-cook-time-30' },
  { value: '45' as const, label: '≤ 45 min', testID: 'how-you-cook-time-45' },
  { value: 'none' as const, label: 'No limit', testID: 'how-you-cook-time-none' },
];

const COOKING_FOR_OPTIONS = [
  { value: '1' as const, label: 'Just me', testID: 'how-you-cook-for-1' },
  { value: '2' as const, label: 'Two of us', testID: 'how-you-cook-for-2' },
];

export interface HowYouCookFormProps {
  shape: PlanShape;
  onChange: (shape: PlanShape) => void;
  /** ⚖ D-7 recommended option: `householdPlans` gates 3+, not "Two of us". */
  testID?: string;
}

export function HowYouCookForm({ shape, onChange, testID = 'how-you-cook' }: HowYouCookFormProps) {
  const timeCapValue = shape.timeCapMins == null ? 'none' : String(shape.timeCapMins);

  return (
    <View testID={testID} className="gap-5">
      <View className="gap-2">
        <Text className="text-xs font-semibold uppercase tracking-widest text-gray-500">
          Which meals should we plan?
        </Text>
        <ChipGroup
          testID={`${testID}-slots`}
          options={SLOT_OPTIONS}
          value={shape.slots}
          multiple
          onChange={(slots) => {
            if (slots.length === 0) return; // validation: pick at least one meal
            onChange({ ...shape, slots });
          }}
        />
      </View>

      <View className="gap-2">
        <Text className="text-xs font-semibold uppercase tracking-widest text-gray-500">
          On which days?
        </Text>
        <ChipGroup
          testID={`${testID}-days`}
          options={DAY_OPTIONS}
          value={shape.days}
          multiple
          onChange={(days) => {
            if (days.length === 0) return; // validation: pick at least one day
            onChange({ ...shape, days: [...days].sort((a, b) => a - b) });
          }}
        />
      </View>

      <View className="gap-2">
        <Text className="text-xs font-semibold uppercase tracking-widest text-gray-500">
          How long can you cook on those days?
        </Text>
        <SegmentedControl
          testID={`${testID}-time-cap`}
          accessibilityLabel="How long can you cook on those days?"
          options={TIME_CAP_OPTIONS}
          value={timeCapValue}
          onChange={(value) =>
            onChange({
              ...shape,
              timeCapMins: value === 'none' ? null : (Number(value) as 15 | 30 | 45),
            })
          }
        />
        <View className="min-h-11 flex-row items-center justify-between">
          <Text className="flex-1 text-sm text-gray-700">Weekends can take longer</Text>
          <Switch
            testID={`${testID}-weekend-no-limit`}
            value={shape.weekendNoLimit}
            onValueChange={(weekendNoLimit) => onChange({ ...shape, weekendNoLimit })}
          />
        </View>
      </View>

      <View className="gap-2">
        <Text className="text-xs font-semibold uppercase tracking-widest text-gray-500">
          Cooking for
        </Text>
        <SegmentedControl
          testID={`${testID}-cooking-for`}
          accessibilityLabel="Cooking for"
          options={COOKING_FOR_OPTIONS}
          value={shape.cookingFor == null ? '1' : String(shape.cookingFor)}
          onChange={(value) => onChange({ ...shape, cookingFor: Number(value) as 1 | 2 })}
        />
        <Link href="/household" testID={`${testID}-household-link`}>
          <Text className="text-xs font-semibold text-primary">
            Household of 3+? Set up your table ›
          </Text>
        </Link>
      </View>

      <View className="rounded-xl bg-gray-50 px-3 py-2.5" accessibilityLiveRegion="polite">
        <Text testID={`${testID}-summary`} className="text-sm text-gray-700">
          {planShapeSummary(shape)}
        </Text>
      </View>
    </View>
  );
}
