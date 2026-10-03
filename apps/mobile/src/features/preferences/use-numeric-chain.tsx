import { Keyboard, Platform, type TextInput } from 'react-native';
import { NumericReturnBar, useFieldChain, type FieldChainBinding } from '@chefer/ui-mobile';

// UX-ONB-06 / UX-X-05: number pads have no Return key on iOS, so every numeric
// field gets the `NumericReturnBar` accessory. The bar's label used to change
// with the focused field while all fields SHARED one `inputAccessoryViewID`;
// iOS re-attaches a shared accessory late, so the bar vanished, or became a
// dead chip whose tap fell through to whatever sat under it (a second tap
// changed the Activity level). Here every field owns its own bar — a fixed
// "Next" (or "Done" on the last field) with a fixed action — so there is
// nothing to swap and nothing to land on.

export interface NumericChainFieldProps extends FieldChainBinding {
  inputAccessoryViewID: string | undefined;
}

export interface UseNumericChainResult {
  /** Spread onto the `index`-th field: ref, return key, focus/blur and its own accessory id. */
  bind: (
    index: number,
    opts?: { onFocus?: (field: TextInput | null) => void; onBlur?: () => void },
  ) => NumericChainFieldProps;
  /** Render once, anywhere in the same screen: one bar per field (iOS only; Android has a Return key). */
  bars: React.ReactNode;
}

/**
 * Chains `length` numeric fields: Next focuses the following field, Done (the
 * last field) runs `onDone` — the screen's "submit" — or just closes the
 * keyboard when none is given.
 */
export function useNumericChain(
  idPrefix: string,
  length: number,
  onDone?: () => void,
): UseNumericChainResult {
  const chain = useFieldChain(length);
  const done = () => {
    Keyboard.dismiss();
    onDone?.();
  };
  const idFor = (index: number) => `${idPrefix}-numeric-bar-${index}`;

  const bind: UseNumericChainResult['bind'] = (index, opts) => ({
    ...chain.bind(index, opts),
    inputAccessoryViewID: Platform.OS === 'ios' ? idFor(index) : undefined,
    // Android's own Return key: the last field submits like the bar's Done.
    onSubmitEditing: index === length - 1 ? done : () => chain.focusNext(index),
  });

  const bars = (
    <>
      {Array.from({ length }, (_, index) => (
        <NumericReturnBar
          key={index}
          nativeID={idFor(index)}
          testID={`${idPrefix}-numeric-bar-${index}`}
          label={index === length - 1 ? 'Done' : 'Next'}
          onPress={index === length - 1 ? done : () => chain.focusNext(index)}
        />
      ))}
    </>
  );

  return { bind, bars };
}
