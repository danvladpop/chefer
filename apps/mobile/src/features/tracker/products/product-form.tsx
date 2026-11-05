import { useState } from 'react';
import { View } from 'react-native';
import type { MessageKey } from '@chefer/i18n';
import {
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
import { useT } from '../../../lib/i18n';

// "Enter it yourself" (free) and the label-scan review (premium) share this
// form (ADR 0006). Everything is per 100 g, calories are the one required
// number, a blank field means "not on the pack" (stored as unknown, never 0),
// and allergens stay "unknown" until the user ticks some or says none are
// listed. Parsing is shared with web (`parseProductForm`).

// `parseProductForm` (shared) says what to fix in English; the form shows the
// same sentence in the UI language.
const FORM_ERRORS = {
  'Enter the calories per 100 g from the pack.': 'tracker.productForm.errors.caloriesMissing',
  'Give the product a name.': 'tracker.productForm.errors.name',
  'Check the numbers: each is per 100 g, and 100 g can’t hold more than 100 g of anything.':
    'tracker.productForm.errors.numbers',
  'Check the product details.': 'tracker.productForm.errors.details',
} as const satisfies Record<string, MessageKey>;

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
  const { t } = useT();
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
      const key = FORM_ERRORS[result.error as keyof typeof FORM_ERRORS] as
        | (typeof FORM_ERRORS)[keyof typeof FORM_ERRORS]
        | undefined;
      setFormError(key ? t(key) : result.error);
      return;
    }
    onSave(result.draft, edited);
  };

  return (
    <View testID="product-form" className="gap-3">
      {scan && (
        <View className="gap-1 rounded-lg bg-muted p-3">
          <Text className="text-sm font-medium text-label">
            {t('tracker.packaged.labelDraftHint')}
          </Text>
          {scan.notes.map((note) => (
            <Text key={note} className="text-xs text-label-secondary">
              {note}
            </Text>
          ))}
          {scan.confidence !== 'high' && (
            <Text className="text-xs text-attention">{t('tracker.productForm.hardToRead')}</Text>
          )}
        </View>
      )}
      {form.barcode && (
        <Text className="text-xs text-label-secondary">
          {t('tracker.productForm.barcode', { barcode: form.barcode })}
        </Text>
      )}

      <View className="gap-1">
        <Text className="text-xs font-medium text-label-secondary">
          {t('tracker.productForm.name')}
        </Text>
        <Input
          testID="product-form-name"
          accessibilityLabel={t('tracker.productForm.name')}
          value={form.name}
          maxLength={PACKAGED_PRODUCT_LIMITS.nameMaxLength}
          placeholder={t('tracker.productForm.namePlaceholder')}
          onChangeText={(name) => update({ name })}
          {...DONE_FIELD_PROPS}
        />
      </View>
      <View className="gap-1">
        <Text className="text-xs font-medium text-label-secondary">
          {t('tracker.productForm.brand')}
        </Text>
        <Input
          testID="product-form-brand"
          accessibilityLabel={t('tracker.productForm.brandLabel')}
          value={form.brand}
          maxLength={PACKAGED_PRODUCT_LIMITS.brandMaxLength}
          onChangeText={(brand) => update({ brand })}
          {...DONE_FIELD_PROPS}
        />
      </View>

      <Text className="text-xs font-semibold uppercase tracking-widest text-label-secondary">
        {t('tracker.productForm.per100g')}
      </Text>
      <View className="flex-row flex-wrap gap-2">
        {PRODUCT_FORM_FIELDS.map(({ key, unit, required }) => {
          const label = t(`tracker.productForm.fields.${key}`);
          return (
            <View key={key} className="min-w-0 basis-[47%] gap-1">
              <Text className="text-xs font-medium text-label-secondary">
                {t(required ? 'tracker.productForm.fieldRequired' : 'tracker.productForm.field', {
                  label,
                  unit,
                })}
              </Text>
              <Input
                testID={`product-form-${key}`}
                accessibilityLabel={t('tracker.productForm.fieldPer100g', { label })}
                value={form.numbers[key]}
                keyboardType="decimal-pad"
                placeholder="–"
                onChangeText={(text) => update({ numbers: { ...form.numbers, [key]: text } })}
                {...DONE_FIELD_PROPS}
              />
            </View>
          );
        })}
      </View>
      <View className="gap-1">
        <Text className="text-xs font-medium text-label-secondary">
          {t('tracker.productForm.serving')}
        </Text>
        <Input
          testID="product-form-serving"
          accessibilityLabel={t('tracker.productForm.servingLabel')}
          value={form.serving}
          keyboardType="decimal-pad"
          placeholder="–"
          onChangeText={(serving) => update({ serving })}
          {...DONE_FIELD_PROPS}
        />
      </View>

      <View className="gap-1.5">
        <Text className="text-xs font-medium text-label-secondary">
          {t('tracker.productForm.contains')}
        </Text>
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
            label={t('tracker.productForm.noneListed')}
            selected={form.noneListed}
            onPress={() => update({ noneListed: !form.noneListed, contains: [] })}
          />
        </View>
        {!form.noneListed && form.contains.length === 0 && (
          <Text className="text-xs text-label-secondary">
            {t('tracker.packaged.allergensUnknown')}
          </Text>
        )}
      </View>

      {(formError ?? error) && (
        <Text
          testID="product-form-error"
          accessibilityLiveRegion="polite"
          className="text-sm text-danger"
        >
          {formError ?? error}
        </Text>
      )}
      <View className="flex-row gap-2">
        <Button variant="outline" className="flex-1" onPress={onCancel}>
          {t('tracker.productForm.cancel')}
        </Button>
        <Button testID="product-form-save" className="flex-1" loading={saving} onPress={submit}>
          {t('tracker.productForm.save')}
        </Button>
      </View>
    </View>
  );
}
