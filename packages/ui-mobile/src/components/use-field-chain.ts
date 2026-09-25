import { useCallback, useEffect, useRef, useState } from 'react';
import { Keyboard, type TextInput } from 'react-native';

// Gym dogfood #2: a list of similar fields (starting weights, one per
// exercise) should behave like a form — Return/submit moves to the next
// field, the last one dismisses the keyboard. Core RN only: plain refs +
// `onSubmitEditing`, no native module.

export interface FieldChainBinding {
  ref: (el: TextInput | null) => void;
  returnKeyType: 'next' | 'done';
  onSubmitEditing: () => void;
  onFocus: () => void;
  onBlur: () => void;
}

export interface UseFieldChainResult {
  /**
   * Props to spread onto the `index`-th field in the chain. `opts.onFocus`
   * receives that field's own instance — pass it straight to
   * `useScrollFieldIntoView()` to also keep it clear of the keyboard:
   * `chain.bind(i, { onFocus: scrollFieldIntoView })`.
   */
  bind: (
    index: number,
    opts?: { onFocus?: (field: TextInput | null) => void; onBlur?: () => void },
  ) => FieldChainBinding;
  /** The index of the currently-focused field, or `null` when none in this chain has focus. */
  focusedIndex: number | null;
  /** Whether the focused field is the last one (its natural label is "Done", not "Next"). */
  isLastFocused: boolean;
  /** Focuses the field after `fromIndex` (defaults to the currently-focused one), or dismisses past the end. */
  focusNext: (fromIndex?: number) => void;
}

/**
 * Chains `length` fields together for Return-key / accessory-bar navigation.
 * Submitting field `i` focuses field `i + 1`; submitting the last one
 * dismisses the keyboard instead. Pair with `NumericReturnBar` for
 * `decimal-pad` / `number-pad` fields, which have no Return key on iOS.
 *
 * ```tsx
 * const chain = useFieldChain(exercises.length);
 * exercises.map((ex, i) => <Input {...chain.bind(i)} keyboardType="decimal-pad" />)
 * ```
 */
export function useFieldChain(length: number): UseFieldChainResult {
  const refs = useRef<(TextInput | null)[]>([]);
  const [focusedIndex, setFocusedIndex] = useState<number | null>(null);

  useEffect(() => {
    // Drop stale refs beyond a shrunk list (e.g. an exercise removed from the preview).
    refs.current.length = length;
  }, [length]);

  const focusIndex = useCallback(
    (index: number) => {
      if (index < 0) return;
      if (index >= length) {
        Keyboard.dismiss();
        return;
      }
      refs.current[index]?.focus();
    },
    [length],
  );

  const focusNext = useCallback(
    (fromIndex?: number) => {
      const from = fromIndex ?? focusedIndex;
      if (from === null) return;
      focusIndex(from + 1);
    },
    [focusIndex, focusedIndex],
  );

  const bind = useCallback(
    (
      index: number,
      opts?: { onFocus?: (field: TextInput | null) => void; onBlur?: () => void },
    ): FieldChainBinding => ({
      ref: (el) => {
        refs.current[index] = el;
      },
      returnKeyType: index === length - 1 ? 'done' : 'next',
      onSubmitEditing: () => focusIndex(index + 1),
      onFocus: () => {
        setFocusedIndex(index);
        opts?.onFocus?.(refs.current[index] ?? null);
      },
      onBlur: () => {
        setFocusedIndex((current) => (current === index ? null : current));
        opts?.onBlur?.();
      },
    }),
    [focusIndex, length],
  );

  return {
    bind,
    focusedIndex,
    isLastFocused: focusedIndex !== null && focusedIndex === length - 1,
    focusNext,
  };
}
