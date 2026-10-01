import { useId, useRef, useState } from 'react';
import { Keyboard, Pressable, TextInput, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { NumericReturnBar, Text, useScrollFieldIntoView } from '@chefer/ui-mobile';
import { cn, parseBodyWeight, userFacingErrorMessage } from '@chefer/utils';
import { useUnitSystem } from '../../hooks/use-unit-system';
import { trpc } from '../../lib/trpc';
import { HealthDeclinedNotice } from '../privacy/health-notices';
import { useHealthConsent } from '../privacy/use-health-consent';

// One weigh-in form for the dashboard weight card and the Progress screen —
// mobile counterpart of web features/coach/WeightLogForm. Validation mirrors
// the API via the shared parser (audit F-DASH-3-1). The field takes the
// user's unit (lb for IMPERIAL, backlog P2-6) and sends kg.

// R-21: iOS's decimal-pad has no Return/Done key — the shared accessory bar
// (the one the onboarding metrics step uses) gives it one. Shared by every
// WeightLogForm; the id is per instance because the dashboard card and the
// Progress screen can be mounted at the same time (duplicate native ids would
// make iOS pick one arbitrarily).

export function WeightLogForm({ placeholder, label }: { placeholder?: string; label?: string }) {
  const system = useUnitSystem();
  const barId = `weight-log-numeric-bar-${useId()}`;
  const imperial = system === 'IMPERIAL';
  const [value, setValue] = useState('');
  const [inputError, setInputError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const inputRef = useRef<TextInput>(null);
  // Keeps the field clear of the keyboard inside a KeyboardAwareScrollView
  // (Progress); a no-op elsewhere.
  const scrollFieldIntoView = useScrollFieldIntoView();
  const utils = trpc.useUtils();
  // T-26.2: a weigh-in is health information — asked once, on the first save.
  const { requestHealthConsent, healthConsentSheet } = useHealthConsent();
  const [declined, setDeclined] = useState(false);

  const logWeight = trpc.tracker.logWeight.useMutation({
    onSuccess: () => {
      setSaved(true);
      setValue('');
      setTimeout(() => setSaved(false), 3000);
      // Every range (30-day card, 90-day progress) and the gym bodyweight views.
      void utils.tracker.weightHistory.invalidate();
      void utils.gym.stats.bodyweight.invalidate();
      void utils.gym.bootstrap.invalidate();
    },
  });

  const submit = () => {
    if (logWeight.isPending) return;
    const parsed = parseBodyWeight(value, system);
    if (!parsed.ok) {
      setInputError(parsed.error);
      return;
    }
    setInputError(null);
    setDeclined(false);
    // "Don't save it": nothing is stored; the typed value stays in the field.
    requestHealthConsent(() => logWeight.mutate({ weightKg: parsed.kg }), {
      onDeclined: () => setDeclined(true),
    });
  };

  const error =
    inputError ?? (logWeight.error ? userFacingErrorMessage(logWeight.error) : undefined) ?? null;
  const disabled = logWeight.isPending || !value.trim();

  return (
    <View>
      <View className="flex-row gap-2">
        <TextInput
          testID="weight-input"
          ref={inputRef}
          onFocus={() => scrollFieldIntoView(inputRef.current)}
          value={value}
          onChangeText={(text) => {
            setValue(text);
            setInputError(null);
          }}
          onSubmitEditing={submit}
          inputAccessoryViewID={barId}
          keyboardType="decimal-pad"
          placeholder={placeholder ?? `Log today’s weight (${imperial ? 'lb' : 'kg'})`}
          placeholderTextColor="#9ca3af"
          accessibilityLabel={label ?? `Today's weight in ${imperial ? 'pounds' : 'kilograms'}`}
          className="h-11 min-w-0 flex-1 rounded-md border border-input bg-background px-3 text-base text-foreground"
        />
        <Pressable
          testID="weight-save"
          accessibilityRole="button"
          accessibilityLabel="Log weight"
          disabled={disabled}
          onPress={submit}
          className={cn(
            'h-11 w-11 items-center justify-center rounded-md bg-primary',
            disabled && 'opacity-40',
          )}
        >
          <Ionicons name={saved ? 'checkmark' : 'add'} size={20} color="white" />
        </Pressable>
      </View>
      <NumericReturnBar
        nativeID={barId}
        testID="weight-numeric-bar"
        label="Done"
        onPress={() => Keyboard.dismiss()}
      />
      {error && (
        <Text testID="weight-error" className="mt-1 text-xs text-red-600">
          {error}
        </Text>
      )}
      {declined && (
        <View className="mt-2">
          <HealthDeclinedNotice
            testID="weight-declined"
            message="Your weight wasn’t saved, because Chefer doesn’t have permission to store health information."
          />
        </View>
      )}
      {healthConsentSheet}
    </View>
  );
}
