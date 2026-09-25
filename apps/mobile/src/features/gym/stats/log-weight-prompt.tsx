import { useState } from 'react';
import { View } from 'react-native';
import { Button, Input, Text } from '@chefer/ui-mobile';
import { trpc } from '../../../lib/trpc';

// "Missing bodyweight" empty state (gym_plan.md §6.2): a one-tap path to log
// today's weight with the EXISTING tracker.logWeight procedure, reused by the
// strength-trend overlay and the monthly recap's bodyweight row.
export function LogWeightPrompt({ testID = 'log-weight-prompt' }: { testID?: string }) {
  const [value, setValue] = useState('');
  const utils = trpc.useUtils();
  const logWeight = trpc.tracker.logWeight.useMutation({
    onSuccess: () => {
      setValue('');
      void utils.gym.bootstrap.invalidate();
      void utils.gym.stats.bodyweight.invalidate();
      void utils.gym.stats.monthlyRecap.invalidate();
    },
  });

  const submit = () => {
    const kg = parseFloat(value.replace(',', '.'));
    if (Number.isFinite(kg) && kg > 20 && kg < 500 && !logWeight.isPending) {
      logWeight.mutate({ weightKg: Math.round(kg * 10) / 10 });
    }
  };

  return (
    <View testID={testID} className="items-center gap-2 py-4">
      <Text variant="muted" className="text-center">
        No bodyweight logged yet.
      </Text>
      <View className="flex-row gap-2">
        <Input
          testID={`${testID}-input`}
          value={value}
          onChangeText={setValue}
          onSubmitEditing={submit}
          keyboardType="decimal-pad"
          placeholder="Weight (kg)"
          className="w-32"
        />
        <Button
          testID={`${testID}-save`}
          disabled={logWeight.isPending || !value.trim()}
          onPress={submit}
        >
          Log your weight
        </Button>
      </View>
    </View>
  );
}
