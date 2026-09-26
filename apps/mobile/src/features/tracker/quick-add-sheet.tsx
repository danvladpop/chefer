import { useState } from 'react';
import { View } from 'react-native';
import { Button, Input, SegmentedControl, Sheet, Text } from '@chefer/ui-mobile';
import {
  parseQuickAdd,
  QUICK_ADD_LIMITS,
  QUICK_ADD_MEAL_TYPES,
  type QuickAddErrors,
  type QuickAddMealType,
} from '@chefer/utils';
import { trpc } from '../../lib/trpc';
import { recordRebalance } from './rebalance-store';

// Manual quick add (F4, FREE tier included) — mobile counterpart of web's
// QuickAddSheet. "I ate something off-plan" should never cost a
// subscription: name + kcal are enough; meal slot and macros are optional
// extras (web logs name + kcal as a snack). Validation mirrors the API's
// logCustomMeal bounds via the shared parseQuickAdd.

const MEAL_OPTIONS = QUICK_ADD_MEAL_TYPES.map((value) => ({
  value,
  label: value.charAt(0).toUpperCase() + value.slice(1),
  testID: `quick-add-meal-${value}`,
}));

const MACROS = [
  { key: 'protein', label: 'Protein' },
  { key: 'carbs', label: 'Carbs' },
  { key: 'fat', label: 'Fat' },
] as const;

export interface QuickAddSheetProps {
  visible: boolean;
  onClose: () => void;
  /** Device-local YYYY-MM-DD day the entry is logged to (never UTC). */
  date: string;
  onLogged: () => void;
}

export function QuickAddSheet({ visible, onClose, date, onLogged }: QuickAddSheetProps) {
  const [name, setName] = useState('');
  const [mealType, setMealType] = useState<QuickAddMealType>('snack');
  const [kcal, setKcal] = useState('');
  const [macros, setMacros] = useState({ protein: '', carbs: '', fat: '' });
  const [errors, setErrors] = useState<QuickAddErrors>({});

  const utils = trpc.useUtils();
  const logMutation = trpc.tracker.logCustomMeal.useMutation({
    onSuccess: (data) => {
      recordRebalance(data.rebalance);
      void utils.tracker.getDay.invalidate({ date });
      void utils.tracker.weeklySummary.invalidate();
      void utils.dashboard.summary.invalidate();
      setName('');
      setKcal('');
      setMacros({ protein: '', carbs: '', fat: '' });
      setErrors({});
      onLogged();
      onClose();
    },
  });

  const submit = () => {
    if (logMutation.isPending) {
      return;
    }
    const parsed = parseQuickAdd({ name, mealType, kcal, ...macros });
    if (!parsed.ok) {
      setErrors(parsed.errors);
      return;
    }
    setErrors({});
    logMutation.mutate({ date, estimatedBy: 'manual', ...parsed.entry });
  };

  const close = () => {
    setErrors({});
    logMutation.reset();
    onClose();
  };

  return (
    <Sheet
      visible={visible}
      onClose={close}
      title="Quick add"
      eyebrow="Off-plan"
      testID="quick-add-sheet"
      footer={
        <Button testID="quick-add-submit" loading={logMutation.isPending} onPress={submit}>
          {logMutation.isPending ? 'Logging…' : 'Log it'}
        </Button>
      }
    >
      <Text variant="muted" className="text-sm">
        Ate something off-plan? Log it honestly — name and calories are enough.
      </Text>

      <View className="gap-1">
        <Text className="text-xs font-medium text-gray-600">What did you eat?</Text>
        <Input
          testID="quick-add-name"
          accessibilityLabel="What did you eat?"
          value={name}
          maxLength={QUICK_ADD_LIMITS.nameMaxLength}
          placeholder="e.g. Slice of birthday cake"
          returnKeyType="next"
          onChangeText={setName}
        />
        {errors.name && (
          <Text testID="quick-add-name-error" className="text-xs text-red-600">
            {errors.name}
          </Text>
        )}
      </View>

      <View className="gap-1">
        <Text className="text-xs font-medium text-gray-600">Meal</Text>
        <SegmentedControl
          size="sm"
          options={MEAL_OPTIONS}
          value={mealType}
          onChange={setMealType}
          accessibilityLabel="Meal"
          testID="quick-add-meal"
        />
      </View>

      <View className="gap-1">
        <Text className="text-xs font-medium text-gray-600">Roughly how many calories?</Text>
        <View className="flex-row items-center gap-2">
          <Input
            testID="quick-add-kcal"
            accessibilityLabel="Calories"
            value={kcal}
            placeholder="350"
            keyboardType="number-pad"
            onChangeText={setKcal}
            className="min-w-0 flex-1"
          />
          <Text className="text-sm text-gray-400">kcal</Text>
        </View>
        {errors.kcal && (
          <Text testID="quick-add-kcal-error" className="text-xs text-red-600">
            {errors.kcal}
          </Text>
        )}
      </View>

      <View className="gap-1">
        <Text className="text-xs font-medium text-gray-600">Macros (optional, grams)</Text>
        <View className="flex-row gap-2">
          {MACROS.map(({ key, label }) => (
            <View key={key} className="min-w-0 flex-1 gap-1">
              <Input
                testID={`quick-add-${key}`}
                accessibilityLabel={`${label} grams`}
                value={macros[key]}
                placeholder={label}
                keyboardType="decimal-pad"
                onChangeText={(text) => setMacros((prev) => ({ ...prev, [key]: text }))}
              />
              {errors[key] && (
                <Text testID={`quick-add-${key}-error`} className="text-xs text-red-600">
                  {errors[key]}
                </Text>
              )}
            </View>
          ))}
        </View>
      </View>

      {logMutation.isError && (
        <Text testID="quick-add-api-error" className="text-sm text-red-600">
          {logMutation.error.message}
        </Text>
      )}
    </Sheet>
  );
}
