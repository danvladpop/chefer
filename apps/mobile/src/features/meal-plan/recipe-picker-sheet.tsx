import { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Image,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  SectionList,
  TextInput,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Button, Text } from '@chefer/ui-mobile';
import { buildPickerSections } from '@chefer/utils';
import { getRecipeImageUrl } from '../../lib/recipe-image';
import { trpc } from '../../lib/trpc';

// Bottom sheet for replacing one meal slot. Primary action: pick a specific
// recipe (free tier included — replaceRecipe has no quota). Secondary, in the
// footer: regenerate the slot with AI (premium; caller omits onAiSwap
// otherwise). Plain RN Modal — no bottom-sheet lib, keeping deps lean.
interface RecipePickerSheetProps {
  visible: boolean;
  /** Name of the meal being replaced — shown in the header. */
  mealName: string;
  /** True while the replace/AI mutation runs; rows and footer lock. */
  busy: boolean;
  error: string | null;
  onSelect: (recipeId: string) => void;
  onAiSwap?: () => void;
  onClose: () => void;
}

export function RecipePickerSheet({
  visible,
  mealName,
  busy,
  error,
  onSelect,
  onAiSwap,
  onClose,
}: RecipePickerSheetProps) {
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // The Modal stays mounted between opens — start each open with a clean search.
  useEffect(() => {
    if (!visible) {
      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
      }
      setSearch('');
      setDebouncedSearch('');
    }
  }, [visible]);

  const handleSearch = (value: string) => {
    setSearch(value);
    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
    }
    debounceRef.current = setTimeout(() => setDebouncedSearch(value), 300);
  };

  const searchInput = debouncedSearch || undefined;
  const mineQuery = trpc.recipe.list.useQuery(
    { search: searchInput, myRecipesOnly: true, limit: 20 },
    { enabled: visible },
  );
  const allQuery = trpc.recipe.list.useQuery(
    { search: searchInput, limit: 30 },
    { enabled: visible },
  );

  const sections = buildPickerSections(mineQuery.data, allQuery.data);
  const isLoading = mineQuery.isLoading || allQuery.isLoading;

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View className="flex-1 justify-end">
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Close recipe picker"
          onPress={onClose}
          className="absolute inset-0 bg-black/40"
        />
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <View
            testID="picker-sheet"
            className="rounded-t-3xl bg-card pb-6"
            style={{ maxHeight: '85%' }}
          >
            <View className="items-center pt-2">
              <View className="h-1 w-10 rounded-full bg-gray-300" />
            </View>

            {/* Header */}
            <View className="flex-row items-center justify-between gap-3 px-4 pb-2 pt-3">
              <View className="min-w-0 flex-1">
                <Text className="text-xs font-semibold uppercase tracking-widest text-gray-500">
                  Replace meal
                </Text>
                <Text testID="picker-title" numberOfLines={1} className="text-base font-semibold">
                  {mealName}
                </Text>
              </View>
              <Pressable
                testID="picker-close"
                accessibilityRole="button"
                accessibilityLabel="Close"
                onPress={onClose}
                className="h-11 w-11 items-center justify-center rounded-full bg-gray-100"
              >
                <Ionicons name="close" size={20} color="#374151" />
              </Pressable>
            </View>

            {/* Search */}
            <View className="px-4 pb-2">
              <TextInput
                testID="picker-search"
                value={search}
                onChangeText={handleSearch}
                placeholder="Search recipes…"
                placeholderTextColor="#9ca3af"
                className="h-11 rounded-xl border border-input bg-background px-4 text-base text-foreground"
              />
            </View>

            {error && (
              <View className="mx-4 mb-2 rounded-xl border border-red-200 bg-red-50 px-3 py-2">
                <Text className="text-xs text-red-600">{error}</Text>
              </View>
            )}

            {/* Recipe list */}
            {isLoading ? (
              <View className="items-center py-10">
                <ActivityIndicator size="large" color="#944a00" />
              </View>
            ) : sections.length === 0 ? (
              <View className="items-center px-4 py-10">
                <Text variant="muted">No recipes match your search.</Text>
              </View>
            ) : (
              <SectionList
                sections={sections}
                keyExtractor={(recipe) => recipe.id}
                keyboardShouldPersistTaps="handled"
                stickySectionHeadersEnabled={false}
                className="grow-0"
                contentContainerClassName="px-4 pb-2"
                renderSectionHeader={({ section }) => (
                  <Text className="pb-1.5 pt-3 text-xs font-semibold uppercase tracking-widest text-gray-500">
                    {section.title}
                  </Text>
                )}
                renderItem={({ item: recipe }) => {
                  const n = recipe.nutritionInfo as { calories: number };
                  return (
                    <Pressable
                      testID={`picker-recipe-${recipe.id}`}
                      accessibilityRole="button"
                      accessibilityLabel={`Use ${recipe.name}`}
                      disabled={busy}
                      onPress={() => onSelect(recipe.id)}
                      className="mb-2 flex-row items-center gap-3 rounded-xl border border-border bg-background p-2"
                    >
                      <Image
                        source={{ uri: getRecipeImageUrl(recipe.imageUrl) }}
                        className="h-12 w-12 rounded-lg"
                        resizeMode="cover"
                      />
                      <View className="min-w-0 flex-1">
                        <Text numberOfLines={1} className="text-sm font-medium text-gray-900">
                          {recipe.name}
                        </Text>
                        <Text className="text-xs text-gray-500">{n.calories} kcal</Text>
                      </View>
                      {recipe.isFavourite && <Ionicons name="heart" size={14} color="#944a00" />}
                    </Pressable>
                  );
                }}
              />
            )}

            {/* Footer — AI fallback (premium only; quota enforced server-side) */}
            {onAiSwap && (
              <View className="border-t border-border px-4 pt-3">
                <Button testID="picker-ai-swap" variant="outline" loading={busy} onPress={onAiSwap}>
                  Regenerate with AI
                </Button>
              </View>
            )}
          </View>
        </KeyboardAvoidingView>
      </View>
    </Modal>
  );
}
