import { forwardRef, useRef, useState } from 'react';
import { Keyboard, Pressable, TextInput, View } from 'react-native';
import { INGREDIENT_CATALOG_COPY, RECIPE_UNIT_GROUPS } from '@chefer/types';
import {
  haptics,
  NumericReturnBar,
  PressableScale,
  SelectField,
  Text,
  useScrollFieldIntoView,
  type SelectOption,
} from '@chefer/ui-mobile';
import {
  ingredientUnitGroups,
  parseQuantity,
  sanitizeQuantityInput,
  unitForPickedIngredient,
} from '@chefer/utils';
import { SwipeToRemove } from '../../../components/swipe-to-remove';
import {
  pickedFromRef,
  type CatalogFormLine,
  type PickedIngredient,
} from '../../ingredients/catalog-line';
import { IngredientPickerField } from '../../ingredients/ingredient-picker-field';
import { recipeFormCopy } from './copy';
import { RowMenu } from './row-menu';

/** Before a line is linked, the unit list is the general one (it narrows once picked). */
const GENERIC_UNIT_OPTIONS: SelectOption[] = RECIPE_UNIT_GROUPS.flatMap((g) =>
  g.units.map((u) => ({ value: u, label: u, group: g.label })),
);

const UNIT_GROUP_LABELS = INGREDIENT_CATALOG_COPY.unit.groups;

/** The unit options a linked line may use (plan §10): only what the engine can weigh. */
function unitOptionsFor(ingredient: UnitSource | undefined): SelectOption[] {
  if (!ingredient) return GENERIC_UNIT_OPTIONS;
  return ingredientUnitGroups(ingredient).flatMap((g) =>
    g.units.map((u) => ({ value: u, label: u, group: UNIT_GROUP_LABELS[g.label] })),
  );
}

/** ¼ ½ ¾ 1 1½ 2 — the fraction chip row shown while the quantity field has focus. */
const FRACTION_CHIPS: { label: string; value: number }[] = [
  { label: '¼', value: 0.25 },
  { label: '½', value: 0.5 },
  { label: '¾', value: 0.75 },
  { label: '1', value: 1 },
  { label: '1½', value: 1.5 },
  { label: '2', value: 2 },
];

type UnitSource = Pick<PickedIngredient, 'portions' | 'hasDensity' | 'category'> & {
  name?: string;
};

export interface IngredientLineProps {
  index: number;
  line: CatalogFormLine;
  /** Best-known data of the linked row (getMany detail or the picked snapshot). */
  ingredient?: UnitSource | undefined;
  /** Row error, e.g. "Add an amount, or remove this line." */
  error?: string;
  /** The unit can't be weighed for this row — shown under the unit field. */
  unitError?: string | undefined;
  onChange: (patch: Partial<CatalogFormLine>) => void;
  onRemove: () => void;
  nativeIDPrefix: string;
}

/**
 * One ingredient row: qty (decimal-pad, `NumericReturnBar` on iOS), unit
 * (`SelectField`, PAT-15) and name (`IngredientPickerField`, the catalog
 * combobox). Reads as one sentence group for a screen reader
 * ("Ingredient {n}: {qty} {unit} {name}"), each control reachable.
 *
 * plan-ingredient-catalog §10: once linked, the unit list holds only what the
 * shared engine can weigh for THAT row — g/kg, volume units when it has a
 * density, its own portions, pinch / to taste. Picking a row keeps a unit the
 * row can measure and otherwise switches to its natural unit; a typed amount
 * is never converted. A legacy line that isn't linked shows the resolver's
 * suggestions under it ("Pick a match").
 *
 * The forwarded ref reaches the QUANTITY `TextInput` — what the blocked-tap
 * scroll-and-focus path (PAT-17, `recipe-form.tsx`) lands on.
 */
export const IngredientLine = forwardRef<TextInput, IngredientLineProps>(function IngredientLine(
  { index, line, ingredient, error, unitError, onChange, onRemove, nativeIDPrefix },
  qtyRef,
) {
  const [qtyFocused, setQtyFocused] = useState(false);
  const qtyInputRef = useRef<TextInput>(null);
  const scrollFieldIntoView = useScrollFieldIntoView();
  const accessoryID = `${nativeIDPrefix}-qty-${index}`;
  const linked = Boolean(line.ingredientId);
  const needsMatch = !linked && !line.resolving && (line.name.trim() !== '' || !!line.rawName);
  const linkedName = ingredient?.name ?? line.ingredient?.name;
  const showLinkedName =
    linked && linkedName && linkedName.toLowerCase() !== line.name.trim().toLowerCase();

  const setQtyRef = (el: TextInput | null) => {
    qtyInputRef.current = el;
    if (typeof qtyRef === 'function') qtyRef(el);
    else if (qtyRef) qtyRef.current = el;
  };

  const pick = (picked: PickedIngredient) => {
    onChange({
      name: picked.name,
      ingredientId: picked.id,
      ingredient: picked,
      linked: true,
      candidates: undefined,
      unit: unitForPickedIngredient(line.unit || 'g', picked, {
        // A typed amount keeps its unit when the new row can measure it.
        keepDefault: parseQuantity(line.quantity) > 0,
      }),
    });
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
              onChangeText={(v) => onChange({ quantity: sanitizeQuantityInput(v) })}
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
              options={unitOptionsFor(linked ? (ingredient ?? line.ingredient) : undefined)}
              onChange={(unit) => onChange({ unit })}
            />
          </View>
          <IngredientPickerField
            testID={`rf-ingredient-name-${index}`}
            name={line.name}
            linked={linked}
            needsMatch={needsMatch}
            searchText={line.rawName ?? line.name}
            suggestions={line.candidates}
            placeholder="Search, e.g. flour"
            accessibilityLabel={`Name for ingredient ${index + 1}`}
            onPick={pick}
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
      {showLinkedName || line.note ? (
        <Text testID={`rf-ingredient-linked-${index}`} variant="muted" className="text-xs">
          {[showLinkedName ? linkedName : null, line.note].filter(Boolean).join(' · ')}
        </Text>
      ) : null}
      {needsMatch ? (
        <View testID={`rf-ingredient-match-${index}`} className="gap-1">
          <Text className="text-xs text-amber-800">
            {line.candidates && line.candidates.length > 0
              ? INGREDIENT_CATALOG_COPY.picker.pickMatchHint(line.rawName ?? line.name)
              : INGREDIENT_CATALOG_COPY.picker.noMatchFound(line.rawName ?? line.name)}
          </Text>
          {line.candidates && line.candidates.length > 0 ? (
            <View className="flex-row flex-wrap gap-1.5">
              {line.candidates.slice(0, 3).map((c) => (
                // MO-01 press feedback on each suggestion.
                <PressableScale
                  key={c.id}
                  pressScale="control"
                  testID={`rf-ingredient-candidate-${index}-${c.slug}`}
                  accessibilityRole="button"
                  accessibilityLabel={`${INGREDIENT_CATALOG_COPY.picker.pickMatch}: ${c.name}`}
                  onPress={() => {
                    haptics.selection();
                    pick(pickedFromRef(c));
                  }}
                  className="min-h-11 justify-center rounded-full border border-amber-300 bg-amber-50 px-3"
                >
                  <Text numberOfLines={1} className="text-xs font-medium text-amber-900">
                    {c.name}
                  </Text>
                </PressableScale>
              ))}
            </View>
          ) : null}
        </View>
      ) : null}
      {unitError ? (
        <Text testID={`rf-ingredient-unit-error-${index}`} className="text-xs text-destructive">
          {unitError}
        </Text>
      ) : null}
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
      {/* No next text field on this row (the name field opens a sheet) —
          the accessory just dismisses the pad. */}
      <NumericReturnBar nativeID={accessoryID} label="Done" onPress={() => Keyboard.dismiss()} />
    </View>
  );
});
