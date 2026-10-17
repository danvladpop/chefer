import { useId, useRef } from 'react';
import { Keyboard, Pressable, TextInput, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { NumericReturnBar, Text, useScrollFieldIntoView } from '@chefer/ui-mobile';
import { cn } from '@chefer/utils';
import { HealthDeclinedNotice } from '../privacy/health-notices';
import { useWeightLog } from './use-weight-log';

// One weigh-in form for the dashboard weight card and the Progress screen —
// mobile counterpart of web features/coach/WeightLogForm. Validation mirrors
// the API via the shared parser (audit F-DASH-3-1). The field takes the
// user's unit (lb for IMPERIAL, backlog P2-6) and sends kg.

// R-21: iOS's decimal-pad has no Return/Done key — the shared accessory bar
// (the one the onboarding metrics step uses) gives it one. Shared by every
// WeightLogForm; the id is per instance because the dashboard card and the
// Progress screen can be mounted at the same time (duplicate native ids would
// make iOS pick one arbitrarily).

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
  const barId = `weight-log-numeric-bar-${useId()}`;
  const inputRef = useRef<TextInput>(null);
  // Keeps the field clear of the keyboard inside a KeyboardAwareScrollView
  // (Progress); a no-op elsewhere.
  const scrollFieldIntoView = useScrollFieldIntoView();
  // The write itself — parser, dedupe, consent gate, Undo — is shared with
  // the redesigned Today card (use-weight-log.ts).
  const {
    system,
    value,
    onChangeText,
    submit,
    error,
    declined,
    saved,
    disabled,
    healthConsentSheet,
  } = useWeightLog(lastEntry);
  const imperial = system === 'IMPERIAL';

  return (
    <View>
      <View className="flex-row gap-2">
        <TextInput
          testID="weight-input"
          ref={inputRef}
          onFocus={() => scrollFieldIntoView(inputRef.current)}
          value={value}
          onChangeText={onChangeText}
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
