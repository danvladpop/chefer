import { useId, useRef, useState } from 'react';
import { Keyboard, Pressable, TextInput, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { NumericReturnBar, showSnackbar, Text, useScrollFieldIntoView } from '@chefer/ui-mobile';
import { cn, formatBodyWeight, parseBodyWeight, userFacingErrorMessage } from '@chefer/utils';
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

// UX-FOOD-08: the same weight, typed again on the same calendar day, is a
// duplicate weigh-in (a second tap on "+", or Return after the field was
// refilled) — it is ignored rather than stored twice.
const SAME_WEIGHT_KG = 0.05;

function isSameDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

export function WeightLogForm({
  placeholder,
  label,
  lastEntry,
}: {
  placeholder?: string;
  label?: string;
  /** The newest weigh-in on record, for the same-value-same-day dedupe. */
  lastEntry?: { weightKg: number; recordedAt: Date } | null;
}) {
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
    meta: { silent: true },
    onSuccess: (entry, variables) => {
      setSaved(true);
      // UX-FOOD-08: a logged weight must not stay in the field (it led to
      // duplicate weigh-ins) — clear it and offer an Undo.
      setValue('');
      setTimeout(() => setSaved(false), 3000);
      // Every range (30-day card, 90-day progress) and the gym bodyweight views.
      const refresh = () => {
        void utils.tracker.weightHistory.invalidate();
        void utils.gym.stats.bodyweight.invalidate();
        void utils.gym.bootstrap.invalidate();
      };
      refresh();
      showSnackbar({
        message: `Logged ${formatBodyWeight(variables.weightKg, system)}`,
        actionLabel: 'Undo',
        tone: 'success',
        onAction: () => {
          // Imperative client: the card may be gone by the time Undo is tapped.
          utils.client.tracker.deleteWeight
            .mutate({ id: entry.id })
            .then(refresh)
            .catch((err: unknown) => showSnackbar({ message: userFacingErrorMessage(err) }));
        },
      });
    },
  });

  /** Returns true when the typed value was accepted (valid), so the caller may close the keyboard. */
  const submit = (): boolean => {
    if (logWeight.isPending) return false;
    const parsed = parseBodyWeight(value, system);
    if (!parsed.ok) {
      setInputError(parsed.error);
      return false;
    }
    setInputError(null);
    setDeclined(false);
    if (
      lastEntry &&
      isSameDay(new Date(lastEntry.recordedAt), new Date()) &&
      Math.abs(lastEntry.weightKg - parsed.kg) < SAME_WEIGHT_KG
    ) {
      setValue('');
      showSnackbar({ message: `Already logged ${formatBodyWeight(parsed.kg, system)} today` });
      return true;
    }
    // "Don't save it": nothing is stored; the typed value stays in the field.
    requestHealthConsent(() => logWeight.mutate({ weightKg: parsed.kg }), {
      onDeclined: () => setDeclined(true),
    });
    return true;
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
          returnKeyType="done"
          onSubmitEditing={() => submit()}
          inputAccessoryViewID={barId}
          keyboardType="decimal-pad"
          placeholder={placeholder ?? `Log today’s weight (${imperial ? 'lb' : 'kg'})`}
          placeholderTextColor="#9ca3af"
          accessibilityLabel={label ?? `Today's weight in ${imperial ? 'pounds' : 'kilograms'}`}
          className="min-h-11 py-2 min-w-0 flex-1 rounded-md border border-input bg-background px-3 text-base text-foreground"
        />
        <Pressable
          testID="weight-save"
          accessibilityRole="button"
          accessibilityLabel="Log weight"
          disabled={disabled}
          onPress={() => {
            if (submit()) Keyboard.dismiss();
          }}
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
        label="Log"
        onPress={() => {
          // UX-FOOD-08: the accessory is "Log", not "Done" — it saves, and
          // closes the keyboard so the result is in view.
          if (submit()) Keyboard.dismiss();
        }}
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
