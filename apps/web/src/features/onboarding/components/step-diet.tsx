'use client';

import { useEffect, useImperativeHandle, useState, type Ref } from 'react';
import { UncheckedNotice } from '@/features/safety/components/UncheckedNotice';
import {
  findSafetyTaxonomyEntry,
  safetyPickerEntries,
  safetyTaxonomyEntriesByGroup,
} from '@chefer/types';
import {
  applySafetyTerm,
  BASE_DIET_IDS,
  classifySafetyValue,
  DIET_MODIFIER_IDS,
  keepSafetyTermAsNote,
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

/**
 * UX-ACC-01: what a host calls from its Save / Continue. A term typed in
 * "Something else?" but never confirmed with "Add" must not be lost, so the
 * host asks the picker to flush it first and saves the RETURNED value (state
 * updates are async — `value` is stale inside the same handler).
 *  - nothing pending → the current value;
 *  - a recognised term → it is added and the new value is returned;
 *  - an unrecognised term (or one still awaiting a Keep/Remove choice) → the
 *    picker shows its notice and returns `null`: the host must NOT save yet.
 */
export interface StepDietHandle {
  flush: () => StepDietValues | null;
}

interface StepDietProps {
  value: StepDietValues;
  onChange: (value: StepDietValues) => void;
  ref?: Ref<StepDietHandle> | undefined;
  /** True while the field holds un-added text or a Keep/Remove choice is open (a pending edit). */
  onPendingChange?: ((pending: boolean) => void) | undefined;
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

export function StepDiet({ value, onChange, ref, onPendingChange }: StepDietProps) {
  const classified = classifySafetyValue(value);
  const [somethingElse, setSomethingElse] = useState('');
  const [addedMessage, setAddedMessage] = useState<string | null>(null);
  const [pending, setPending] = useState<{
    variant: 'unrecognised' | 'condition';
    term: string;
  } | null>(null);
  // Set when a host's Save was held back because a term still needs a choice.
  const [blockedTerm, setBlockedTerm] = useState<string | null>(null);

  const commit = (patch: Partial<ReturnType<typeof classifySafetyValue>>) => {
    onChange(serialiseSafetyPickerValue({ ...classified, ...patch }));
  };

  // Legacy "Shellfish" is offered only while already selected (UX-ACC-06 follow-up).
  const allergyEntries = safetyPickerEntries('allergy', classified.allergyIds);
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

  function handleAdd(): StepDietValues | null {
    const outcome = applySafetyTerm(value, somethingElse);
    if (outcome.status === 'empty') return value;
    setSomethingElse('');
    setAddedMessage(null);
    setBlockedTerm(null);
    if (outcome.status === 'needs-decision') {
      setPending({ variant: outcome.variant, term: outcome.term });
      return null;
    }
    onChange(outcome.value);
    setAddedMessage(outcome.message);
    return outcome.value;
  }

  function keepPendingAsNote() {
    if (!pending) return;
    onChange(keepSafetyTermAsNote(value, pending.term));
    setPending(null);
    setBlockedTerm(null);
  }

  const hasPendingEdit = somethingElse.trim() !== '' || pending !== null;
  useEffect(() => {
    onPendingChange?.(hasPendingEdit);
  }, [hasPendingEdit, onPendingChange]);

  useImperativeHandle(ref, () => ({
    flush: () => {
      if (pending?.variant === 'unrecognised') {
        setBlockedTerm(pending.term);
        return null;
      }
      if (pending) {
        // A health-condition notice is informational — nothing is ever stored
        // from it, so a second Save simply moves on.
        setPending(null);
        return value;
      }
      const typed = somethingElse.trim();
      const added = handleAdd();
      if (added === null) setBlockedTerm(typed);
      return added;
    },
  }));

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
          <div role="group" aria-label="Allergies" className="flex flex-wrap gap-2">
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
              placeholder={SAFETY_COPY.somethingElsePlaceholder}
              className="min-w-0 flex-1 rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
            />
            <button
              type="button"
              onClick={() => handleAdd()}
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
              onRemove={() => {
                setPending(null);
                setBlockedTerm(null);
              }}
              onChooseGoal={() => {
                setPending(null);
                setBlockedTerm(null);
              }}
              onDismiss={() => {
                setPending(null);
                setBlockedTerm(null);
              }}
            />
          )}
          {blockedTerm && (
            <p role="alert" data-testid="safety-save-blocked" className="text-xs text-destructive">
              Choose what to do with “{blockedTerm}” first — then save again.
            </p>
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
