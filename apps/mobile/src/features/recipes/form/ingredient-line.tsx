import { forwardRef, useRef, useState } from 'react';
import { Pressable, TextInput, View } from 'react-native';
import { RECIPE_UNIT_GROUPS, type RecipeFormIngredientLine } from '@chefer/types';
import {
  haptics,
  NumericReturnBar,
  SelectField,
  Text,
  useScrollFieldIntoView,
  type SelectOption,
} from '@chefer/ui-mobile';
import { recipeFormCopy } from './copy';
import { RowMenu } from './row-menu';

const UNIT_OPTIONS: SelectOption[] = RECIPE_UNIT_GROUPS.flatMap((g) =>
  g.units.map((u) => ({ value: u, label: u, group: g.label })),
);

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
 * "Next" focuses the name field, standing in for "Next → the unit, then the
 * name" since the unit is a sheet trigger rather than a text field), unit
 * (`SelectField`, PAT-15), name. Reads as one sentence group for a screen
 * reader ("Ingredient {n}: {qty} {unit} {name}"), each control individually
 * reachable. The fraction chip row (a `radiogroup`, "Common amounts")
 * appears only while the quantity field has focus.
 *
 * The forwarded ref reaches the NAME `TextInput`, so a parent can chain
 * "next ingredient" navigation across rows.
 */
export const IngredientLine = forwardRef<TextInput, IngredientLineProps>(function IngredientLine(
  { index, line, error, onChange, onRemove, nativeIDPrefix },
  nameRef,
) {
  const [qtyFocused, setQtyFocused] = useState(false);
  const qtyInputRef = useRef<TextInput>(null);
  const localNameRef = useRef<TextInput>(null);
  const scrollFieldIntoView = useScrollFieldIntoView();
  const accessoryID = `${nativeIDPrefix}-qty-${index}`;

  const setNameRef = (el: TextInput | null) => {
    localNameRef.current = el;
    if (typeof nameRef === 'function') nameRef(el);
    else if (nameRef) nameRef.current = el;
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
      <View className="flex-row items-end gap-2">
        <View className="w-[72px] gap-1">
          <Text variant="label" accessibilityElementsHidden>
            Qty
          </Text>
          <TextInput
            ref={qtyInputRef}
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
            value={line.unit || 'g'}
            options={UNIT_OPTIONS}
            onChange={(unit) => onChange({ unit })}
            allowOther={{ inputLabel: 'Unit' }}
          />
        </View>
        <View className="min-w-0 flex-1">
          <TextInput
            ref={setNameRef}
            testID={`rf-ingredient-name-${index}`}
            value={line.name}
            onChangeText={(v) => onChange({ name: v })}
            onFocus={() => scrollFieldIntoView(localNameRef.current)}
            returnKeyType="next"
            placeholder="flour"
            placeholderTextColor="#9ca3af"
            accessibilityLabel={`Name for ingredient ${index + 1}`}
            className="h-11 rounded-md border border-input bg-background px-3 text-base text-foreground"
          />
        </View>
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
      <NumericReturnBar
        nativeID={accessoryID}
        label="Next"
        onPress={() => localNameRef.current?.focus()}
      />
    </View>
  );
});
