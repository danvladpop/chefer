import { forwardRef, useRef, useState } from 'react';
import { Keyboard, Pressable, TextInput, View } from 'react-native';
import { RECIPE_UNIT_GROUPS, type RecipeFormIngredientLine } from '@chefer/types';
import {
  haptics,
  NumericReturnBar,
  SelectField,
  Text,
  useScrollFieldIntoView,
  type SelectOption,
} from '@chefer/ui-mobile';
import { SwipeToRemove } from '../../../components/swipe-to-remove';
import { IngredientPickerField } from '../../ingredients/ingredient-picker-field';
import { recipeFormCopy } from './copy';
import { RowMenu } from './row-menu';

const UNIT_OPTIONS: SelectOption[] = RECIPE_UNIT_GROUPS.flatMap((g) =>
  g.units.map((u) => ({ value: u, label: u, group: g.label })),
);

/** The unit a fresh line starts with (recipe-form.tsx's `{ unit: 'g' }`) — T-40.7
 * only swaps in a catalogue row's natural unit while the line is still at this default. */
const DEFAULT_UNIT = 'g';

/** ¼ ½ ¾ 1 1½ 2 — the fraction chip row shown while the quantity field has focus. */
const FRACTION_CHIPS: { label: string; value: number }[] = [
  { label: '¼', value: 0.25 },
  { label: '½', value: 0.5 },
  { label: '¾', value: 0.75 },
  { label: '1', value: 1 },
  { label: '1½', value: 1.5 },
  { label: '2', value: 2 },
];

export interface IngredientLineProps {
  index: number;
  line: RecipeFormIngredientLine;
  /** Row error, e.g. "Add an amount, or remove this line." — a named line with no amount. */
  error?: string;
  onChange: (patch: Partial<RecipeFormIngredientLine>) => void;
  onRemove: () => void;
  nativeIDPrefix: string;
}

/**
 * One ingredient row: qty (decimal-pad, `NumericReturnBar` on iOS — its
 * "Done" dismisses the pad, since neither the unit nor the name is a text
 * field to chain to any more), unit (`SelectField`, PAT-15), name (T-40.7:
 * `IngredientPickerField`, a combobox TRIGGER that opens the ingredient
 * search sheet rather than a free-text field). Reads as one sentence group
 * for a screen reader ("Ingredient {n}: {qty} {unit} {name}"), each control
 * individually reachable. The fraction chip row (a `radiogroup`, "Common
 * amounts") appears only while the quantity field has focus.
 *
 * The forwarded ref reaches the QUANTITY `TextInput` — the field D-19's
 * `incompleteLine` error actually means (a named line missing its amount),
 * and what the blocked-tap scroll-and-focus path (PAT-17, `recipe-form.tsx`)
 * lands on. The name field is no longer a `TextInput` (T-40.7: it opens the
 * ingredient search sheet instead), so it can't be that ref any more.
 */
export const IngredientLine = forwardRef<TextInput, IngredientLineProps>(function IngredientLine(
  { index, line, error, onChange, onRemove, nativeIDPrefix },
  qtyRef,
) {
  const [qtyFocused, setQtyFocused] = useState(false);
  const qtyInputRef = useRef<TextInput>(null);
  const scrollFieldIntoView = useScrollFieldIntoView();
  const accessoryID = `${nativeIDPrefix}-qty-${index}`;

  const setQtyRef = (el: TextInput | null) => {
    qtyInputRef.current = el;
    if (typeof qtyRef === 'function') qtyRef(el);
    else if (qtyRef) qtyRef.current = el;
  };

  return (
    <View
      testID={`rf-ingredient-${index}`}
      accessibilityRole="none"
      accessibilityLabel={`Ingredient ${index + 1}: ${line.quantity || '0'} ${line.unit} ${
        line.name || 'unnamed'
      }`}
      className="gap-1.5"
    >
      {/* T-40.10 (PAT-16, Δ2.6): swipe left removes the line, same path as
          the ⋯ menu below — progressive enhancement, never the only way. */}
      <SwipeToRemove testID={`rf-ingredient-${index}-swipe`} onRemove={onRemove}>
        <View className="flex-row items-end gap-2">
          <View className="w-[72px] gap-1">
            <Text variant="label" accessibilityElementsHidden>
              Qty
            </Text>
            <TextInput
              ref={setQtyRef}
              testID={`rf-ingredient-qty-${index}`}
              value={line.quantity}
              onChangeText={(v) => onChange({ quantity: v })}
              onFocus={() => {
                setQtyFocused(true);
                scrollFieldIntoView(qtyInputRef.current);
              }}
              onBlur={() => setQtyFocused(false)}
              keyboardType="decimal-pad"
              inputAccessoryViewID={accessoryID}
              placeholder="200 or ½"
              placeholderTextColor="#9ca3af"
              accessibilityLabel={`Quantity for ingredient ${index + 1}`}
              className="h-11 rounded-md border border-input bg-background px-2 text-center text-base text-foreground"
            />
          </View>
          <View className="w-[88px]">
            <SelectField
              testID={`rf-ingredient-unit-${index}`}
              label="Unit"
              value={line.unit || DEFAULT_UNIT}
              options={UNIT_OPTIONS}
              onChange={(unit) => onChange({ unit })}
              allowOther={{ inputLabel: 'Unit' }}
            />
          </View>
          <IngredientPickerField
            testID={`rf-ingredient-name-${index}`}
            name={line.name}
            linked={line.linked ?? false}
            placeholder="flour"
            accessibilityLabel={`Name for ingredient ${index + 1}`}
            onPick={(patch) =>
              onChange({
                name: patch.name,
                linked: patch.linked,
                ...(patch.naturalUnit && (line.unit || DEFAULT_UNIT) === DEFAULT_UNIT
                  ? { unit: patch.naturalUnit }
                  : {}),
              })
            }
          />
          <RowMenu
            testID={`rf-ingredient-menu-${index}`}
            accessibilityLabel={`Options for ingredient ${index + 1}`}
            actions={[
              {
                label: recipeFormCopy.buttons.removeIngredient,
                destructive: true,
                testID: `rf-ingredient-menu-${index}-remove`,
                onPress: onRemove,
              },
            ]}
          />
        </View>
      </SwipeToRemove>
      {error ? (
        <Text testID={`rf-ingredient-error-${index}`} className="text-xs text-destructive">
          {error}
        </Text>
      ) : null}
      {qtyFocused ? (
        <View
          testID={`rf-ingredient-fractions-${index}`}
          accessibilityRole="radiogroup"
          accessibilityLabel="Common amounts"
          className="flex-row flex-wrap gap-1.5"
        >
          {FRACTION_CHIPS.map((chip) => (
            <Pressable
              key={chip.label}
              testID={`rf-fraction-${index}-${chip.label}`}
              accessibilityRole="radio"
              accessibilityLabel={chip.label}
              onPress={() => {
                haptics.selection();
                onChange({ quantity: String(chip.value) });
              }}
              className="min-h-8 min-w-8 items-center justify-center rounded-full border border-border px-2.5"
            >
              <Text className="text-sm font-medium">{chip.label}</Text>
            </Pressable>
          ))}
        </View>
      ) : null}
      {/* No next text field on this row any more (T-40.7: the name field
          opens a sheet instead) — the accessory just dismisses the pad. */}
      <NumericReturnBar nativeID={accessoryID} label="Done" onPress={() => Keyboard.dismiss()} />
    </View>
  );
});
