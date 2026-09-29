'use client';

import { useState } from 'react';
import { UncheckedNotice } from '@/features/safety/components/UncheckedNotice';
import { findSafetyTaxonomyEntry, safetyTaxonomyEntriesByGroup } from '@chefer/types';
import {
  BASE_DIET_IDS,
  classifySafetyValue,
  DIET_MODIFIER_IDS,
  recognisedAddedText,
  recognisedDietSetText,
  recognisedModifierAddedText,
  recogniseSafetyTerm,
  SAFETY_COPY,
  serialiseSafetyPickerValue,
  type BaseDietId,
} from '@chefer/utils';

// ─── SafetyPicker (T-01.7, UX-01 (a)) — web ────────────────────────────────────
// Web parity of the mobile safety-picker.tsx: taxonomy-driven Allergies/Diet/
// Won't-eat chip groups, a live read-back panel, and the "Something else"
// field wired to every recogniser outcome. Kept as `StepDiet` (its existing
// name/props) so onboarding, SafetySection and the household member editor
// sheet all pick up the rebuild without their own changes.

export interface StepDietValues {
  dietaryRestrictions: string[];
  allergies: string[];
  dislikedIngredients: string[];
}

interface StepDietProps {
  value: StepDietValues;
  onChange: (value: StepDietValues) => void;
}

function labelFor(id: string): string {
  return findSafetyTaxonomyEntry(id)?.label ?? id;
}

function dietReadBackFor(id: BaseDietId | null): string | null {
  switch (id) {
    case 'vegetarian':
      return SAFETY_COPY.vegetarianReadBack;
    case 'vegetarian-no-eggs':
      return SAFETY_COPY.vegetarianNoEggsReadBack;
    case 'vegan':
      return SAFETY_COPY.veganReadBack;
    case 'pescatarian':
      return SAFETY_COPY.pescatarianReadBack;
    default:
      return null;
  }
}

const chipCls = (selected: boolean, disabled = false) =>
  `min-h-11 rounded-full border px-4 py-1.5 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 ${
    disabled
      ? 'cursor-not-allowed border-border text-muted-foreground/50'
      : selected
        ? 'border-primary bg-primary/5 text-primary'
        : 'border-border text-muted-foreground hover:border-primary/40 hover:text-foreground'
  }`;

export function StepDiet({ value, onChange }: StepDietProps) {
  const classified = classifySafetyValue(value);
  const [somethingElse, setSomethingElse] = useState('');
  const [addedMessage, setAddedMessage] = useState<string | null>(null);
  const [pending, setPending] = useState<{
    variant: 'unrecognised' | 'condition';
    term: string;
  } | null>(null);

  const commit = (patch: Partial<ReturnType<typeof classifySafetyValue>>) => {
    onChange(serialiseSafetyPickerValue({ ...classified, ...patch }));
  };

  const allergyEntries = safetyTaxonomyEntriesByGroup('allergy');
  const dislikeEntries = safetyTaxonomyEntriesByGroup('dislike');
  const veganSelected = classified.dietBaseId === 'vegan';
  const knownModifierIds = classified.dietModifierIds.filter((id) =>
    (DIET_MODIFIER_IDS as readonly string[]).includes(id),
  );
  const unknownModifierIds = classified.dietModifierIds.filter(
    (id) => !(DIET_MODIFIER_IDS as readonly string[]).includes(id),
  );

  const allergyReadBackLines = classified.allergyIds
    .map((id) => findSafetyTaxonomyEntry(id))
    .filter((entry): entry is NonNullable<typeof entry> => Boolean(entry))
    .map((entry) =>
      entry.mayContain
        ? `${entry.label} — and foods that often contain it: ${entry.mayContain}.`
        : `${entry.label}.`,
    );
  const dislikeLine =
    classified.dislikeIds.length > 0
      ? `We’ll leave out ${classified.dislikeIds
          .map((id) => findSafetyTaxonomyEntry(id)?.readBack.replace(/^doesn.t eat /, ''))
          .filter(Boolean)
          .join(' and ')}.`
      : '';

  function toggle(list: string[], id: string): string[] {
    return list.includes(id) ? list.filter((x) => x !== id) : [...list, id];
  }

  function handleAdd() {
    const term = somethingElse.trim();
    if (!term) return;
    setSomethingElse('');
    setAddedMessage(null);
    const recognised = recogniseSafetyTerm(term);

    if (recognised.kind === 'unrecognised') {
      setPending({ variant: 'unrecognised', term });
      return;
    }
    if (recognised.kind === 'condition') {
      if (recognised.impliesDietId) {
        commit({
          dietModifierIds: [...new Set([...classified.dietModifierIds, recognised.impliesDietId])],
        });
        setAddedMessage(recognisedDietSetText(labelFor(recognised.impliesDietId)));
      } else {
        setPending({ variant: 'condition', term });
      }
      return;
    }
    if (recognised.kind === 'allergy') {
      commit({ allergyIds: [...new Set([...classified.allergyIds, recognised.id])] });
      setAddedMessage(recognisedAddedText('Allergies', recognised.label));
      return;
    }
    if (recognised.kind === 'dislike') {
      commit({ dislikeIds: [...new Set([...classified.dislikeIds, recognised.id])] });
      setAddedMessage(recognisedAddedText('Won’t eat', recognised.label));
      return;
    }
    if (
      recognised.id === 'vegetarian-no-eggs' &&
      classified.dietBaseId !== 'vegetarian' &&
      classified.dietBaseId !== 'vegetarian-no-eggs'
    ) {
      commit({ dietModifierIds: [...new Set([...classified.dietModifierIds, 'egg-free'])] });
      setAddedMessage(recognisedModifierAddedText('Egg-free'));
      return;
    }
    if ((BASE_DIET_IDS as readonly string[]).includes(recognised.id)) {
      commit({ dietBaseId: recognised.id as BaseDietId });
      setAddedMessage(recognisedDietSetText(recognised.label));
      return;
    }
    commit({ dietModifierIds: [...new Set([...classified.dietModifierIds, recognised.id])] });
    setAddedMessage(recognisedModifierAddedText(recognised.label));
  }

  function keepPendingAsNote() {
    if (!pending) return;
    commit({ notes: [...classified.notes, pending.term] });
    setPending(null);
  }

  return (
    <div className="space-y-8">
      {/* Heading */}
      <div className="text-center">
        <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">Diet & restrictions</h1>
        <p className="mt-2 text-muted-foreground">
          All fields are optional — skip anything that doesn&apos;t apply.
        </p>
      </div>

      <div className="space-y-8">
        {/* Allergies */}
        <div className="space-y-3">
          <p className="text-sm font-medium">Allergies</p>
          <div className="flex flex-wrap gap-2">
            {allergyEntries.map((entry) => {
              const selected = classified.allergyIds.includes(entry.id);
              return (
                <button
                  key={entry.id}
                  type="button"
                  role="checkbox"
                  aria-checked={selected}
                  onClick={() => commit({ allergyIds: toggle(classified.allergyIds, entry.id) })}
                  className={chipCls(selected)}
                >
                  {entry.label}
                </button>
              );
            })}
          </div>
          <div
            aria-live="polite"
            className="rounded-xl bg-muted/40 p-3 text-sm text-muted-foreground"
          >
            <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-primary">
              {SAFETY_COPY.readBackTitle}
            </p>
            {allergyReadBackLines.length > 0 ? (
              allergyReadBackLines.map((line) => <p key={line}>{line}</p>)
            ) : (
              <p>{SAFETY_COPY.readBackEmpty}</p>
            )}
          </div>
        </div>

        {/* Diet */}
        <div className="space-y-3">
          <p className="text-sm font-medium">Diet</p>
          <div role="radiogroup" aria-label="Diet" className="flex flex-wrap gap-2">
            <button
              type="button"
              role="radio"
              aria-checked={classified.dietBaseId === null}
              onClick={() => commit({ dietBaseId: null })}
              className={chipCls(classified.dietBaseId === null)}
            >
              No restriction
            </button>
            {BASE_DIET_IDS.map((id) => {
              const selected = classified.dietBaseId === id;
              return (
                <button
                  key={id}
                  type="button"
                  role="radio"
                  aria-checked={selected}
                  onClick={() => commit({ dietBaseId: id })}
                  className={chipCls(selected)}
                >
                  {labelFor(id)}
                </button>
              );
            })}
          </div>
          <p className="text-xs text-muted-foreground">Also:</p>
          <div className="flex flex-wrap gap-2">
            {DIET_MODIFIER_IDS.map((id) => {
              const selected = knownModifierIds.includes(id);
              const disabled = veganSelected && id === 'dairy-free';
              return (
                <div key={id} className="flex flex-col items-center gap-1">
                  <button
                    type="button"
                    role="checkbox"
                    aria-checked={selected}
                    disabled={disabled}
                    onClick={() =>
                      !disabled &&
                      commit({
                        dietModifierIds: [...toggle(knownModifierIds, id), ...unknownModifierIds],
                      })
                    }
                    className={chipCls(selected, disabled)}
                  >
                    {labelFor(id)}
                  </button>
                  {disabled && (
                    <span className="text-center text-xs text-muted-foreground">
                      {SAFETY_COPY.veganDairyFreeHint}
                    </span>
                  )}
                </div>
              );
            })}
          </div>
          {dietReadBackFor(classified.dietBaseId) && (
            <p className="text-sm text-muted-foreground">
              {dietReadBackFor(classified.dietBaseId)}
            </p>
          )}
        </div>

        {/* Won't eat */}
        <div className="space-y-3">
          <p className="text-sm font-medium">Won&apos;t eat</p>
          <div className="flex flex-wrap gap-2">
            {dislikeEntries.map((entry) => {
              const selected = classified.dislikeIds.includes(entry.id);
              return (
                <button
                  key={entry.id}
                  type="button"
                  role="checkbox"
                  aria-checked={selected}
                  onClick={() => commit({ dislikeIds: toggle(classified.dislikeIds, entry.id) })}
                  className={chipCls(selected)}
                >
                  {entry.label}
                </button>
              );
            })}
          </div>
          {dislikeLine && <p className="text-xs text-muted-foreground">{dislikeLine}</p>}
        </div>

        {/* Something else */}
        <div className="space-y-3">
          <div>
            <label htmlFor="safety-something-else" className="text-sm font-medium">
              Something else?
            </label>
          </div>
          <div className="flex gap-2">
            <input
              id="safety-something-else"
              type="text"
              value={somethingElse}
              onChange={(e) => setSomethingElse(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  handleAdd();
                }
              }}
              placeholder="e.g. aubergine"
              className="min-w-0 flex-1 rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
            />
            <button
              type="button"
              onClick={handleAdd}
              className="inline-flex min-h-11 shrink-0 items-center justify-center rounded-md border border-input bg-background px-4 text-sm font-medium hover:bg-accent"
            >
              Add
            </button>
          </div>
          {addedMessage && <p className="text-xs text-muted-foreground">{addedMessage}</p>}
          {pending && (
            <UncheckedNotice
              term={pending.term}
              variant={pending.variant}
              onKeepNote={keepPendingAsNote}
              onRemove={() => setPending(null)}
              onChooseGoal={() => setPending(null)}
              onDismiss={() => setPending(null)}
            />
          )}
          {classified.notes.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {classified.notes.map((note) => (
                <button
                  key={note}
                  type="button"
                  onClick={() => commit({ notes: classified.notes.filter((n) => n !== note) })}
                  aria-label={`Remove note ${note}`}
                  className="inline-flex min-h-9 items-center gap-1 rounded-full bg-muted px-3 text-xs text-muted-foreground hover:bg-muted/70"
                >
                  {note} ×
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
