import { useState } from 'react';
import { View } from 'react-native';
import {
  Button,
  ChipGroup,
  PressableScale,
  Sheet,
  Text,
  useThemeColors,
  type ChipOption,
} from '@chefer/ui-mobile';
import { Icon } from '../../../components/icon';

// ─── MultiSelectField (10 Oct redesign, ExerciseForm board) ─────────────────
// The multi-choice sibling of `SelectField` (PAT-15 "dropdown"): a 44pt
// trigger that reads like an input (comma-joined picks or a placeholder, a
// chevron-down) and opens a `Sheet` holding a multi-select `ChipGroup` and a
// Done button. Picks apply as they are tapped — the caller's `onChange` keeps
// its own rules (caps, exclusions) and its error shows inside the sheet too,
// so a refused tap is never silent. Owner note: fewer chips on the form
// itself, so the long muscle list lives behind this dropdown.

export interface MultiSelectFieldProps<T extends string> {
  /** Field name: the sheet title and the start of the accessibility label. */
  label: string;
  value: readonly T[];
  options: readonly ChipOption<T>[];
  onChange: (value: T[]) => void;
  placeholder?: string;
  /** Plain-language error under the trigger (and inside the open sheet). */
  error?: string | undefined;
  /**
   * The trigger's id; the sheet (`-sheet`), its chips (`-option-<value>`), Done
   * (`-done`) and the error (`-error`) derive from it.
   */
  testID: string;
}

export function MultiSelectField<T extends string>({
  label,
  value,
  options,
  onChange,
  placeholder = 'Choose one or more',
  error,
  testID,
}: MultiSelectFieldProps<T>) {
  const colors = useThemeColors();
  const [open, setOpen] = useState(false);
  // Labels in option order, whatever order they were picked in.
  const picked = options.filter((o) => value.includes(o.value)).map((o) => o.label);
  const display = picked.length > 0 ? picked.join(', ') : null;

  return (
    <View className="gap-1">
      {/* MO-01: press scale on the trigger. */}
      <PressableScale
        testID={testID}
        accessibilityRole="button"
        accessibilityLabel={`${label}, ${display ?? 'not set'}`}
        // The error is read with the control it belongs to (the RN stand-in
        // for aria-describedby), like the form's other field errors.
        accessibilityHint={error ?? 'Opens a list to choose from'}
        onPress={() => setOpen(true)}
        className={[
          'min-h-11 flex-row items-center justify-between gap-2 rounded-control border bg-surface px-3 py-2',
          error ? 'border-danger' : 'border-separator',
        ].join(' ')}
      >
        <Text
          className={[
            'min-w-0 flex-1 text-body',
            display ? 'text-label' : 'text-label-tertiary',
          ].join(' ')}
          numberOfLines={2}
        >
          {display ?? placeholder}
        </Text>
        <Icon name="chevronDown" size={18} color={colors.labelSecondary} />
      </PressableScale>
      {error ? (
        <Text
          testID={`${testID}-error`}
          accessibilityRole="alert"
          accessibilityLiveRegion="polite"
          className="text-subhead text-danger"
        >
          {error}
        </Text>
      ) : null}
      <Sheet
        visible={open}
        onClose={() => setOpen(false)}
        title={label}
        testID={`${testID}-sheet`}
        footer={
          <Button testID={`${testID}-done`} onPress={() => setOpen(false)}>
            Done
          </Button>
        }
      >
        <View className="gap-3">
          {error ? (
            <Text
              testID={`${testID}-sheet-error`}
              accessibilityRole="alert"
              accessibilityLiveRegion="polite"
              className="text-subhead text-danger"
            >
              {error}
            </Text>
          ) : null}
          <ChipGroup
            testID={`${testID}-options`}
            options={options.map((o) => ({ ...o, testID: `${testID}-option-${o.value}` }))}
            value={value}
            multiple
            onChange={onChange}
          />
        </View>
      </Sheet>
    </View>
  );
}
