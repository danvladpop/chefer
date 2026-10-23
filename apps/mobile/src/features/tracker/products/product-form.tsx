import { useState } from 'react';
import { View } from 'react-native';
import {
  PACKAGED_PRODUCT_COPY,
  PACKAGED_PRODUCT_LIMITS,
  type NutritionLabelDraft,
  type PackagedProductDraft,
} from '@chefer/types';
import { Button, Chip, DONE_FIELD_PROPS, Input, Text } from '@chefer/ui-mobile';
import {
  parseProductForm,
  PRODUCT_ALLERGEN_PICKS,
  PRODUCT_FORM_FIELDS,
  productFormFromDraft,
  type ProductFormInput,
} from '@chefer/utils';

// "Enter it yourself" (free) and the label-scan review (premium) share this
// form (ADR 0002). Everything is per 100 g, calories are the one required
// number, a blank field means "not on the pack" (stored as unknown, never 0),
// and allergens stay "unknown" until the user ticks some or says none are
// listed. Parsing is shared with web (`parseProductForm`).

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
  const [form, setForm] = useState<ProductFormInput>(() => productFormFromDraft(initial));
  const [edited, setEdited] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const update = (patch: Partial<ProductFormInput>) => {
    setForm((prev) => ({ ...prev, ...patch }));
    setEdited(true);
    setFormError(null);
  };

  const toggleAllergen = (id: string) =>
    update({
      noneListed: false,
      contains: form.contains.includes(id)
        ? form.contains.filter((a) => a !== id)
        : [...form.contains, id],
    });

  const submit = () => {
    const result = parseProductForm(form);
    if (!result.ok) {
      setFormError(result.error);
      return;
    }
    onSave(result.draft, edited);
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
      {form.barcode && <Text className="text-xs text-gray-500">Barcode {form.barcode}</Text>}

      <View className="gap-1">
        <Text className="text-xs font-medium text-gray-600">Product name</Text>
        <Input
          testID="product-form-name"
          accessibilityLabel="Product name"
          value={form.name}
          maxLength={PACKAGED_PRODUCT_LIMITS.nameMaxLength}
          placeholder="e.g. Oat & honey biscuits"
          onChangeText={(name) => update({ name })}
          {...DONE_FIELD_PROPS}
        />
      </View>
      <View className="gap-1">
        <Text className="text-xs font-medium text-gray-600">Brand (optional)</Text>
        <Input
          testID="product-form-brand"
          accessibilityLabel="Brand"
          value={form.brand}
          maxLength={PACKAGED_PRODUCT_LIMITS.brandMaxLength}
          onChangeText={(brand) => update({ brand })}
          {...DONE_FIELD_PROPS}
        />
      </View>

      <Text className="text-xs font-semibold uppercase tracking-widest text-gray-500">
        Per 100 g (leave blank if not on the pack)
      </Text>
      <View className="flex-row flex-wrap gap-2">
        {PRODUCT_FORM_FIELDS.map(({ key, label, unit }) => (
          <View key={key} className="min-w-0 basis-[47%] gap-1">
            <Text className="text-xs font-medium text-gray-600">
              {label} ({unit}){key === 'kcal' ? ' *' : ''}
            </Text>
            <Input
              testID={`product-form-${key}`}
              accessibilityLabel={`${label} per 100 grams`}
              value={form.numbers[key]}
              keyboardType="decimal-pad"
              placeholder="–"
              onChangeText={(text) => update({ numbers: { ...form.numbers, [key]: text } })}
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
          value={form.serving}
          keyboardType="decimal-pad"
          placeholder="–"
          onChangeText={(serving) => update({ serving })}
          {...DONE_FIELD_PROPS}
        />
      </View>

      <View className="gap-1.5">
        <Text className="text-xs font-medium text-gray-600">Contains (from the pack)</Text>
        <View className="flex-row flex-wrap gap-1.5">
          {PRODUCT_ALLERGEN_PICKS.map(({ id, label }) => (
            <Chip
              key={id}
              testID={`product-form-allergen-${id}`}
              label={label}
              selected={form.contains.includes(id)}
              onPress={() => toggleAllergen(id)}
            />
          ))}
          <Chip
            testID="product-form-allergen-none"
            label="None listed"
            selected={form.noneListed}
            onPress={() => update({ noneListed: !form.noneListed, contains: [] })}
          />
        </View>
        {!form.noneListed && form.contains.length === 0 && (
          <Text className="text-xs text-gray-500">{PACKAGED_PRODUCT_COPY.allergensUnknown}</Text>
        )}
      </View>

      {(formError ?? error) && (
        <Text
          testID="product-form-error"
          accessibilityLiveRegion="polite"
          className="text-sm text-red-600"
        >
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
