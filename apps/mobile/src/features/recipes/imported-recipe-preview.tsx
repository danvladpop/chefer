import { Image, View } from 'react-native';
import { Card, Text } from '@chefer/ui-mobile';
import { formatFractionalQuantity } from '@chefer/utils';

// The full imported recipe, read-only, shown under the Original / Cheferized
// cards before Save (owner dogfood 2026-09-30): the summary cards alone gave
// no way to check the extraction — every ingredient and step is here, so a
// bad import is caught before it lands in the cookbook.

export interface ImportedRecipe {
  name: string;
  description: string;
  servings: number;
  prepTimeMins: number;
  cookTimeMins: number;
  ingredients: { name: string; quantity: number; unit: string }[];
  instructions: string[];
  nutritionInfo: { calories: number; protein: number; carbs: number; fat: number };
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <View className="min-w-0 flex-1 items-center rounded-lg bg-muted px-1 py-2">
      <Text className="text-xs text-muted-foreground">{label}</Text>
      <Text className="text-sm font-semibold">{value}</Text>
    </View>
  );
}

export function ImportedRecipePreview({
  recipe,
  label,
  imageUrl,
}: {
  recipe: ImportedRecipe;
  /** Which version this is, e.g. "Cheferized for you". */
  label: string;
  imageUrl?: string | null | undefined;
}) {
  const n = recipe.nutritionInfo;
  const times = [
    recipe.prepTimeMins > 0 ? `Prep ${recipe.prepTimeMins}m` : null,
    recipe.cookTimeMins > 0 ? `Cook ${recipe.cookTimeMins}m` : null,
    `${recipe.servings} serving${recipe.servings === 1 ? '' : 's'}`,
  ].filter((t): t is string => t !== null);

  return (
    <Card testID="import-full-preview" className="gap-3">
      <View className="gap-1">
        <Text className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
          Preview · {label}
        </Text>
        {imageUrl ? (
          <Image
            source={{ uri: imageUrl }}
            accessibilityLabel={recipe.name}
            className="mt-1 h-40 w-full rounded-lg"
            resizeMode="cover"
          />
        ) : null}
        <Text testID="import-full-preview-name" variant="heading">
          {recipe.name}
        </Text>
        <Text variant="muted" className="text-sm">
          {recipe.description}
        </Text>
        <Text variant="muted" className="text-xs">
          {times.join(' · ')}
        </Text>
      </View>

      <View className="flex-row gap-2">
        <Stat label="kcal" value={String(Math.round(n.calories))} />
        <Stat label="Protein" value={`${Math.round(n.protein)}g`} />
        <Stat label="Carbs" value={`${Math.round(n.carbs)}g`} />
        <Stat label="Fat" value={`${Math.round(n.fat)}g`} />
      </View>

      <View className="gap-1">
        <Text variant="label">Ingredients ({recipe.ingredients.length})</Text>
        {recipe.ingredients.map((ing, i) => (
          <Text
            key={`${ing.name}-${i}`}
            testID={`import-full-preview-ingredient-${i}`}
            className="text-sm"
          >
            <Text className="font-semibold">
              {formatFractionalQuantity(ing.quantity)} {ing.unit}
            </Text>{' '}
            {ing.name}
          </Text>
        ))}
      </View>

      <View className="gap-2">
        <Text variant="label">Steps ({recipe.instructions.length})</Text>
        {recipe.instructions.map((step, i) => (
          <View key={i} className="flex-row gap-2">
            <Text className="w-5 text-sm font-semibold text-primary">{i + 1}.</Text>
            <Text className="min-w-0 flex-1 text-sm">{step}</Text>
          </View>
        ))}
      </View>

      <Text variant="muted" className="text-xs">
        Something off? Start over, or save it and fix it with Edit on the recipe.
      </Text>
    </Card>
  );
}
