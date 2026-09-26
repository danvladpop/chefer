import { useRef, useState } from 'react';
import { Pressable, TextInput, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Text, useScrollFieldIntoView } from '@chefer/ui-mobile';
import { cn, parseBodyWeight } from '@chefer/utils';
import { useUnitSystem } from '../../hooks/use-unit-system';
import { trpc } from '../../lib/trpc';

// One weigh-in form for the dashboard weight card and the Progress screen —
// mobile counterpart of web features/coach/WeightLogForm. Validation mirrors
// the API via the shared parser (audit F-DASH-3-1). The field takes the
// user's unit (lb for IMPERIAL, backlog P2-6) and sends kg.

export function WeightLogForm({ placeholder, label }: { placeholder?: string; label?: string }) {
  const system = useUnitSystem();
  const imperial = system === 'IMPERIAL';
  const [value, setValue] = useState('');
  const [inputError, setInputError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const inputRef = useRef<TextInput>(null);
  // Keeps the field clear of the keyboard inside a KeyboardAwareScrollView
  // (Progress); a no-op elsewhere.
  const scrollFieldIntoView = useScrollFieldIntoView();
  const utils = trpc.useUtils();

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
    logWeight.mutate({ weightKg: parsed.kg });
  };

  const error = inputError ?? logWeight.error?.message ?? null;
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
      {error && (
        <Text testID="weight-error" className="mt-1 text-xs text-red-600">
          {error}
        </Text>
      )}
    </View>
  );
}
