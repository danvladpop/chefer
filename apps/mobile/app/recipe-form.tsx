import { useEffect, useState } from 'react';
import { ActivityIndicator, Image, Pressable, TextInput, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { router, useLocalSearchParams } from 'expo-router';
import { fetch as expoFetch } from 'expo/fetch';
import {
  Button,
  Card,
  ChipGroup,
  ErrorState,
  KeyboardAwareScrollView,
  Screen,
  Text,
} from '@chefer/ui-mobile';
import { missingSummary, parseQuantity, recipeMissingFields, tagConflicts } from '@chefer/utils';
import { getApiBaseUrl } from '../src/lib/api-url';
import { getToken } from '../src/lib/auth-store';
import { base64ToBytes, uploadImage } from '../src/lib/media-client';
import { trpc } from '../src/lib/trpc';

// Manual recipe create/edit (T-40.3/T-40.6, T-01.6, T-BUG-O3 "O-15"). One
// screen: with ?id= it prefills from getMyRecipe and updates, otherwise it
// creates. D-19 minimum: a name + at least one ingredient line with a name
// and an amount — description/cuisine/steps are all optional.
//
// This PR fixes the O-15 "edit doesn't work" candidates (C1-C7) directly in
// this file; the full T-40.4 sectioned rebuild (separate ingredient-line /
// step-line / photo-field components under src/features/recipes/form/**,
// SelectField cuisine/unit pickers, fraction chips, swipe+Undo rows) is CUT
// from this PR — see the final report.

const DIETARY_TAG_PRESETS = [
  'vegan',
  'vegetarian',
  'gluten-free',
  'dairy-free',
  'keto',
  'paleo',
  'low-carb',
  'high-protein',
  'pescatarian',
  'nut-free',
];

interface IngredientRow {
  name: string;
  quantity: string;
  unit: string;
}

function Field({
  label,
  value,
  onChange,
  placeholder,
  multiline = false,
  numeric = false,
  testID,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  multiline?: boolean;
  numeric?: boolean;
  testID?: string;
}) {
  return (
    <View className="gap-1">
      <Text variant="label">{label}</Text>
      <TextInput
        testID={testID}
        value={value}
        onChangeText={onChange}
        placeholder={placeholder}
        placeholderTextColor="#9ca3af"
        multiline={multiline}
        keyboardType={numeric ? 'decimal-pad' : 'default'}
        className={
          multiline
            ? 'min-h-20 rounded-md border border-input bg-background px-3 py-2 text-base text-foreground'
            : 'h-11 rounded-md border border-input bg-background px-3 text-base text-foreground'
        }
      />
    </View>
  );
}

/** T-BUG-O3 C7: never show a raw server message (Zod issue lists etc). */
function friendlySaveError(message: string): string {
  const looksTechnical = message.length > 160 || /\bExpected\b|\bReceived\b|\[\s*{/.test(message);
  return looksTechnical ? "Couldn't save your recipe — please try again." : message;
}

export default function RecipeFormScreen() {
  const { id } = useLocalSearchParams<{ id?: string }>();
  const isEdit = typeof id === 'string' && id.length > 0;
  const utils = trpc.useUtils();

  // T-BUG-O3 C1: refetch on every mount and prefill only once THAT fetch has
  // landed — the old `enabled`-only query kept serving a cached pre-edit
  // copy, so reopening Edit right after a save showed the OLD values and a
  // second save reverted the first edit.
  const {
    data: existing,
    isLoading: loadingExisting,
    isError: loadError,
    isFetchedAfterMount,
    isFetching,
    refetch: refetchExisting,
  } = trpc.recipe.getMyRecipe.useQuery(
    { recipeId: id ?? '' },
    { enabled: isEdit, refetchOnMount: 'always' },
  );

  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [cuisineType, setCuisineType] = useState('');
  const [prepTime, setPrepTime] = useState('');
  const [cookTime, setCookTime] = useState('');
  const [servings, setServings] = useState('1');
  const [calories, setCalories] = useState('');
  const [protein, setProtein] = useState('');
  const [carbs, setCarbs] = useState('');
  const [fat, setFat] = useState('');
  // D-18: fiber has no input on either platform, but a stored value must
  // round-trip on edit (T-BUG-O3 C6) — kept out of band from the form UI.
  const [storedFiber, setStoredFiber] = useState(0);
  const [ingredients, setIngredients] = useState<IngredientRow[]>([
    { name: '', quantity: '', unit: 'g' },
  ]);
  const [instructions, setInstructions] = useState<string[]>(['']);
  const [dietTags, setDietTags] = useState<string[]>([]);
  const [prefilled, setPrefilled] = useState(false);
  const [imageUrl, setImageUrl] = useState('');
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);

  // Photo field (T-BUG-O1 kept: server-written upload sentences, never
  // "[object Object]"). Three separate, named steps so
  // feat/device-photo-resize's preparePhoto(asset) call drops in cleanly.
  const pickPhotoAsset = async (): Promise<ImagePicker.ImagePickerAsset | null> => {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: 'images',
      base64: true,
      quality: 0.5, // T-BUG-O1 (O-18, Q-22): was 0.8 — routinely exceeded the old 5 MB limit
    });
    return !result.canceled ? (result.assets.at(0) ?? null) : null;
  };

  const uploadPreparedPhoto = async (asset: ImagePicker.ImagePickerAsset): Promise<string> => {
    if (!asset.base64) throw new Error('That photo could not be read — try another one.');
    const mime = asset.mimeType === 'image/png' ? 'image/png' : 'image/jpeg';
    return uploadImage(
      { fetchImpl: expoFetch, apiBaseUrl: getApiBaseUrl(), getToken },
      base64ToBytes(asset.base64),
      mime,
    );
  };

  const pickPhoto = async () => {
    setUploadError(null);
    const asset = await pickPhotoAsset();
    if (!asset) return;
    setUploading(true);
    try {
      // T-BUG-O1.2: preparePhoto(asset) goes here once feat/device-photo-resize lands
      const prepared = asset;
      const url = await uploadPreparedPhoto(prepared);
      setImageUrl(url);
    } catch (err) {
      setUploadError(err instanceof Error ? err.message : 'Upload failed.');
    } finally {
      setUploading(false);
    }
  };

  useEffect(() => {
    if (!existing || prefilled || !isFetchedAfterMount || isFetching) {
      return;
    }
    setName(existing.name);
    setDescription(existing.description === 'Imported recipe.' ? '' : existing.description);
    setCuisineType(existing.cuisineType === 'International' ? '' : existing.cuisineType);
    setPrepTime(existing.prepTimeMins > 0 ? String(existing.prepTimeMins) : '');
    setCookTime(existing.cookTimeMins > 0 ? String(existing.cookTimeMins) : '');
    setServings(String(existing.servings));
    // Prisma stores nutritionInfo as JSON — same narrowing cast the web list uses.
    const n = (existing.nutritionInfo ?? {}) as {
      calories?: number;
      protein?: number;
      carbs?: number;
      fat?: number;
      fiber?: number;
    };
    setCalories(n.calories ? String(n.calories) : '');
    setProtein(n.protein ? String(n.protein) : '');
    setCarbs(n.carbs ? String(n.carbs) : '');
    setFat(n.fat ? String(n.fat) : '');
    setStoredFiber(n.fiber ?? 0);
    const ings = (existing.ingredients ?? []) as { name: string; quantity: number; unit: string }[];
    setIngredients(
      ings.length > 0
        ? ings.map((i) => ({ name: i.name, quantity: String(i.quantity), unit: i.unit }))
        : [{ name: '', quantity: '', unit: 'g' }],
    );
    setInstructions(existing.instructions.length > 0 ? [...existing.instructions] : ['']);
    setDietTags([...existing.dietaryTags]);
    setImageUrl(existing.imageUrl ?? '');
    setPrefilled(true);
  }, [existing, prefilled, isFetchedAfterMount, isFetching]);

  const onDone = () => {
    // T-BUG-O3 C1: invalidate every query this same recipe could be read
    // through, not just recipe.list — otherwise a stale getMyRecipe/
    // mealPlan.getRecipe cache reverts the edit the next time it's opened.
    void utils.recipe.list.invalidate();
    if (isEdit && id) {
      void utils.recipe.getMyRecipe.invalidate({ recipeId: id });
      void utils.mealPlan.getRecipe.invalidate({ recipeId: id });
    }
    router.back();
  };
  const createMutation = trpc.recipe.create.useMutation({ onSuccess: onDone });
  const updateMutation = trpc.recipe.update.useMutation({ onSuccess: onDone });
  const mutation = isEdit ? updateMutation : createMutation;

  const validIngredients = ingredients
    .filter((i) => i.name.trim() && parseQuantity(i.quantity) > 0 && i.unit.trim())
    .map((i) => ({
      name: i.name.trim(),
      quantity: parseQuantity(i.quantity),
      unit: i.unit.trim(),
    }));
  const validInstructions = instructions.map((s) => s.trim()).filter(Boolean);

  // D-19: name + >= 1 complete ingredient line is the whole minimum.
  const missing = recipeMissingFields({
    name,
    ingredients: ingredients.map((i) => ({ name: i.name, quantity: parseQuantity(i.quantity) })),
  });
  const canSave = missing.length === 0;
  const missingText = missingSummary(missing);

  const conflicts = tagConflicts(validIngredients, dietTags);

  const save = () => {
    if (!canSave || mutation.isPending) {
      return;
    }
    const payload = {
      name: name.trim(),
      description: description.trim(),
      ingredients: validIngredients,
      instructions: validInstructions,
      nutritionInfo: {
        calories: Math.round(parseQuantity(calories)),
        protein: parseQuantity(protein),
        carbs: parseQuantity(carbs),
        fat: parseQuantity(fat),
        // T-BUG-O3 C6: send the stored fiber back on edit; create keeps 0
        // (D-18a — no fiber input, but nothing already stored is destroyed).
        fiber: storedFiber,
        source: 'manual' as const,
      },
      cuisineType: cuisineType.trim(),
      dietaryTags: dietTags,
      prepTimeMins: Math.round(parseQuantity(prepTime)),
      cookTimeMins: Math.round(parseQuantity(cookTime)),
      servings: Math.max(1, Math.round(parseQuantity(servings)) || 1),
      imageUrl,
    };
    if (isEdit && id) {
      updateMutation.mutate({ recipeId: id, ...payload });
    } else {
      createMutation.mutate(payload);
    }
  };

  // T-BUG-O3 C5: a load error (deleted recipe, stale list) used to render a
  // blank "Edit Recipe" form with a disabled button — now an explicit state.
  if (isEdit && loadError) {
    return (
      <Screen edges={['top', 'bottom', 'left', 'right']}>
        <ErrorState
          title="Couldn't load your recipe"
          icon={<Ionicons name="cloud-offline-outline" size={40} color="#9ca3af" />}
          onRetry={() => void refetchExisting()}
        />
      </Screen>
    );
  }

  if (isEdit && (loadingExisting || !prefilled)) {
    return (
      <Screen edges={['top', 'bottom', 'left', 'right']} className="items-center justify-center">
        <ActivityIndicator size="large" color="#944a00" />
      </Screen>
    );
  }

  return (
    <Screen edges={['top', 'bottom', 'left', 'right']} className="px-0">
      <View className="flex-row items-center gap-3 px-4 py-3">
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Back"
          onPress={() => router.back()}
          className="h-11 w-11 items-center justify-center"
        >
          <Ionicons name="arrow-back" size={20} color="#1f2937" />
        </Pressable>
        <Text testID="recipe-form-title" variant="title">
          {isEdit ? 'Edit Recipe' : 'Create Recipe'}
        </Text>
      </View>

      <KeyboardAwareScrollView
        keyboardShouldPersistTaps="handled"
        contentContainerClassName="gap-4 px-4 pb-8"
      >
        <Field
          testID="rf-name"
          label="Name *"
          value={name}
          onChange={setName}
          placeholder="Grandma's lasagna"
        />
        <Field
          testID="rf-description"
          label="Description"
          value={description}
          onChange={setDescription}
          placeholder="What makes it special? (optional)"
          multiline
        />
        <View className="flex-row gap-2">
          <Field
            testID="rf-cuisine"
            label="Cuisine"
            value={cuisineType}
            onChange={setCuisineType}
            placeholder="Italian (optional)"
          />
          <Field
            testID="rf-servings"
            label="Servings"
            value={servings}
            onChange={setServings}
            numeric
          />
        </View>
        <View className="flex-row gap-2">
          <Field
            testID="rf-prep"
            label="Prep (min)"
            value={prepTime}
            onChange={setPrepTime}
            placeholder="optional"
            numeric
          />
          <Field
            testID="rf-cook"
            label="Cook (min)"
            value={cookTime}
            onChange={setCookTime}
            placeholder="optional"
            numeric
          />
        </View>

        {/* Diet tags (T-01.6, bug B-01) */}
        <Card className="gap-2">
          <Text variant="heading">Diet tags</Text>
          <ChipGroup
            testID="rf-diet-tags"
            multiple
            options={DIETARY_TAG_PRESETS.map((tag) => ({ value: tag, label: tag }))}
            value={dietTags}
            onChange={(v) => setDietTags(v)}
          />
          {conflicts.length > 0 && (
            <Text testID="rf-tag-conflict" className="text-xs text-amber-700">
              {conflicts.map((c) => `${c.ingredients.join(', ')} doesn't look ${c.tag}.`).join(' ')}
            </Text>
          )}
        </Card>

        {/* Ingredients */}
        <Card className="gap-2">
          <Text variant="heading">Ingredients *</Text>
          {ingredients.map((row, i) => (
            <View key={i} className="flex-row items-center gap-2">
              <TextInput
                testID={`rf-ingredient-qty-${i}`}
                value={row.quantity}
                onChangeText={(v) =>
                  setIngredients((prev) =>
                    prev.map((r, j) => (j === i ? { ...r, quantity: v } : r)),
                  )
                }
                placeholder="200 or ½"
                placeholderTextColor="#9ca3af"
                className="h-11 w-20 rounded-md border border-input bg-background px-2 text-center text-base text-foreground"
              />
              <TextInput
                value={row.unit}
                onChangeText={(v) =>
                  setIngredients((prev) => prev.map((r, j) => (j === i ? { ...r, unit: v } : r)))
                }
                placeholder="g"
                placeholderTextColor="#9ca3af"
                className="h-11 w-14 rounded-md border border-input bg-background px-2 text-center text-base text-foreground"
              />
              <TextInput
                value={row.name}
                onChangeText={(v) =>
                  setIngredients((prev) => prev.map((r, j) => (j === i ? { ...r, name: v } : r)))
                }
                placeholder="flour"
                placeholderTextColor="#9ca3af"
                className="h-11 flex-1 rounded-md border border-input bg-background px-3 text-base text-foreground"
              />
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Remove ingredient"
                disabled={ingredients.length === 1}
                onPress={() => setIngredients((prev) => prev.filter((_, j) => j !== i))}
                className="h-11 w-11 items-center justify-center"
              >
                <Ionicons name="close" size={16} color="#9ca3af" />
              </Pressable>
            </View>
          ))}
          <Button
            testID="rf-add-ingredient"
            variant="outline"
            onPress={() =>
              setIngredients((prev) => [...prev, { name: '', quantity: '', unit: 'g' }])
            }
          >
            Add ingredient
          </Button>
        </Card>

        {/* Instructions — optional (T-40.4 D-19: "No steps yet" is a valid recipe) */}
        <Card className="gap-2">
          <Text variant="heading">Instructions</Text>
          {instructions.map((step, i) => (
            <View key={i} className="flex-row items-start gap-2">
              <View className="mt-2 h-6 w-6 items-center justify-center rounded-full bg-primary">
                <Text className="text-xs font-bold text-primary-foreground">{i + 1}</Text>
              </View>
              <TextInput
                value={step}
                onChangeText={(v) =>
                  setInstructions((prev) => prev.map((s, j) => (j === i ? v : s)))
                }
                multiline
                placeholder="Describe this step… (optional)"
                placeholderTextColor="#9ca3af"
                className="min-h-11 flex-1 rounded-md border border-input bg-background px-3 py-2 text-base text-foreground"
              />
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Remove step"
                disabled={instructions.length === 1}
                onPress={() => setInstructions((prev) => prev.filter((_, j) => j !== i))}
                className="mt-1 h-11 w-9 items-center justify-center"
              >
                <Ionicons name="close" size={16} color="#9ca3af" />
              </Pressable>
            </View>
          ))}
          <Button
            testID="rf-add-step"
            variant="outline"
            onPress={() => setInstructions((prev) => [...prev, ''])}
          >
            Add step
          </Button>
        </Card>

        {/* Photo */}
        <Card className="gap-2">
          <Text variant="heading">Photo</Text>
          {imageUrl ? (
            <View className="gap-2">
              <Image
                source={{ uri: imageUrl }}
                className="h-40 w-full rounded-xl"
                resizeMode="cover"
              />
              <Button variant="outline" onPress={() => setImageUrl('')}>
                Remove photo
              </Button>
            </View>
          ) : (
            <Button
              testID="rf-photo"
              variant="outline"
              loading={uploading}
              onPress={() => void pickPhoto()}
            >
              <View className="flex-row items-center gap-1.5">
                <Ionicons name="image-outline" size={16} color="#944a00" />
                <Text className="text-sm font-medium text-primary">Add a photo (optional)</Text>
              </View>
            </Button>
          )}
          {uploadError && <Text className="text-xs text-red-600">{uploadError}</Text>}
        </Card>

        {/* Nutrition per serving — optional (D-18: no fiber field) */}
        <Card className="gap-2">
          <Text variant="heading">
            Nutrition{' '}
            <Text variant="muted" className="text-xs">
              per serving (optional)
            </Text>
          </Text>
          <View className="flex-row gap-2">
            <Field testID="rf-kcal" label="kcal" value={calories} onChange={setCalories} numeric />
            <Field
              testID="rf-protein"
              label="Protein g"
              value={protein}
              onChange={setProtein}
              numeric
            />
            <Field testID="rf-carbs" label="Carbs g" value={carbs} onChange={setCarbs} numeric />
            <Field testID="rf-fat" label="Fat g" value={fat} onChange={setFat} numeric />
          </View>
        </Card>

        {mutation.isError && (
          <Card testID="rf-save-error" className="border-red-200 bg-red-50">
            <Text className="text-sm text-red-600">
              {friendlySaveError(mutation.error.message)}
            </Text>
          </Card>
        )}

        {/* PAT-17-lite: the button is never silently disabled — a blocked
            save always shows why right underneath it. */}
        <Button testID="rf-save" loading={mutation.isPending} onPress={save}>
          {isEdit ? 'Save changes' : 'Create recipe'}
        </Button>
        {missingText && (
          <Text testID="rf-missing" variant="muted" className="-mt-2 text-center text-xs">
            {missingText}
          </Text>
        )}
      </KeyboardAwareScrollView>
    </Screen>
  );
}
