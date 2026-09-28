import { useEffect, useMemo, useRef, useState } from 'react';
import { Image, Pressable, ScrollView, View, type TextInput } from 'react-native';
import type { RecipeUnit } from '@chefer/types';
import { Input, Sheet, Text } from '@chefer/ui-mobile';
import { trpc, type RouterOutputs } from '../../lib/trpc';
import { ingredientsCopy } from './copy';
import { naturalUnitForIngredient } from './natural-unit';
import { useKeyboardAwareMaxHeight } from './use-keyboard-aware-max-height';

/**
 * Reserve for everything besides the results list: grabber + title row
 * (~70), the search input (~60), the pinned footer's two action rows
 * (~100), plus safe-area/padding slop. Deliberately generous — see
 * use-keyboard-aware-max-height.ts.
 */
const RESULTS_RESERVED_PX = 280;

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
 *
 * Bug fix (orchestrator review, Maestro on the iOS simulator): the sheet
 * used to render as just its header — blank below the title, no keyboard.
 * Two compounding causes:
 *  1. The kit `Sheet`'s default `scrollable` mode wraps children in its OWN
 *     `ScrollView`, which sizes to content. Mixed with a long, dynamically
 *     appearing results list that's the search input's ONLY sibling on
 *     first open, that ScrollView could end up with nothing to measure
 *     against and collapse. `recipe-picker-sheet.tsx` (a working reference)
 *     avoids this by passing `scrollable={false}` and owning any inner
 *     scrolling itself — same fix applied here, with the input and the
 *     "Use as typed"/"Add as mine" actions pinned OUTSIDE the scrollable
 *     region (the actions move into Sheet's `footer`, exactly like every
 *     other Sheet with pinned actions in this codebase).
 *  2. `autoFocus` on the search input fired on the very first render, the
 *     SAME moment the Sheet's entrance animation and its own layout were
 *     still settling — racing the keyboard-avoiding calculation before
 *     anything had a measured height. `quick-add-sheet.tsx`'s working
 *     `autoFocus` input is never the sheet's first-and-only child on open;
 *     ours was. Fixed by focusing manually via `InteractionManager`, after
 *     the sheet's opening interaction has finished.
 *
 * Second bug fix (same review, follow-up): with the keyboard up, a long
 * results list rendered past the visible area and UNDER the pinned footer
 * (tapping a row that far down hit the footer instead) — the kit Sheet's
 * `maxHeight` is a fraction of the FULL window and never accounts for the
 * keyboard. `useKeyboardAwareMaxHeight` bounds the results ScrollView to
 * the real remaining space instead, so it scrolls behind a clipped edge.
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
  const inputRef = useRef<TextInput>(null);
  const resultsMaxHeight = useKeyboardAwareMaxHeight(RESULTS_RESERVED_PX);

  useEffect(() => {
    if (visible) setQuery(initialQuery);
    // Only re-seed when the sheet opens — not on every initialQuery change,
    // which would otherwise wipe out what the user is mid-typing.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);

  useEffect(() => {
    if (!visible) return;
    // Focus AFTER the sheet's own open animation/layout settle — see the
    // bug-fix note above. A plain `autoFocus` on the input fires too early
    // (the same render pass that starts the sheet's entrance animation) and
    // can wedge the sheet's layout. Two rAFs: one to get past this commit,
    // one to land after the frame that follows it — `InteractionManager` is
    // deprecated, so this is the non-deprecated equivalent "next frame".
    let secondFrame = 0;
    const firstFrame = requestAnimationFrame(() => {
      secondFrame = requestAnimationFrame(() => {
        inputRef.current?.focus();
      });
    });
    return () => {
      cancelAnimationFrame(firstFrame);
      if (secondFrame) cancelAnimationFrame(secondFrame);
    };
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
      scrollable={false}
      footer={
        trimmed.length > 0 ? (
          <View className="gap-1">
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
        ) : undefined
      }
    >
      <View className="gap-3">
        <Input
          ref={inputRef}
          testID={`${testID}-input`}
          accessibilityLabel={ingredientsCopy.search.title}
          value={query}
          onChangeText={setQuery}
          placeholder={ingredientsCopy.search.placeholder}
          returnKeyType="search"
        />

        {canSearch && (
          <ScrollView
            testID={`${testID}-results`}
            keyboardShouldPersistTaps="handled"
            className="grow-0"
            style={{ maxHeight: resultsMaxHeight }}
          >
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
          </ScrollView>
        )}
      </View>
    </Sheet>
  );
}
