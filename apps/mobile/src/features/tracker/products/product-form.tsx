import { useState } from 'react';
import { View } from 'react-native';
import { Button, Chip, DONE_FIELD_PROPS, Input, Text } from '@chefer/ui-mobile';
import {
  findSafetyTaxonomyEntry,
  PACKAGED_PRODUCT_COPY,
  PACKAGED_PRODUCT_LIMITS,
  packagedProductDraftSchema,
  PRODUCT_ALLERGEN_IDS,
  type NutritionLabelDraft,
  type PackagedProductDraft,
} from '@chefer/types';

// "Enter it yourself" (free) and the label-scan review (premium) share this
// form (ADR 0002). Everything is per 100 g, calories are the one required
// number, a blank field means "not on the pack" (stored as unknown, never 0),
// and allergens stay "unknown" until the user ticks some or says none are
// listed.

type NumberKey = keyof PackagedProductDraft['per100g'];

const NUMBER_FIELDS: { key: NumberKey; label: string; unit: string }[] = [
  { key: 'kcal', label: 'Calories', unit: 'kcal' },
  { key: 'protein', label: 'Protein', unit: 'g' },
  { key: 'carbs', label: 'Carbs', unit: 'g' },
  { key: 'fat', label: 'Fat', unit: 'g' },
  { key: 'fiber', label: 'Fibre', unit: 'g' },
  { key: 'sugar', label: 'of which sugars', unit: 'g' },
  { key: 'saturatedFat', label: 'of which saturates', unit: 'g' },
  { key: 'salt', label: 'Salt', unit: 'g' },
];

/** Allergens offered as new picks (legacy Shellfish stays out: Crustaceans and Molluscs cover it). */
const ALLERGEN_PICKS = PRODUCT_ALLERGEN_IDS.filter(
  (id) => !findSafetyTaxonomyEntry(id)?.hiddenForNewPicks,
);

const numberText = (n: number | null): string => (n === null ? '' : String(n));
const parseOptional = (text: string): number | null => {
  const trimmed = text.trim().replace(',', '.');
  if (trimmed === '') return null;
  const n = Number(trimmed);
  return Number.isFinite(n) ? n : Number.NaN;
};

export interface ProductFormProps {
  /** Pre-filled from a label scan, an incomplete product, or just the barcode. */
  initial: NutritionLabelDraft['draft'];
  /** Label-scan notes ("converted from per serving…") and confidence; absent for manual entry. */
  scan?: Pick<NutritionLabelDraft, 'notes' | 'confidence'> | undefined;
  saving: boolean;
  error: string | null;
  onSave: (draft: PackagedProductDraft, edited: boolean) => void;
  onCancel: () => void;
}

export function ProductForm({ initial, scan, saving, error, onSave, onCancel }: ProductFormProps) {
  const [name, setName] = useState(initial.name);
  const [brand, setBrand] = useState(initial.brand ?? '');
  const [numbers, setNumbers] = useState<Record<NumberKey, string>>(() => {
    const out = {} as Record<NumberKey, string>;
    for (const { key } of NUMBER_FIELDS) out[key] = numberText(initial.per100g[key]);
    return out;
  });
  const [serving, setServing] = useState(numberText(initial.servingSizeG));
  const [contains, setContains] = useState<string[]>(initial.allergens.contains);
  const [noneListed, setNoneListed] = useState(
    initial.allergens.known && initial.allergens.contains.length === 0,
  );
  const [edited, setEdited] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const touch = () => {
    setEdited(true);
    setFormError(null);
  };

  const toggleAllergen = (id: string) => {
    touch();
    setNoneListed(false);
    setContains((prev) => (prev.includes(id) ? prev.filter((a) => a !== id) : [...prev, id]));
  };

  const submit = () => {
    const per100g = {} as Record<NumberKey, number | null>;
    for (const { key } of NUMBER_FIELDS) per100g[key] = parseOptional(numbers[key]);
    if (per100g.kcal === null) {
      setFormError('Enter the calories per 100 g from the pack.');
      return;
    }
    const parsed = packagedProductDraftSchema.safeParse({
      barcode: initial.barcode,
      name,
      brand: brand.trim() === '' ? null : brand,
      per100g,
      servingSizeG: parseOptional(serving),
      allergens: { known: noneListed || contains.length > 0, contains },
    });
    if (!parsed.success) {
      const issue = parsed.error.issues[0];
      const field = issue?.path.join('.') ?? '';
      setFormError(
        field === 'name'
          ? 'Give the product a name.'
          : field.startsWith('per100g') || field === 'servingSizeG'
            ? 'Check the numbers: each is per 100 g, and 100 g can’t hold more than 100 g of anything.'
            : 'Check the product details.',
      );
      return;
    }
    onSave(parsed.data, edited);
  };

  return (
    <View testID="product-form" className="gap-3">
      {scan && (
        <View className="gap-1 rounded-lg bg-muted p-3">
          <Text className="text-sm font-medium text-gray-800">
            {PACKAGED_PRODUCT_COPY.labelDraftHint}
          </Text>
          {scan.notes.map((note) => (
            <Text key={note} className="text-xs text-gray-600">
              {note}
            </Text>
          ))}
          {scan.confidence !== 'high' && (
            <Text className="text-xs text-amber-700">
              Some numbers were hard to read. Check them carefully.
            </Text>
          )}
        </View>
      )}
      {initial.barcode && (
        <Text className="text-xs text-gray-500">Barcode {initial.barcode}</Text>
      )}

      <View className="gap-1">
        <Text className="text-xs font-medium text-gray-600">Product name</Text>
        <Input
          testID="product-form-name"
          accessibilityLabel="Product name"
          value={name}
          maxLength={PACKAGED_PRODUCT_LIMITS.nameMaxLength}
          placeholder="e.g. Oat & honey biscuits"
          onChangeText={(text) => {
            setName(text);
            touch();
          }}
          {...DONE_FIELD_PROPS}
        />
      </View>
      <View className="gap-1">
        <Text className="text-xs font-medium text-gray-600">Brand (optional)</Text>
        <Input
          testID="product-form-brand"
          accessibilityLabel="Brand"
          value={brand}
          maxLength={PACKAGED_PRODUCT_LIMITS.brandMaxLength}
          onChangeText={(text) => {
            setBrand(text);
            touch();
          }}
          {...DONE_FIELD_PROPS}
        />
      </View>

      <Text className="text-xs font-semibold uppercase tracking-widest text-gray-500">
        Per 100 g (leave blank if not on the pack)
      </Text>
      <View className="flex-row flex-wrap gap-2">
        {NUMBER_FIELDS.map(({ key, label, unit }) => (
          <View key={key} className="min-w-0 basis-[47%] gap-1">
            <Text className="text-xs font-medium text-gray-600">
              {label} ({unit}){key === 'kcal' ? ' *' : ''}
            </Text>
            <Input
              testID={`product-form-${key}`}
              accessibilityLabel={`${label} per 100 grams`}
              value={numbers[key]}
              keyboardType="decimal-pad"
              placeholder="–"
              onChangeText={(text) => {
                setNumbers((prev) => ({ ...prev, [key]: text }));
                touch();
              }}
              {...DONE_FIELD_PROPS}
            />
          </View>
        ))}
      </View>
      <View className="gap-1">
        <Text className="text-xs font-medium text-gray-600">Serving size (g, optional)</Text>
        <Input
          testID="product-form-serving"
          accessibilityLabel="Serving size in grams"
          value={serving}
          keyboardType="decimal-pad"
          placeholder="–"
          onChangeText={(text) => {
            setServing(text);
            touch();
          }}
          {...DONE_FIELD_PROPS}
        />
      </View>

      <View className="gap-1.5">
        <Text className="text-xs font-medium text-gray-600">Contains (from the pack)</Text>
        <View className="flex-row flex-wrap gap-1.5">
          {ALLERGEN_PICKS.map((id) => (
            <Chip
              key={id}
              testID={`product-form-allergen-${id}`}
              label={findSafetyTaxonomyEntry(id)?.label ?? id}
              selected={contains.includes(id)}
              onPress={() => toggleAllergen(id)}
            />
          ))}
          <Chip
            testID="product-form-allergen-none"
            label="None listed"
            selected={noneListed}
            onPress={() => {
              touch();
              setNoneListed((prev) => !prev);
              setContains([]);
            }}
          />
        </View>
        {!noneListed && contains.length === 0 && (
          <Text className="text-xs text-gray-500">{PACKAGED_PRODUCT_COPY.allergensUnknown}</Text>
        )}
      </View>

      {(formError ?? error) && (
        <Text testID="product-form-error" accessibilityLiveRegion="polite" className="text-sm text-red-600">
          {formError ?? error}
        </Text>
      )}
      <View className="flex-row gap-2">
        <Button variant="outline" className="flex-1" onPress={onCancel}>
          Cancel
        </Button>
        <Button testID="product-form-save" className="flex-1" loading={saving} onPress={submit}>
          Save product
        </Button>
      </View>
    </View>
  );
}
