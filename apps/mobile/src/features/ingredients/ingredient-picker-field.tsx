import { useRef, useState } from 'react';
import { Pressable, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import type { RecipeUnit } from '@chefer/types';
import { Text } from '@chefer/ui-mobile';
import { CustomIngredientSheet } from './custom-ingredient-sheet';
import { IngredientSearchSheet } from './ingredient-search-sheet';

export interface IngredientPickPatch {
  name: string;
  linked: boolean;
  naturalUnit?: RecipeUnit;
}

export interface IngredientPickerFieldProps {
  name: string;
  linked: boolean;
  onPick: (patch: IngredientPickPatch) => void;
  placeholder: string;
  accessibilityLabel: string;
  testID: string;
}

/**
 * T-40.7/T-40.8 (UX-40 slice 2): the ingredient line's name field, rebuilt as
 * a combobox TRIGGER (like `SelectField`, PAT-15) instead of a free-text
 * input. Tapping it opens the full-height `IngredientSearchSheet`; picking a
 * row, choosing "Use as typed" or saving a new custom ingredient all funnel
 * back through `onPick`. The line's "missing amount" error still scrolls to
 * and focuses the QUANTITY field (`ingredient-line.tsx`'s forwarded ref) —
 * that field, not this one, is what D-19's `incompleteLine` case is missing.
 *
 * The two sheets never animate open and closed at the same time — the
 * custom sheet only opens once the search sheet's `onExited` fires (the kit
 * `Sheet`'s own doc: a Modal must finish dismissing before the next one
 * presents), the same choreography `AiConsentProvider`/`AiConsentHost` uses
 * for nested sheets.
 */
export function IngredientPickerField({
  name,
  linked,
  onPick,
  placeholder,
  accessibilityLabel,
  testID,
}: IngredientPickerFieldProps) {
  const [searchOpen, setSearchOpen] = useState(false);
  const [customOpen, setCustomOpen] = useState(false);
  const [customPrefill, setCustomPrefill] = useState('');
  const pendingCustomOpen = useRef(false);

  return (
    <View className="min-w-0 flex-1">
      <Pressable
        testID={testID}
        accessibilityRole="button"
        accessibilityLabel={
          linked && name ? `${accessibilityLabel}, ${name}, nutrition known` : accessibilityLabel
        }
        accessibilityHint="Opens ingredient search"
        onPress={() => setSearchOpen(true)}
        className="h-11 flex-row items-center gap-1 rounded-md border border-input bg-background px-3"
      >
        {linked && name ? (
          <Ionicons
            name="nutrition-outline"
            size={14}
            color="#6b7280"
            accessibilityElementsHidden
          />
        ) : null}
        <Text
          numberOfLines={1}
          className={
            name ? 'flex-1 text-base text-foreground' : 'flex-1 text-base text-muted-foreground'
          }
        >
          {name || placeholder}
        </Text>
      </Pressable>

      <IngredientSearchSheet
        visible={searchOpen}
        initialQuery={name}
        onClose={() => setSearchOpen(false)}
        onExited={() => {
          if (pendingCustomOpen.current) {
            pendingCustomOpen.current = false;
            setCustomOpen(true);
          }
        }}
        onPick={(result) => {
          setSearchOpen(false);
          onPick({ name: result.name, linked: true, naturalUnit: result.naturalUnit });
        }}
        onUseAsTyped={(text) => {
          setSearchOpen(false);
          onPick({ name: text, linked: false });
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
        onCreated={(displayName) => {
          setCustomOpen(false);
          onPick({ name: displayName, linked: true });
        }}
        testID={`${testID}-custom-sheet`}
      />
    </View>
  );
}
