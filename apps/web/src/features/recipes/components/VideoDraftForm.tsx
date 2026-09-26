'use client';

import { useState } from 'react';
import type { RouterOutputs } from '@/lib/trpc';
import { AlertTriangle, Info, Plus, X } from 'lucide-react';
import { VIDEO_IMPORT_COPY, type VideoDraftField } from '@chefer/types';
import {
  cn,
  finalizeVideoDraft,
  videoDraftProblems,
  videoDraftToForm,
  videoFormToDraft,
  type VideoDraftFormValues,
} from '@chefer/utils';
import { Field, inputCls } from './recipe-form-fields';

// ─── Video import review form ────────────────────────────────────────────────
// The owner's flow (2026-09-26): the AI reads the video's words into a draft,
// the user corrects it and fills what the video did not say, then saves. Every
// field is editable; fields the words did not cover carry a "not found"
// badge until the user fills them. Validation is the shared
// videoDraftProblems, so web, mobile and importSave agree.

export type VideoImportPreviewData = RouterOutputs['recipe']['importVideoPreview'];
export type VideoDraftRecipe = VideoImportPreviewData['draft'];

function Badge({ tone, children }: { tone: 'missing' | 'check'; children: string }) {
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium',
        tone === 'missing' ? 'bg-red-50 text-red-700' : 'bg-amber-50 text-amber-800',
      )}
    >
      {children}
    </span>
  );
}

export function VideoDraftForm({
  preview,
  saving,
  saveError,
  onBack,
  onSave,
}: {
  preview: VideoImportPreviewData;
  saving: boolean;
  saveError: string | null;
  onBack: () => void;
  onSave: (recipe: VideoDraftRecipe) => void;
}) {
  const [form, setForm] = useState<VideoDraftFormValues>(() => videoDraftToForm(preview.draft));
  // Servings and time are pre-filled with the model's guess: their badge
  // stays until the user has looked at (edited) the field.
  const [touched, setTouched] = useState<Partial<Record<VideoDraftField, boolean>>>({});
  const [problems, setProblems] = useState<string[]>([]);
  // Per-row "amount not heard" flags; they follow rows as rows are removed,
  // and clear once the user edits that amount.
  const [unheard, setUnheard] = useState<boolean[]>(() =>
    preview.draft.ingredients.map((_, i) => preview.unverifiedQuantities.includes(i)),
  );

  const flagged = (field: VideoDraftField) => preview.notFound.includes(field);
  const update = (patch: Partial<VideoDraftFormValues>, field?: VideoDraftField) => {
    setForm((f) => ({ ...f, ...patch }));
    if (field) setTouched((t) => ({ ...t, [field]: true }));
    setProblems([]);
  };
  const setIngredient = (index: number, patch: Partial<VideoDraftFormValues['ingredients'][0]>) => {
    update({
      ingredients: form.ingredients.map((row, i) => (i === index ? { ...row, ...patch } : row)),
    });
    if (patch.quantity !== undefined) setUnheard((u) => u.map((f, i) => (i === index ? false : f)));
  };
  const removeIngredient = (index: number) => {
    update({ ingredients: form.ingredients.filter((_, i) => i !== index) });
    setUnheard((u) => u.filter((_, i) => i !== index));
  };
  const setStep = (index: number, value: string) =>
    update({ instructions: form.instructions.map((s, i) => (i === index ? value : s)) });

  const nameMissing = flagged('name') && !form.name.trim();
  const ingredientsMissing = flagged('ingredients') && !form.ingredients.some((i) => i.name.trim());
  const stepsMissing = flagged('instructions') && !form.instructions.some((s) => s.trim());

  const handleSave = () => {
    const edited = videoFormToDraft(preview.draft, form);
    const found = videoDraftProblems(edited);
    setProblems(found);
    if (found.length === 0) onSave(finalizeVideoDraft(preview.draft, edited));
  };

  return (
    <div className="space-y-5" data-testid="video-draft-form">
      <div
        role="note"
        className="flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900"
      >
        <Info className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
        <div className="min-w-0">
          <p className="font-semibold">{VIDEO_IMPORT_COPY.checkTitle}</p>
          <p className="mt-0.5 text-xs">{VIDEO_IMPORT_COPY.checkBody[preview.transcriptSource]}</p>
        </div>
      </div>

      {!preview.safety.ok && (
        <p className="flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 p-3 text-xs text-red-700">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
          <span className="min-w-0">
            This recipe conflicts with your household&apos;s allergies or diet (
            {preview.safety.issues.join(', ')}). Edit those ingredients before cooking it.
          </span>
        </p>
      )}

      <Field id="video-name" label="Recipe name">
        {nameMissing && (
          <div className="mb-1">
            <Badge tone="missing">{VIDEO_IMPORT_COPY.notFound}</Badge>
          </div>
        )}
        <input
          id="video-name"
          value={form.name}
          maxLength={120}
          onChange={(e) => update({ name: e.target.value })}
          className={inputCls(nameMissing)}
        />
      </Field>

      <div className="grid grid-cols-3 gap-2">
        <Field id="video-servings" label="Servings">
          <input
            id="video-servings"
            type="number"
            inputMode="numeric"
            min={1}
            max={20}
            value={form.servings}
            onChange={(e) => update({ servings: e.target.value }, 'servings')}
            className={inputCls(false)}
          />
        </Field>
        <Field id="video-prep" label="Prep (min)">
          <input
            id="video-prep"
            type="number"
            inputMode="numeric"
            min={0}
            value={form.prepTimeMins}
            onChange={(e) => update({ prepTimeMins: e.target.value }, 'time')}
            className={inputCls(false)}
          />
        </Field>
        <Field id="video-cook" label="Cook (min)">
          <input
            id="video-cook"
            type="number"
            inputMode="numeric"
            min={0}
            value={form.cookTimeMins}
            onChange={(e) => update({ cookTimeMins: e.target.value }, 'time')}
            className={inputCls(false)}
          />
        </Field>
      </div>
      {((flagged('servings') && !touched.servings) || (flagged('time') && !touched.time)) && (
        <div className="-mt-3 flex flex-wrap gap-2">
          {flagged('servings') && !touched.servings && (
            <Badge tone="check">{`Servings: ${VIDEO_IMPORT_COPY.notStated.toLowerCase()}`}</Badge>
          )}
          {flagged('time') && !touched.time && (
            <Badge tone="check">{`Time: ${VIDEO_IMPORT_COPY.notStated.toLowerCase()}`}</Badge>
          )}
        </div>
      )}

      <section aria-labelledby="video-ingredients-title">
        <div className="mb-2 flex flex-wrap items-center gap-2">
          <h3 id="video-ingredients-title" className="text-sm font-semibold text-gray-900">
            Ingredients
          </h3>
          {ingredientsMissing && <Badge tone="missing">{VIDEO_IMPORT_COPY.notFound}</Badge>}
        </div>
        <ul className="space-y-2">
          {form.ingredients.map((row, index) => {
            const amountUnheard = unheard[index] === true;
            return (
              <li key={index}>
                <div className="flex items-center gap-2">
                  <input
                    aria-label={`Amount for ingredient ${index + 1}`}
                    value={row.quantity}
                    inputMode="decimal"
                    placeholder="Qty"
                    onChange={(e) => setIngredient(index, { quantity: e.target.value })}
                    className={cn(
                      inputCls(false),
                      'w-16 shrink-0',
                      amountUnheard && 'border-amber-400',
                    )}
                  />
                  <input
                    aria-label={`Unit for ingredient ${index + 1}`}
                    value={row.unit}
                    placeholder="g"
                    maxLength={20}
                    onChange={(e) => setIngredient(index, { unit: e.target.value })}
                    className={cn(inputCls(false), 'w-16 shrink-0')}
                  />
                  <input
                    aria-label={`Ingredient ${index + 1}`}
                    value={row.name}
                    placeholder="Ingredient"
                    maxLength={80}
                    onChange={(e) => setIngredient(index, { name: e.target.value })}
                    className={cn(inputCls(ingredientsMissing), 'min-w-0 flex-1')}
                  />
                  <button
                    type="button"
                    aria-label={`Remove ingredient ${index + 1}`}
                    onClick={() => removeIngredient(index)}
                    className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-gray-400 hover:bg-gray-100 hover:text-gray-600"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>
                {amountUnheard && (
                  <p className="mt-1 text-xs text-amber-800">{VIDEO_IMPORT_COPY.quantityCheck}</p>
                )}
              </li>
            );
          })}
        </ul>
        <button
          type="button"
          onClick={() =>
            update({ ingredients: [...form.ingredients, { quantity: '', unit: '', name: '' }] })
          }
          className="mt-2 flex min-h-11 items-center gap-1.5 rounded-xl px-2 text-sm font-medium text-[#944a00] hover:bg-amber-50"
        >
          <Plus className="h-4 w-4" /> Add ingredient
        </button>
      </section>

      <section aria-labelledby="video-steps-title">
        <div className="mb-2 flex flex-wrap items-center gap-2">
          <h3 id="video-steps-title" className="text-sm font-semibold text-gray-900">
            Steps
          </h3>
          {stepsMissing && <Badge tone="missing">{VIDEO_IMPORT_COPY.notFound}</Badge>}
        </div>
        <ol className="space-y-2">
          {form.instructions.map((step, index) => (
            <li key={index} className="flex items-start gap-2">
              <span className="mt-2.5 w-5 shrink-0 text-right text-xs font-semibold text-gray-500">
                {index + 1}.
              </span>
              <textarea
                aria-label={`Step ${index + 1}`}
                value={step}
                rows={2}
                maxLength={500}
                onChange={(e) => setStep(index, e.target.value)}
                className={cn(inputCls(stepsMissing), 'min-w-0 flex-1')}
              />
              <button
                type="button"
                aria-label={`Remove step ${index + 1}`}
                onClick={() =>
                  update({ instructions: form.instructions.filter((_, i) => i !== index) })
                }
                className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-gray-400 hover:bg-gray-100 hover:text-gray-600"
              >
                <X className="h-4 w-4" />
              </button>
            </li>
          ))}
        </ol>
        <button
          type="button"
          onClick={() => update({ instructions: [...form.instructions, ''] })}
          className="mt-2 flex min-h-11 items-center gap-1.5 rounded-xl px-2 text-sm font-medium text-[#944a00] hover:bg-amber-50"
        >
          <Plus className="h-4 w-4" /> Add step
        </button>
      </section>

      {preview.assumptions.length > 0 && (
        <div className="rounded-xl bg-gray-50 p-3">
          <p className="text-xs font-semibold text-gray-600">What we guessed</p>
          <ul className="mt-1 list-disc space-y-0.5 pl-4 text-xs text-gray-600">
            {preview.assumptions.map((a) => (
              <li key={a}>{a}</li>
            ))}
          </ul>
        </div>
      )}

      <p className="text-xs text-gray-500">
        {VIDEO_IMPORT_COPY.nutritionNote} Source:{' '}
        <span className="break-all">{preview.sourceUrl}</span> — saved to your private collection
        only.
      </p>

      <div role="alert" aria-atomic="true">
        {(problems.length > 0 || saveError) && (
          <ul className="space-y-0.5 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {problems.map((p) => (
              <li key={p}>{p}</li>
            ))}
            {saveError && <li>{saveError}</li>}
          </ul>
        )}
      </div>

      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={onBack}
          className="min-h-11 shrink-0 rounded-xl border px-4 text-sm font-medium text-gray-600 hover:bg-gray-50"
        >
          Back
        </button>
        <button
          type="button"
          onClick={handleSave}
          disabled={saving}
          className="min-h-11 min-w-0 flex-1 rounded-xl bg-[#944a00] px-4 text-sm font-semibold text-white transition-colors hover:bg-[#7a3d00] disabled:opacity-50"
        >
          {saving ? 'Saving…' : 'Save recipe'}
        </button>
      </div>
    </div>
  );
}
