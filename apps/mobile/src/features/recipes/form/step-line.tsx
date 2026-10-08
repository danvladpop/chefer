import { useRef } from 'react';
import { View, type TextInput } from 'react-native';
import { Input, Text, useScrollFieldIntoView } from '@chefer/ui-mobile';
import { SwipeToRemove } from '../../../components/swipe-to-remove';
import { recipeFormCopy } from './copy';
import { RowMenu } from './row-menu';

export interface StepLineProps {
  index: number;
  total: number;
  value: string;
  onChange: (value: string) => void;
  onRemove: () => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
}

/** One recipe step. Optional — a blank step is dropped on save (D-19). */
export function StepLine({
  index,
  total,
  value,
  onChange,
  onRemove,
  onMoveUp,
  onMoveDown,
}: StepLineProps) {
  const inputRef = useRef<TextInput>(null);
  const scrollFieldIntoView = useScrollFieldIntoView();

  return (
    // T-40.10 (PAT-16, Δ2.6): swipe left removes the step, same path as the
    // ⋯ menu below — progressive enhancement, never the only way (AC14).
    <SwipeToRemove testID={`rf-step-${index}-swipe`} onRemove={onRemove}>
      <View testID={`rf-step-${index}`} className="flex-row items-start gap-2">
        <View
          accessibilityElementsHidden
          className="mt-2 h-6 w-6 items-center justify-center rounded-full bg-primary"
        >
          <Text className="text-xs font-bold text-primary-foreground">{index + 1}</Text>
        </View>
        <Input
          ref={inputRef}
          testID={`rf-step-input-${index}`}
          value={value}
          onChangeText={onChange}
          onFocus={() => scrollFieldIntoView(inputRef.current)}
          multiline
          placeholder="Describe this step… (optional)"
          accessibilityLabel={`Step ${index + 1}`}
          className="min-w-0 flex-1"
        />
        <RowMenu
          testID={`rf-step-menu-${index}`}
          accessibilityLabel={`Options for step ${index + 1}`}
          actions={[
            ...(index > 0
              ? [
                  {
                    label: recipeFormCopy.buttons.moveUp,
                    testID: `rf-step-menu-${index}-up`,
                    onPress: onMoveUp,
                  },
                ]
              : []),
            ...(index < total - 1
              ? [
                  {
                    label: recipeFormCopy.buttons.moveDown,
                    testID: `rf-step-menu-${index}-down`,
                    onPress: onMoveDown,
                  },
                ]
              : []),
            {
              label: recipeFormCopy.buttons.removeStep,
              destructive: true,
              testID: `rf-step-menu-${index}-remove`,
              onPress: onRemove,
            },
          ]}
        />
      </View>
    </SwipeToRemove>
  );
}
