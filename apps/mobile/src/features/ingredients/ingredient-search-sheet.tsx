import { useEffect, useMemo, useRef, useState } from 'react';
import { Image, Keyboard, ScrollView, View, type TextInput } from 'react-native';
import {
  INGREDIENT_CATALOG_COPY,
  INGREDIENT_CATEGORY_LABELS,
  INGREDIENT_PICKER_CATEGORIES,
  NUTRITION_SOURCE_LABELS,
  type IngredientCategory,
} from '@chefer/types';
import { Chip, Input, keyboardDismissMode, PressableScale, Sheet, Text } from '@chefer/ui-mobile';
import { trpc } from '../../lib/trpc';
import {
  pickedFromRef,
  pickedFromSearchRow,
  type CatalogRef,
  type IngredientSearchRow,
  type PickedIngredient,
} from './catalog-line';
import { useKeyboardAwareMaxHeight } from './use-keyboard-aware-max-height';

const copy = INGREDIENT_CATALOG_COPY.picker;

/**
 * Reserve for everything ABOVE the one scrollable region: the grabber +
 * title row (~70), the search input (~60) and the category chip row (~56),
 * plus safe-area/padding slop. Deliberately generous — see
 * use-keyboard-aware-max-height.ts. Nothing is pinned below the scroll
 * region (see the layout note below), so there's no footer to reserve for.
 */
const RESULTS_RESERVED_PX = 240;

export interface IngredientSearchSheetProps {
  visible: boolean;
  onClose: () => void;
  /** Forwarded to the kit Sheet — fires once the close animation is fully done. */
  onExited?: () => void;
  /** Prefills the search box (e.g. a legacy line's typed name). */
  initialQuery?: string;
  /** The resolver's suggestions for a legacy/imported line, shown before any search. */
  suggestions?: readonly CatalogRef[] | undefined;
  onPick: (ingredient: PickedIngredient) => void;
  onCreateCustom: (text: string) => void;
  testID?: string;
}

const DEBOUNCE_MS = 250;
const MIN_QUERY_LENGTH = 2;

/**
 * The catalog picker (plan-ingredient-catalog §10, T-40.7 originally): every
 * recipe line is picked from here and carries the row's `ingredientId`.
 * `ingredients.search` from 2 characters, 250 ms debounce, results kept
 * across keystrokes (`placeholderData`, no flicker), private rows grouped
 * first. Category chips narrow the search (`category`). When nothing fits,
 * "Create "…" as my ingredient" opens the private-ingredient sheet — there is
 * no free-text escape hatch any more, because a free-text line cannot be
 * computed.
 *
 * Layout notes kept from the orchestrator's Maestro review (iOS simulator):
 *  1. `scrollable={false}` and an inner, keyboard-aware bounded ScrollView —
 *     the kit Sheet's own ScrollView collapsed with a dynamic results list
 *     as the input's only sibling, and its `maxHeight` ignores the keyboard.
 *  2. Focus via two rAFs after open instead of `autoFocus`, which raced the
 *     Sheet's entrance layout.
 *  3. The create action is the LAST row of the same ScrollView, never a
 *     separately pinned footer a long list could render underneath.
 */
export function IngredientSearchSheet({
  visible,
  onClose,
  onExited,
  initialQuery = '',
  suggestions,
  onPick,
  onCreateCustom,
  testID = 'ingredient-search-sheet',
}: IngredientSearchSheetProps) {
  const [query, setQuery] = useState(initialQuery);
  const [debounced, setDebounced] = useState('');
  const [category, setCategory] = useState<IngredientCategory | null>(null);
  const inputRef = useRef<TextInput>(null);
  const resultsMaxHeight = useKeyboardAwareMaxHeight(RESULTS_RESERVED_PX);

  useEffect(() => {
    if (visible) {
      setQuery(initialQuery);
      setCategory(null);
    }
    // Only re-seed when the sheet opens — not on every initialQuery change,
    // which would otherwise wipe out what the user is mid-typing.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);

  useEffect(() => {
    if (!visible) return;
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
    { query: debounced, ...(category ? { category } : {}) },
    { enabled: visible && canSearch, staleTime: 30_000, placeholderData: (p) => p },
  );

  const groups = useMemo(() => {
    // A legacy custom row without a catalog twin has no id and cannot be linked.
    const rows = (results ?? []).filter((r) => r.id);
    const mine = rows.filter((r) => r.owner === 'mine' || r.isCustom);
    const catalog = rows.filter((r) => !(r.owner === 'mine' || r.isCustom));
    return [
      { label: copy.yourIngredients, rows: mine },
      { label: copy.catalog, rows: catalog },
    ].filter((g) => g.rows.length > 0);
  }, [results]);

  const pickRow = (row: IngredientSearchRow) => {
    const picked = pickedFromSearchRow(row);
    if (picked) onPick(picked);
  };

  const showSuggestions = !canSearch && (suggestions?.length ?? 0) > 0;

  return (
    <Sheet
      visible={visible}
      onClose={onClose}
      onExited={onExited}
      title={copy.title}
      testID={testID}
      scrollable={false}
    >
      <View className="gap-3">
        <Input
          ref={inputRef}
          testID={`${testID}-input`}
          accessibilityLabel={copy.title}
          value={query}
          onChangeText={setQuery}
          placeholder={copy.placeholder}
          returnKeyType="search"
          onSubmitEditing={() => Keyboard.dismiss()}
        />

        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          className="-mx-4 grow-0"
          contentContainerClassName="gap-2 px-4"
          testID={`${testID}-categories`}
          accessibilityLabel={INGREDIENT_CATALOG_COPY.custom.category}
        >
          <Chip
            testID={`${testID}-category-all`}
            label={copy.allCategories}
            selected={category === null}
            onPress={() => setCategory(null)}
          />
          {INGREDIENT_PICKER_CATEGORIES.map((c) => (
            <Chip
              key={c}
              testID={`${testID}-category-${c}`}
              label={INGREDIENT_CATEGORY_LABELS[c]}
              selected={category === c}
              onPress={() => setCategory((cur) => (cur === c ? null : c))}
            />
          ))}
        </ScrollView>

        <ScrollView
          testID={`${testID}-results`}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode={keyboardDismissMode()}
          className="grow-0"
          style={{ maxHeight: resultsMaxHeight }}
        >
          <View className="gap-2">
            {showSuggestions ? (
              <View className="gap-1">
                <Text
                  accessibilityRole="header"
                  className="px-1 text-xs font-semibold uppercase tracking-widest text-muted-foreground"
                >
                  {copy.pickMatch}
                </Text>
                {suggestions?.map((ref) => (
                  <ResultRow
                    key={ref.id}
                    testID={`${testID}-suggestion-${ref.slug}`}
                    name={ref.name}
                    detail={NUTRITION_SOURCE_LABELS[ref.nutritionSource]}
                    mine={ref.owner === 'mine'}
                    onPress={() => onPick(pickedFromRef(ref))}
                  />
                ))}
              </View>
            ) : null}

            {canSearch &&
              groups.map((group) => (
                <View key={group.label} className="gap-1">
                  <Text
                    accessibilityRole="header"
                    className="px-1 text-xs font-semibold uppercase tracking-widest text-muted-foreground"
                  >
                    {group.label}
                  </Text>
                  {group.rows.map((row) => (
                    <ResultRow
                      key={row.id ?? row.name}
                      testID={`${testID}-result-${row.slug ?? row.name}`}
                      name={row.displayName}
                      imageUrl={row.imageUrl}
                      detail={row.per100g ? copy.perHundred(row.per100g.calories) : undefined}
                      mine={row.owner === 'mine' || row.isCustom}
                      onPress={() => pickRow(row)}
                    />
                  ))}
                </View>
              ))}
            {canSearch && groups.length === 0 && !isFetching && (
              <Text testID={`${testID}-empty`} variant="muted" className="px-1 text-xs">
                {copy.noMatches}
              </Text>
            )}
            {canSearch && isFetching && groups.length === 0 && (
              <Text variant="muted" className="px-1 text-xs">
                {copy.searching}
              </Text>
            )}

            {/* The create action is the last row of this scroll container
                (layout note 3) — always reachable, never overlapped. */}
            <View className="gap-1 border-t border-border pt-3">
              <PressableScale
                testID={`${testID}-add-custom`}
                pressScale="control"
                accessibilityRole="button"
                onPress={() => onCreateCustom(trimmed)}
                className="min-h-11 justify-center"
              >
                <Text className="text-sm font-medium text-primary">
                  {trimmed.length > 0 ? copy.createAsMine(trimmed) : copy.createAsMineEmpty}
                </Text>
              </PressableScale>
            </View>
          </View>
        </ScrollView>
      </View>
    </Sheet>
  );
}

function ResultRow({
  testID,
  name,
  imageUrl,
  detail,
  mine,
  onPress,
}: {
  testID: string;
  name: string;
  imageUrl?: string | undefined;
  detail?: string | undefined;
  mine: boolean;
  onPress: () => void;
}) {
  const label = [name, mine ? NUTRITION_SOURCE_LABELS.USER : null, detail]
    .filter(Boolean)
    .join(', ');
  return (
    // MO-01 press feedback on every result row.
    <PressableScale
      testID={testID}
      pressScale="card"
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      className="min-h-[52px] flex-row items-center gap-2.5 rounded-lg px-1 py-1.5"
    >
      {imageUrl ? (
        <Image
          source={{ uri: imageUrl }}
          className="h-9 w-9 shrink-0 rounded-md"
          resizeMode="cover"
        />
      ) : (
        <View className="h-9 w-9 shrink-0 rounded-md bg-muted" />
      )}
      <View className="min-w-0 flex-1">
        <Text numberOfLines={2} className="text-sm font-medium text-foreground">
          {name}
        </Text>
        <View className="flex-row items-center gap-1.5">
          {mine ? (
            <View className="rounded-full bg-accent px-1.5 py-0.5">
              <Text className="text-xs text-primary">{NUTRITION_SOURCE_LABELS.USER}</Text>
            </View>
          ) : null}
          {detail ? <Text className="text-xs text-muted-foreground">{detail}</Text> : null}
        </View>
      </View>
    </PressableScale>
  );
}
