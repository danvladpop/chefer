import { useId, useState } from 'react';
import { Keyboard, View } from 'react-native';
import { Button, Input, NumericReturnBar, Text } from '@chefer/ui-mobile';
import { parseBodyWeight, userFacingErrorMessage } from '@chefer/utils';
import { useUnitSystem } from '../../../hooks/use-unit-system';
import { trpc } from '../../../lib/trpc';
import { HealthDeclinedNotice } from '../../privacy/health-notices';
import { useHealthConsent } from '../../privacy/use-health-consent';

// "Missing bodyweight" empty state (gym_plan.md §6.2): a one-tap path to log
// today's weight with the EXISTING tracker.logWeight procedure, reused by the
// strength-trend overlay and the monthly recap's bodyweight row.
export function LogWeightPrompt({ testID = 'log-weight-prompt' }: { testID?: string }) {
  // Typed in the user's unit (backlog P2-6) — sent as kg.
  const system = useUnitSystem();
  // UX-GYM-34: the decimal pad has no Return key on iOS — give it a Done bar.
  const barId = `log-weight-numeric-bar-${useId()}`;
  const [value, setValue] = useState('');
  const [error, setError] = useState<string | null>(null);
  const utils = trpc.useUtils();
  // T-26.2: a weigh-in is health information — asked once, on the first save.
  const { requestHealthConsent, healthConsentSheet } = useHealthConsent();
  const [declined, setDeclined] = useState(false);
  const logWeight = trpc.tracker.logWeight.useMutation({
    onSuccess: () => {
      setValue('');
      void utils.gym.bootstrap.invalidate();
      void utils.gym.stats.bodyweight.invalidate();
      void utils.gym.stats.monthlyRecap.invalidate();
      void utils.tracker.weightHistory.invalidate();
    },
    onError: (err) => setError(userFacingErrorMessage(err)),
    // Shown inline under the field — no default snackbar.
    meta: { silent: true },
  });

  const submit = () => {
    if (logWeight.isPending) return;
    const parsed = parseBodyWeight(value, system);
    if (!parsed.ok) {
      setError(parsed.error);
      return;
    }
    setError(null);
    setDeclined(false);
    // "Don't save it": nothing is stored; the typed value stays in the field.
    requestHealthConsent(() => logWeight.mutate({ weightKg: parsed.kg }), {
      onDeclined: () => setDeclined(true),
    });
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
          onChangeText={(text) => {
            setValue(text);
            setError(null);
          }}
          onSubmitEditing={submit}
          keyboardType="decimal-pad"
          inputAccessoryViewID={barId}
          placeholder={`Weight (${system === 'IMPERIAL' ? 'lb' : 'kg'})`}
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
      <NumericReturnBar
        nativeID={barId}
        testID={`${testID}-numeric-bar`}
        label="Done"
        onPress={() => Keyboard.dismiss()}
      />
      {error && (
        <Text testID={`${testID}-error`} className="text-xs text-red-600">
          {error}
        </Text>
      )}
      {declined && (
        <HealthDeclinedNotice
          testID={`${testID}-declined`}
          message="Your weight wasn’t saved, because Chefer doesn’t have permission to store health information."
        />
      )}
      {healthConsentSheet}
    </View>
  );
}
