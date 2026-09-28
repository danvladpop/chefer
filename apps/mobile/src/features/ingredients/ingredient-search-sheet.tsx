import { useEffect, useMemo, useState } from 'react';
import { Image, Pressable, View } from 'react-native';
import type { RecipeUnit } from '@chefer/types';
import { Input, Sheet, Text } from '@chefer/ui-mobile';
import { trpc, type RouterOutputs } from '../../lib/trpc';
import { ingredientsCopy } from './copy';
import { naturalUnitForIngredient } from './natural-unit';

export type IngredientSearchRow = RouterOutputs['ingredients']['search'][number];

export interface IngredientPickedResult {
  name: string;
  naturalUnit: RecipeUnit | undefined;
}

export interface IngredientSearchSheetProps {
  visible: boolean;
  onClose: () => void;
  /** Forwarded to the kit Sheet — fires once the close animation is fully done. */
  onExited?: () => void;
  /** Prefills the search box (e.g. the line's current free-typed name). */
  initialQuery?: string;
  onPick: (result: IngredientPickedResult) => void;
  onUseAsTyped: (text: string) => void;
  onCreateCustom: (text: string) => void;
  testID?: string;
}

const DEBOUNCE_MS = 250;
const MIN_QUERY_LENGTH = 2;

/**
 * T-40.7 (UX-40 slice 2): the ingredient name field's combobox trigger opens
 * this full-height search sheet — `ingredients.search` from 2 characters,
 * 250 ms debounce, results kept across keystrokes (`placeholderData`, no
 * flicker), private rows grouped first. Mirrors the web reference
 * (`apps/web/src/features/recipes/components/IngredientPicker.tsx`).
 */
export function IngredientSearchSheet({
  visible,
  onClose,
  onExited,
  initialQuery = '',
  onPick,
  onUseAsTyped,
  onCreateCustom,
  testID = 'ingredient-search-sheet',
}: IngredientSearchSheetProps) {
  const [query, setQuery] = useState(initialQuery);
  const [debounced, setDebounced] = useState('');

  useEffect(() => {
    if (visible) setQuery(initialQuery);
    // Only re-seed when the sheet opens — not on every initialQuery change,
    // which would otherwise wipe out what the user is mid-typing.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);

  useEffect(() => {
    const t = setTimeout(() => setDebounced(query.trim()), DEBOUNCE_MS);
    return () => clearTimeout(t);
  }, [query]);

  const trimmed = query.trim();
  const canSearch = debounced.length >= MIN_QUERY_LENGTH;

  const { data: results, isFetching } = trpc.ingredients.search.useQuery(
    { query: debounced },
    { enabled: visible && canSearch, staleTime: 30_000, placeholderData: (p) => p },
  );

  const groups = useMemo(() => {
    const rows = results ?? [];
    const mine = rows.filter((r) => r.isCustom);
    const catalogue = rows.filter((r) => !r.isCustom);
    return [
      { label: ingredientsCopy.search.yourIngredients, rows: mine },
      { label: ingredientsCopy.search.catalogue, rows: catalogue },
    ].filter((g) => g.rows.length > 0);
  }, [results]);

  const pick = (row: IngredientSearchRow) => {
    onPick({ name: row.displayName, naturalUnit: naturalUnitForIngredient(row.name) });
  };

  return (
    <Sheet
      visible={visible}
      onClose={onClose}
      onExited={onExited}
      title={ingredientsCopy.search.title}
      testID={testID}
    >
      <View className="gap-3">
        <Input
          testID={`${testID}-input`}
          accessibilityLabel={ingredientsCopy.search.title}
          autoFocus
          value={query}
          onChangeText={setQuery}
          placeholder={ingredientsCopy.search.placeholder}
          returnKeyType="search"
        />

        {canSearch && (
          <View className="gap-2">
            {groups.map((group) => (
              <View key={group.label} className="gap-1">
                <Text
                  accessibilityRole="header"
                  className="px-1 text-xs font-semibold uppercase tracking-widest text-muted-foreground"
                >
                  {group.label}
                </Text>
                {group.rows.map((row) => (
                  <Pressable
                    key={row.name}
                    testID={`${testID}-result-${row.name}`}
                    accessibilityRole="button"
                    accessibilityLabel={
                      row.per100g
                        ? `${row.displayName}, ${Math.round(row.per100g.calories)} kcal per 100 g`
                        : `${row.displayName}, no nutrition data yet`
                    }
                    onPress={() => pick(row)}
                    className="min-h-[52px] flex-row items-center gap-2.5 rounded-lg px-1 py-1.5 active:bg-accent"
                  >
                    <Image
                      source={{ uri: row.imageUrl }}
                      className="h-9 w-9 shrink-0 rounded-md"
                      resizeMode="cover"
                    />
                    <View className="min-w-0 flex-1">
                      <Text numberOfLines={1} className="text-sm font-medium text-foreground">
                        {row.displayName}
                      </Text>
                      {row.per100g ? (
                        <Text className="text-xs text-muted-foreground">
                          {Math.round(row.per100g.calories)} kcal / 100 g
                        </Text>
                      ) : (
                        <View className="mt-0.5 self-start rounded-full bg-muted px-1.5 py-0.5">
                          <Text className="text-xs text-muted-foreground">
                            {ingredientsCopy.search.noMacrosYet}
                          </Text>
                        </View>
                      )}
                    </View>
                  </Pressable>
                ))}
              </View>
            ))}
            {groups.length === 0 && !isFetching && (
              <Text testID={`${testID}-empty`} variant="muted" className="px-1 text-xs">
                {ingredientsCopy.search.noMatches}
              </Text>
            )}
            {isFetching && groups.length === 0 && (
              <Text variant="muted" className="px-1 text-xs">
                {ingredientsCopy.search.searching}
              </Text>
            )}
          </View>
        )}

        {trimmed.length > 0 && (
          <View className="gap-1 border-t border-border pt-3">
            <Pressable
              testID={`${testID}-add-custom`}
              accessibilityRole="button"
              onPress={() => onCreateCustom(trimmed)}
              className="min-h-11 justify-center"
            >
              <Text className="text-sm font-medium text-primary">
                {ingredientsCopy.search.addAsMine(trimmed)}
              </Text>
            </Pressable>
            <Pressable
              testID={`${testID}-use-as-typed`}
              accessibilityRole="button"
              onPress={() => onUseAsTyped(trimmed)}
              className="min-h-11 justify-center"
            >
              <Text variant="muted" className="text-xs">
                {ingredientsCopy.search.useAsTyped(trimmed)}
              </Text>
            </Pressable>
          </View>
        )}
      </View>
    </Sheet>
  );
}
