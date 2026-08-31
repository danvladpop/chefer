import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, TextInput, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import { Button, Card, Screen, Text } from '@chefer/ui-mobile';
import { trpc } from '../src/lib/trpc';

// Manual recipe create/edit — port of web /recipes/new and /recipes/[id]/edit
// (wave-2b). One screen: with ?id= it prefills from getMyRecipe and updates,
// otherwise it creates.

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

const num = (raw: string): number => {
  const n = parseFloat(raw.replace(',', '.'));
  return Number.isFinite(n) && n >= 0 ? n : 0;
};

export default function RecipeFormScreen() {
  const { id } = useLocalSearchParams<{ id?: string }>();
  const isEdit = typeof id === 'string' && id.length > 0;
  const utils = trpc.useUtils();

  const { data: existing, isLoading: loadingExisting } = trpc.recipe.getMyRecipe.useQuery(
    { recipeId: id ?? '' },
    { enabled: isEdit },
  );

  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [cuisineType, setCuisineType] = useState('');
  const [prepTime, setPrepTime] = useState('10');
  const [cookTime, setCookTime] = useState('20');
  const [servings, setServings] = useState('2');
  const [calories, setCalories] = useState('');
  const [protein, setProtein] = useState('');
  const [carbs, setCarbs] = useState('');
  const [fat, setFat] = useState('');
  const [ingredients, setIngredients] = useState<IngredientRow[]>([
    { name: '', quantity: '', unit: 'g' },
  ]);
  const [instructions, setInstructions] = useState<string[]>(['']);
  const [prefilled, setPrefilled] = useState(false);

  useEffect(() => {
    if (!existing || prefilled) {
      return;
    }
    setName(existing.name);
    setDescription(existing.description);
    setCuisineType(existing.cuisineType);
    setPrepTime(String(existing.prepTimeMins));
    setCookTime(String(existing.cookTimeMins));
    setServings(String(existing.servings));
    // Prisma stores nutritionInfo as JSON — same narrowing cast the web list uses.
    const n = (existing.nutritionInfo ?? {}) as {
      calories?: number;
      protein?: number;
      carbs?: number;
      fat?: number;
    };
    setCalories(String(n.calories ?? ''));
    setProtein(String(n.protein ?? ''));
    setCarbs(String(n.carbs ?? ''));
    setFat(String(n.fat ?? ''));
    const ings = (existing.ingredients ?? []) as { name: string; quantity: number; unit: string }[];
    setIngredients(
      ings.map((i) => ({
        name: i.name,
        quantity: String(i.quantity),
        unit: i.unit,
      })),
    );
    setInstructions([...existing.instructions]);
    setPrefilled(true);
  }, [existing, prefilled]);

  const onDone = () => {
    void utils.recipe.list.invalidate();
    router.back();
  };
  const createMutation = trpc.recipe.create.useMutation({ onSuccess: onDone });
  const updateMutation = trpc.recipe.update.useMutation({ onSuccess: onDone });
  const mutation = isEdit ? updateMutation : createMutation;

  const validIngredients = ingredients
    .filter((i) => i.name.trim() && num(i.quantity) > 0 && i.unit.trim())
    .map((i) => ({ name: i.name.trim(), quantity: num(i.quantity), unit: i.unit.trim() }));
  const validInstructions = instructions.map((s) => s.trim()).filter(Boolean);
  const canSave =
    name.trim() &&
    description.trim() &&
    cuisineType.trim() &&
    validIngredients.length > 0 &&
    validInstructions.length > 0 &&
    num(servings) >= 1;

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
        calories: Math.round(num(calories)),
        protein: num(protein),
        carbs: num(carbs),
        fat: num(fat),
        fiber: 0,
      },
      cuisineType: cuisineType.trim(),
      dietaryTags: [],
      prepTimeMins: Math.round(num(prepTime)),
      cookTimeMins: Math.round(num(cookTime)),
      servings: Math.round(num(servings)),
    };
    if (isEdit && id) {
      updateMutation.mutate({ recipeId: id, ...payload });
    } else {
      createMutation.mutate(payload);
    }
  };

  if (isEdit && loadingExisting) {
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

      <ScrollView contentContainerClassName="gap-4 px-4 pb-8">
        <Field
          testID="rf-name"
          label="Name"
          value={name}
          onChange={setName}
          placeholder="Grandma's lasagna"
        />
        <Field
          testID="rf-description"
          label="Description"
          value={description}
          onChange={setDescription}
          placeholder="What makes it special?"
          multiline
        />
        <View className="flex-row gap-2">
          <Field
            testID="rf-cuisine"
            label="Cuisine"
            value={cuisineType}
            onChange={setCuisineType}
            placeholder="Italian"
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
            numeric
          />
          <Field
            testID="rf-cook"
            label="Cook (min)"
            value={cookTime}
            onChange={setCookTime}
            numeric
          />
        </View>

        {/* Ingredients */}
        <Card className="gap-2">
          <Text variant="heading">Ingredients</Text>
          {ingredients.map((row, i) => (
            <View key={i} className="flex-row items-center gap-2">
              <TextInput
                value={row.quantity}
                onChangeText={(v) =>
                  setIngredients((prev) =>
                    prev.map((r, j) => (j === i ? { ...r, quantity: v } : r)),
                  )
                }
                keyboardType="decimal-pad"
                placeholder="200"
                placeholderTextColor="#9ca3af"
                className="h-11 w-16 rounded-md border border-input bg-background px-2 text-center text-base text-foreground"
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
                className="h-11 w-9 items-center justify-center"
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

        {/* Instructions */}
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
                placeholder="Describe this step…"
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

        {/* Nutrition per serving */}
        <Card className="gap-2">
          <Text variant="heading">
            Nutrition{' '}
            <Text variant="muted" className="text-xs">
              per serving
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
          <Card className="border-red-200 bg-red-50">
            <Text className="text-sm text-red-600">{mutation.error.message}</Text>
          </Card>
        )}

        <Button testID="rf-save" loading={mutation.isPending} disabled={!canSave} onPress={save}>
          {isEdit ? 'Save changes' : 'Create recipe'}
        </Button>
      </ScrollView>
    </Screen>
  );
}
