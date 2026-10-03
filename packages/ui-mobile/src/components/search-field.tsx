import { forwardRef, useCallback, useEffect, useRef, useState } from 'react';
import {
  Pressable,
  TextInput,
  View,
  type TextInputProps,
  type TextInputSubmitEditingEvent,
} from 'react-native';
import Svg, { Circle, Path } from 'react-native-svg';
import { cn } from '@chefer/utils';
import { colors } from './theme';

/** Minimum touch target (pt) — the field height and the clear button's hit area. */
export const SEARCH_TARGET_PT = 44;

/** `onDebouncedChange` waits this long after the last keystroke (UX §3.1). */
export const SEARCH_DEBOUNCE_MS = 250;

export interface SearchFieldProps extends Omit<
  TextInputProps,
  'accessibilityLabel' | 'value' | 'defaultValue'
> {
  /** Required — a placeholder is not a label. */
  accessibilityLabel: string;
  /** Controlled value. Omit it (optionally with `defaultValue`) for an uncontrolled field. */
  value?: string;
  defaultValue?: string;
  /** Fires after `debounceMs` of quiet, and immediately on submit and on clear. */
  onDebouncedChange?: (text: string) => void;
  debounceMs?: number;
  /** Fires after the clear `×` empties the field (the field keeps focus). */
  onClear?: () => void;
  className?: string;
  testID?: string;
}

/**
 * 44 pt pill search input: leading magnifier, trailing clear `×` with its own
 * 44 × 44 pt hit area. Return key is `search`; autocorrect is off. The icons
 * are drawn with react-native-svg — the kit has no icon dependency.
 */
export const SearchField = forwardRef<TextInput, SearchFieldProps>(function SearchField(
  {
    accessibilityLabel,
    value,
    defaultValue = '',
    onChangeText,
    onDebouncedChange,
    debounceMs = SEARCH_DEBOUNCE_MS,
    onClear,
    onSubmitEditing,
    editable = true,
    className,
    testID,
    ...props
  },
  forwardedRef,
) {
  const [inner, setInner] = useState(defaultValue);
  const text = value ?? inner;
  const inputRef = useRef<TextInput | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Always call the latest callback, even if it changed during the wait.
  const debouncedRef = useRef(onDebouncedChange);
  debouncedRef.current = onDebouncedChange;

  const cancel = useCallback(() => {
    if (timer.current !== null) {
      clearTimeout(timer.current);
      timer.current = null;
    }
  }, []);
  useEffect(() => cancel, [cancel]);

  const setRef = (node: TextInput | null) => {
    inputRef.current = node;
    if (typeof forwardedRef === 'function') forwardedRef(node);
    else if (forwardedRef) forwardedRef.current = node;
  };

  const change = (next: string) => {
    setInner(next);
    onChangeText?.(next);
    cancel();
    timer.current = setTimeout(() => {
      timer.current = null;
      debouncedRef.current?.(next);
    }, debounceMs);
  };

  const clear = () => {
    cancel();
    setInner('');
    onChangeText?.('');
    debouncedRef.current?.('');
    onClear?.();
    inputRef.current?.focus();
  };

  const submit = (event: TextInputSubmitEditingEvent) => {
    // The return key searches right away — no waiting out the debounce.
    if (timer.current !== null) {
      cancel();
      debouncedRef.current?.(text);
    }
    onSubmitEditing?.(event);
  };

  return (
    <View
      testID={testID ? `${testID}-field` : undefined}
      style={{ minHeight: SEARCH_TARGET_PT }}
      className={cn(
        'min-h-11 flex-row items-center rounded-full border border-input bg-background pl-3',
        !editable && 'opacity-50',
        className,
      )}
    >
      <Svg width={18} height={18} viewBox="0 0 24 24" fill="none" accessibilityElementsHidden>
        <Circle cx={11} cy={11} r={7} stroke={colors.mutedForeground} strokeWidth={2} />
        <Path
          d="M20 20l-3.5-3.5"
          stroke={colors.mutedForeground}
          strokeWidth={2}
          strokeLinecap="round"
        />
      </Svg>
      <TextInput
        ref={setRef}
        testID={testID}
        accessibilityLabel={accessibilityLabel}
        value={text}
        onChangeText={change}
        onSubmitEditing={submit}
        editable={editable}
        returnKeyType="search"
        autoCorrect={false}
        autoCapitalize="words"
        placeholderTextColor="#9ca3af"
        className="min-w-0 flex-1 px-2 py-2 text-base text-foreground"
        {...props}
      />
      {text.length > 0 && editable ? (
        <Pressable
          testID={testID ? `${testID}-clear` : undefined}
          accessibilityRole="button"
          accessibilityLabel="Clear search"
          onPress={clear}
          style={{ minWidth: SEARCH_TARGET_PT, minHeight: SEARCH_TARGET_PT }}
          className="h-11 w-11 items-center justify-center rounded-full active:opacity-60"
        >
          <Svg width={16} height={16} viewBox="0 0 24 24" fill="none" accessibilityElementsHidden>
            <Path
              d="M6 6l12 12M18 6L6 18"
              stroke={colors.mutedForeground}
              strokeWidth={2.5}
              strokeLinecap="round"
            />
          </Svg>
        </Pressable>
      ) : (
        <View className="w-3" />
      )}
    </View>
  );
});
