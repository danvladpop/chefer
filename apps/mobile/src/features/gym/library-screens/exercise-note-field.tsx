import { useRef } from 'react';
import type { TextInput } from 'react-native';
import { Input, useScrollFieldIntoView } from '@chefer/ui-mobile';

// UX-GYM-35: the personal note on the exercise detail screen used to sit under
// the keyboard and show a single line. It scrolls itself clear of the keyboard
// on focus (`useScrollFieldIntoView` — a no-op outside a
// `KeyboardAwareScrollView`, so this MUST be a child of one) and grows with its
// text. Must be a CHILD of the scroll view, hence its own component.

export interface ExerciseNoteFieldProps {
  value: string;
  onChangeText: (value: string) => void;
  onFocusChange?: (focused: boolean) => void;
  testID?: string;
}

export function ExerciseNoteField({
  value,
  onChangeText,
  onFocusChange,
  testID = 'exercise-detail-note',
}: ExerciseNoteFieldProps) {
  const ref = useRef<TextInput>(null);
  const scrollFieldIntoView = useScrollFieldIntoView();
  return (
    <Input
      ref={ref}
      testID={testID}
      accessibilityLabel="Your notes"
      value={value}
      onChangeText={onChangeText}
      onFocus={() => {
        onFocusChange?.(true);
        scrollFieldIntoView(ref.current);
      }}
      onBlur={() => onFocusChange?.(false)}
      placeholder="A personal cue or reminder…"
      multiline
      // The screen pins its own sticky Done while this field is focused.
      showDoneBar={false}
      textAlignVertical="top"
      className="h-auto min-h-20 py-2"
    />
  );
}
