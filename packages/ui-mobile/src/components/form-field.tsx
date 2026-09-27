import type { ReactNode } from 'react';
import { View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { cn } from '@chefer/utils';
import { Text } from './text';

export interface FormFieldProps {
  label: string;
  required?: boolean;
  hint?: string;
  error?: string;
  children: ReactNode;
  className?: string;
  testID?: string;
}

/**
 * PAT-17 field wrapper: label (` *` in `text-primary` when required), the
 * control, then either the error (destructive, `alert-circle`) or the hint
 * (muted). The `*` glyph is `accessibilityElementsHidden` — the label's
 * accessible name already reads "{label}, required" instead.
 *
 * The error `Text` carries a `nativeID` (`${testID}-error`) so a control
 * that supports `accessibilityLabelledBy` (Android) or is composed by its
 * caller with `aria-describedby` (web) can point at it; on iOS the error
 * copy sits directly under the control, which VoiceOver already reads in
 * order.
 */
export function FormField({
  label,
  required = false,
  hint,
  error,
  children,
  className,
  testID,
}: FormFieldProps) {
  const errorId = testID ? `${testID}-error` : undefined;
  return (
    <View testID={testID} className={cn('gap-1', className)}>
      <Text
        variant="label"
        accessibilityLabel={required ? `${label}, required` : label}
        nativeID={testID ? `${testID}-label` : undefined}
      >
        {label}
        {required ? (
          <Text
            variant="label"
            className="text-primary"
            accessibilityElementsHidden
            importantForAccessibility="no-hide-descendants"
          >
            {' *'}
          </Text>
        ) : null}
      </Text>
      {children}
      {error ? (
        <View
          className="flex-row items-center gap-1"
          accessibilityLiveRegion="polite"
          nativeID={errorId}
        >
          <Ionicons name="alert-circle" size={14} color="#dc2626" />
          <Text
            testID={testID ? `${testID}-error-text` : undefined}
            className="flex-1 text-xs text-destructive"
          >
            {error}
          </Text>
        </View>
      ) : hint ? (
        <Text testID={testID ? `${testID}-hint` : undefined} variant="muted" className="text-xs">
          {hint}
        </Text>
      ) : null}
    </View>
  );
}
