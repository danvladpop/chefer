import type { ReactNode } from 'react';
import { Pressable, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Text } from '@chefer/ui-mobile';
import { cn } from '@chefer/utils';

// T-39.1 / T-26.5: no Checkbox exists yet in `@chefer/ui-mobile` (the kit has
// no select/combobox/form-field-wrapper — 03 §D.0 "Kit after wave 0"). This is
// a small, local, accessible checkbox row scoped to the auth consent boxes —
// a promotion to the shared kit is a reasonable follow-up once another lane
// needs one too.

export interface ConsentCheckboxProps {
  testID: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
  error?: string;
  errorTestID?: string;
  children: ReactNode;
}

export function ConsentCheckbox({
  testID,
  checked,
  onChange,
  error,
  errorTestID,
  children,
}: ConsentCheckboxProps) {
  return (
    <View className="gap-1">
      <Pressable
        testID={testID}
        accessibilityRole="checkbox"
        accessibilityState={{ checked }}
        onPress={() => onChange(!checked)}
        // 44×44 minimum touch target (CLAUDE.md responsive rules) even though
        // the visible box is much smaller.
        className="min-h-11 flex-row items-start gap-3 py-1"
      >
        <View
          className={cn(
            'mt-0.5 h-5 w-5 items-center justify-center rounded-md border-2',
            checked ? 'border-primary bg-primary' : 'border-input bg-background',
            error && !checked && 'border-destructive',
          )}
        >
          {checked && <Ionicons name="checkmark" size={14} color="white" />}
        </View>
        <Text className="min-w-0 flex-1 text-sm text-gray-800">{children}</Text>
      </Pressable>
      {error ? (
        <Text
          variant="muted"
          className="text-destructive"
          testID={errorTestID}
          accessibilityRole="alert"
        >
          {error}
        </Text>
      ) : null}
    </View>
  );
}
