import { useState } from 'react';
import { Pressable, TextInput, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Text } from '@chefer/ui-mobile';
import type { SafetyValue } from '../types';

export function ChipEditor({
  label,
  values,
  onChange,
  placeholder,
  max,
  testID,
}: {
  label: string;
  values: string[];
  onChange: (next: string[]) => void;
  placeholder: string;
  max: number;
  testID: string;
}) {
  const [draft, setDraft] = useState('');

  const add = () => {
    const v = draft.trim();
    if (!v || values.includes(v) || values.length >= max) {
      return;
    }
    onChange([...values, v]);
    setDraft('');
  };

  return (
    <View className="gap-2">
      <Text variant="label">{label}</Text>
      <View className="flex-row gap-2">
        <TextInput
          testID={`${testID}-input`}
          value={draft}
          onChangeText={setDraft}
          onSubmitEditing={add}
          placeholder={placeholder}
          placeholderTextColor="#9ca3af"
          returnKeyType="done"
          className="h-11 flex-1 rounded-md border border-input bg-background px-3 text-base text-foreground"
        />
        <Pressable
          testID={`${testID}-add`}
          accessibilityRole="button"
          accessibilityLabel={`Add to ${label}`}
          onPress={add}
          className="h-11 w-11 items-center justify-center rounded-md border border-border"
        >
          <Ionicons name="add" size={20} color="#944a00" />
        </Pressable>
      </View>
      {values.length > 0 && (
        <View className="flex-row flex-wrap gap-1.5">
          {values.map((v) => (
            <Pressable
              key={v}
              accessibilityRole="button"
              accessibilityLabel={`Remove ${v}`}
              onPress={() => onChange(values.filter((x) => x !== v))}
              className="min-h-9 flex-row items-center gap-1 rounded-full bg-accent px-3"
            >
              <Text className="text-xs font-medium text-primary">{v}</Text>
              <Ionicons name="close" size={12} color="#944a00" />
            </Pressable>
          ))}
        </View>
      )}
    </View>
  );
}

export interface SafetyStepProps {
  value: SafetyValue;
  onChange: (value: SafetyValue) => void;
  /** testID prefix for the three chip editors (default 'prefs', matches the
      existing Preferences screen so its Maestro/RNTL ids don't move). */
  testIDPrefix?: string;
}

/**
 * Allergies / restrictions / dislikes — free for every account (P1-2),
 * saved through preferences.updateSafety. Shared by the Preferences screen
 * and the onboarding wizard's safety step.
 */
export function SafetyStep({ value, onChange, testIDPrefix = 'prefs' }: SafetyStepProps) {
  return (
    <View className="gap-4">
      <ChipEditor
        testID={`${testIDPrefix}-restrictions`}
        label="Dietary restrictions"
        values={value.dietaryRestrictions}
        onChange={(dietaryRestrictions) => onChange({ ...value, dietaryRestrictions })}
        placeholder="e.g. vegetarian"
        max={20}
      />
      <ChipEditor
        testID={`${testIDPrefix}-allergies`}
        label="Allergies"
        values={value.allergies}
        onChange={(allergies) => onChange({ ...value, allergies })}
        placeholder="e.g. peanuts"
        max={20}
      />
      <ChipEditor
        testID={`${testIDPrefix}-disliked`}
        label="Disliked ingredients"
        values={value.dislikedIngredients}
        onChange={(dislikedIngredients) => onChange({ ...value, dislikedIngredients })}
        placeholder="e.g. cilantro"
        max={30}
      />
    </View>
  );
}
