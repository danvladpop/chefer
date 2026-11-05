'use client';

import { useState } from 'react';
import { useT } from '@/lib/i18n';
import type { MessageKey } from '@chefer/i18n';
import {
  PACKAGED_PRODUCT_LIMITS,
  type NutritionLabelDraft,
  type PackagedProductDraft,
} from '@chefer/types';
import {
  parseProductForm,
  PRODUCT_ALLERGEN_PICKS,
  PRODUCT_FORM_FIELDS,
  productFormFromDraft,
  type ProductFormInput,
} from '@chefer/utils';
import { chipClass } from './ProductCard';

// Web counterpart of mobile's products/product-form.tsx (ADR 0006): manual
// entry and the label-scan review, per 100 g, blank = not on the pack,
// allergens "unknown" until ticked or "None listed". Parsing is shared.

export interface ProductFormProps {
  initial: NutritionLabelDraft['draft'];
  scan?: Pick<NutritionLabelDraft, 'notes' | 'confidence'> | undefined;
  saving: boolean;
  error: string | null;
  onSave: (draft: PackagedProductDraft, edited: boolean) => void;
  onCancel: () => void;
}

// `parseProductForm` (shared) says what to fix in English; the form shows the
// same sentence in the UI language.
const FORM_ERRORS = {
  'Enter the calories per 100 g from the pack.': 'tracker.productForm.errors.caloriesMissing',
  'Give the product a name.': 'tracker.productForm.errors.name',
  'Check the numbers: each is per 100 g, and 100 g can’t hold more than 100 g of anything.':
    'tracker.productForm.errors.numbers',
  'Check the product details.': 'tracker.productForm.errors.details',
} as const satisfies Record<string, MessageKey>;

const inputClass =
  'min-h-11 w-full min-w-0 rounded-xl border border-neutral-200 px-3 text-sm text-neutral-900';

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

  const shownError = formError ?? error;

  return (
    <div data-testid="product-form" className="space-y-3">
      {scan && (
        <div className="space-y-1 rounded-lg bg-neutral-50 p-3">
          <p className="text-sm font-medium text-neutral-800">
            {t('tracker.packaged.labelDraftHint')}
          </p>
          {scan.notes.map((note) => (
            <p key={note} className="text-xs text-neutral-600">
              {note}
            </p>
          ))}
          {scan.confidence !== 'high' && (
            <p className="text-xs text-amber-700">{t('tracker.productForm.hardToRead')}</p>
          )}
        </div>
      )}
      {form.barcode && (
        <p className="text-xs text-neutral-500">
          {t('tracker.productForm.barcode', { barcode: form.barcode })}
        </p>
      )}

      <label className="flex flex-col gap-1 text-xs font-medium text-neutral-600">
        {t('tracker.productForm.name')}
        <input
          type="text"
          data-testid="product-form-name"
          value={form.name}
          maxLength={PACKAGED_PRODUCT_LIMITS.nameMaxLength}
          placeholder={t('tracker.productForm.namePlaceholder')}
          onChange={(e) => update({ name: e.target.value })}
          className={inputClass}
        />
      </label>
      <label className="flex flex-col gap-1 text-xs font-medium text-neutral-600">
        {t('tracker.productForm.brand')}
        <input
          type="text"
          data-testid="product-form-brand"
          value={form.brand}
          maxLength={PACKAGED_PRODUCT_LIMITS.brandMaxLength}
          onChange={(e) => update({ brand: e.target.value })}
          className={inputClass}
        />
      </label>

      <p className="text-xs font-semibold uppercase tracking-widest text-neutral-500">
        {t('tracker.productForm.per100g')}
      </p>
      <div className="grid grid-cols-2 gap-2">
        {PRODUCT_FORM_FIELDS.map(({ key, unit, required }) => (
          <label
            key={key}
            className="flex min-w-0 flex-col gap-1 text-xs font-medium text-neutral-600"
          >
            {t(required ? 'tracker.productForm.fieldRequired' : 'tracker.productForm.field', {
              label: t(`tracker.productForm.fields.${key}`),
              unit,
            })}
            <input
              type="text"
              inputMode="decimal"
              data-testid={`product-form-${key}`}
              value={form.numbers[key]}
              placeholder="–"
              onChange={(e) => update({ numbers: { ...form.numbers, [key]: e.target.value } })}
              className={inputClass}
            />
          </label>
        ))}
      </div>
      <label className="flex flex-col gap-1 text-xs font-medium text-neutral-600">
        {t('tracker.productForm.serving')}
        <input
          type="text"
          inputMode="decimal"
          data-testid="product-form-serving"
          value={form.serving}
          placeholder="–"
          onChange={(e) => update({ serving: e.target.value })}
          className={inputClass}
        />
      </label>

      <fieldset className="space-y-1.5">
        <legend className="text-xs font-medium text-neutral-600">
          {t('tracker.productForm.contains')}
        </legend>
        <div className="flex flex-wrap gap-1.5">
          {PRODUCT_ALLERGEN_PICKS.map(({ id, label }) => (
            <button
              key={id}
              type="button"
              data-testid={`product-form-allergen-${id}`}
              aria-pressed={form.contains.includes(id)}
              onClick={() =>
                update({
                  noneListed: false,
                  contains: form.contains.includes(id)
                    ? form.contains.filter((a) => a !== id)
                    : [...form.contains, id],
                })
              }
              className={chipClass(form.contains.includes(id))}
            >
              {label}
            </button>
          ))}
          <button
            type="button"
            data-testid="product-form-allergen-none"
            aria-pressed={form.noneListed}
            onClick={() => update({ noneListed: !form.noneListed, contains: [] })}
            className={chipClass(form.noneListed)}
          >
            {t('tracker.productForm.noneListed')}
          </button>
        </div>
        {!form.noneListed && form.contains.length === 0 && (
          <p className="text-xs text-neutral-500">{t('tracker.packaged.allergensUnknown')}</p>
        )}
      </fieldset>

      {shownError && (
        <p data-testid="product-form-error" role="alert" className="text-sm text-red-600">
          {shownError}
        </p>
      )}
      <div className="flex gap-2">
        <button
          type="button"
          onClick={onCancel}
          className="min-h-11 flex-1 rounded-xl border border-neutral-200 px-4 text-sm font-semibold text-neutral-700 hover:bg-neutral-50"
        >
          {t('tracker.productForm.cancel')}
        </button>
        <button
          type="button"
          data-testid="product-form-save"
          disabled={saving}
          onClick={submit}
          className="min-h-11 flex-1 rounded-xl bg-[#944a00] px-4 text-sm font-semibold text-white hover:bg-[#7a3d00] disabled:opacity-50"
        >
          {saving ? t('tracker.productForm.saving') : t('tracker.productForm.save')}
        </button>
      </div>
    </div>
  );
}
