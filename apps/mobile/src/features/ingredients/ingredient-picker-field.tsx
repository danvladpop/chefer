import { useRef, useState } from 'react';
import { View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { PressableScale, Text } from '@chefer/ui-mobile';
import { cn } from '@chefer/utils';
import type { CatalogRef, PickedIngredient } from './catalog-line';
import { CustomIngredientSheet } from './custom-ingredient-sheet';
import { IngredientSearchSheet } from './ingredient-search-sheet';

export interface IngredientPickerFieldProps {
  /** What the row shows: the picked row's name, or a legacy line's typed text. */
  name: string;
  /** Linked to a catalog row (counted in nutrition). */
  linked: boolean;
  /** An unlinked line with text: shown in amber as "pick a match". */
  needsMatch?: boolean;
  /** Text the search opens with; defaults to `name`. */
  searchText?: string;
  /** The resolver's suggestions for an unlinked line. */
  suggestions?: readonly CatalogRef[] | undefined;
  onPick: (ingredient: PickedIngredient) => void;
  placeholder: string;
  accessibilityLabel: string;
  testID: string;
  /**
   * Where the field sits. `row` (default) fills the space left in a
   * `flex-row` parent (`flex-1`). `stack` is for a column parent, where
   * `flex-1` would collapse the field to zero height (FB7-03: the 44 pt
   * trigger then overlapped the text above it) — it takes the full width
   * and its natural height instead.
   */
  layout?: 'row' | 'stack';
}

/**
 * The ingredient line's name field (plan-ingredient-catalog §10; T-40.7
 * originally): a combobox TRIGGER (PAT-15) that opens the catalog
 * `IngredientSearchSheet`. Picking a row, or saving a new private ingredient
 * from `CustomIngredientSheet`, funnels back through `onPick` with the row's
 * id, portions and density.
 *
 * The two sheets never animate at the same time — the private-ingredient
 * sheet only opens once the search sheet's `onExited` fires (a Modal must
 * finish dismissing before the next presents), the same choreography
 * `AiConsentProvider`/`AiConsentHost` uses.
 */
export function IngredientPickerField({
  name,
  linked,
  needsMatch = false,
  searchText,
  suggestions,
  onPick,
  placeholder,
  accessibilityLabel,
  testID,
  layout = 'row',
}: IngredientPickerFieldProps) {
  const [searchOpen, setSearchOpen] = useState(false);
  const [customOpen, setCustomOpen] = useState(false);
  const [customPrefill, setCustomPrefill] = useState('');
  const pendingCustomOpen = useRef(false);

  const a11yLabel =
    linked && name
      ? `${accessibilityLabel}, ${name}, nutrition known`
      : needsMatch && name
        ? `${accessibilityLabel}, ${name}, needs a match`
        : accessibilityLabel;

  return (
    <View
      testID={`${testID}-root`}
      className={layout === 'stack' ? 'w-full min-w-0' : 'min-w-0 flex-1'}
    >
      {/* MO-01 press feedback on the trigger. */}
      <PressableScale
        testID={testID}
        pressScale="control"
        accessibilityRole="button"
        accessibilityLabel={a11yLabel}
        accessibilityHint="Opens ingredient search"
        onPress={() => setSearchOpen(true)}
        className={cn(
          'min-h-11 flex-row items-center gap-1 rounded-md border bg-background px-3 py-1',
          needsMatch ? 'border-amber-400' : 'border-input',
        )}
      >
        {linked && name ? (
          <Ionicons
            name="nutrition-outline"
            size={14}
            color="#6b7280"
            accessibilityElementsHidden
          />
        ) : needsMatch ? (
          <Ionicons
            name="help-circle-outline"
            size={14}
            color="#b45309"
            accessibilityElementsHidden
          />
        ) : null}
        {/* Two lines so a long name wraps instead of being cut at 320 pt. */}
        <Text
          numberOfLines={2}
          className={
            name
              ? 'min-w-0 flex-1 text-base text-foreground'
              : 'min-w-0 flex-1 text-base text-muted-foreground'
          }
        >
          {name || placeholder}
        </Text>
      </PressableScale>

      <IngredientSearchSheet
        visible={searchOpen}
        initialQuery={searchText ?? name}
        suggestions={suggestions}
        onClose={() => setSearchOpen(false)}
        onExited={() => {
          if (pendingCustomOpen.current) {
            pendingCustomOpen.current = false;
            setCustomOpen(true);
          }
        }}
        onPick={(ingredient) => {
          setSearchOpen(false);
          onPick(ingredient);
        }}
        onCreateCustom={(text) => {
          pendingCustomOpen.current = true;
          setCustomPrefill(text);
          setSearchOpen(false);
        }}
        testID={`${testID}-search-sheet`}
      />

      <CustomIngredientSheet
        visible={customOpen}
        initialName={customPrefill}
        onClose={() => setCustomOpen(false)}
        onCreated={(ingredient) => {
          setCustomOpen(false);
          onPick(ingredient);
        }}
        testID={`${testID}-custom-sheet`}
      />
    </View>
  );
}
