'use client';

import { useId, useState } from 'react';
import { X } from 'lucide-react';
import { HOUSEHOLD_SHARING_COPY as COPY, findSafetyTaxonomyEntry } from '@chefer/types';
import { Button } from '@chefer/ui';

// The join screen's "check your allergies and diet" (ADR 0002): the three
// lists the owner entered for the profile, as removable chips plus a small
// labelled add box each. Terms are taxonomy ids or free text; ids show their
// label.

export type SafetyLists = {
  allergies: string[];
  dietaryRestrictions: string[];
  dislikedIngredients: string[];
};

export const SAFETY_LIST_KEYS = [
  'allergies',
  'dietaryRestrictions',
  'dislikedIngredients',
] as const;
type SafetyListKey = (typeof SAFETY_LIST_KEYS)[number];

/** Mirrors `joinHouseholdInputSchema`: 20 / 20 / 30 terms of at most 60 characters. */
const MAX_TERMS: Record<SafetyListKey, number> = {
  allergies: 20,
  dietaryRestrictions: 20,
  dislikedIngredients: 30,
};
const MAX_TERM_LENGTH = 60;

function termLabel(term: string): string {
  return findSafetyTaxonomyEntry(term)?.label ?? term;
}

function SafetyList({
  listKey,
  terms,
  onChange,
  disabled,
}: {
  listKey: SafetyListKey;
  terms: string[];
  onChange: (next: string[]) => void;
  disabled: boolean;
}) {
  const inputId = useId();
  const [draft, setDraft] = useState('');
  const label = COPY.joinSafetyLists[listKey];
  const full = terms.length >= MAX_TERMS[listKey];

  const add = () => {
    const term = draft.trim().replace(/\s+/g, ' ').slice(0, MAX_TERM_LENGTH);
    if (!term || full) return;
    const exists = terms.some(
      (t) =>
        t.toLowerCase() === term.toLowerCase() || termLabel(t).toLowerCase() === term.toLowerCase(),
    );
    if (!exists) onChange([...terms, term]);
    setDraft('');
  };

  return (
    <fieldset className="min-w-0" data-testid={`join-safety-${listKey}`}>
      <legend className="text-sm font-semibold text-gray-900">{label}</legend>
      {terms.length === 0 ? (
        <p className="mt-1 text-sm text-gray-500">{COPY.joinSafetyNone}</p>
      ) : (
        <ul className="mt-2 flex flex-wrap gap-2">
          {terms.map((term) => (
            <li key={term}>
              <button
                type="button"
                disabled={disabled}
                onClick={() => onChange(terms.filter((t) => t !== term))}
                aria-label={COPY.joinSafetyRemove(termLabel(term))}
                className="flex min-h-11 max-w-full items-center gap-1.5 rounded-full border border-[#944a00]/30 bg-[#fff3e8] pl-3 pr-2 text-sm text-[#944a00] hover:bg-[#ffe7d1] disabled:opacity-50"
              >
                <span className="min-w-0 truncate">{termLabel(term)}</span>
                <X className="h-4 w-4 shrink-0" aria-hidden="true" />
              </button>
            </li>
          ))}
        </ul>
      )}
      <div className="mt-2 flex gap-2">
        <label htmlFor={inputId} className="sr-only">
          {COPY.joinSafetyAddLabel(label)}
        </label>
        <input
          id={inputId}
          type="text"
          value={draft}
          maxLength={MAX_TERM_LENGTH}
          disabled={disabled || full}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              add();
            }
          }}
          enterKeyHint="done"
          className="min-h-11 min-w-0 flex-1 rounded-xl border border-input bg-background px-3 py-2 text-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary disabled:opacity-50"
        />
        <Button
          type="button"
          variant="outline"
          className="min-h-11 shrink-0"
          disabled={disabled || full || !draft.trim()}
          onClick={add}
        >
          {COPY.joinSafetyAdd}
        </Button>
      </div>
    </fieldset>
  );
}

export function SafetyTermsEditor({
  value,
  onChange,
  disabled = false,
}: {
  value: SafetyLists;
  onChange: (next: SafetyLists) => void;
  disabled?: boolean;
}) {
  return (
    <div className="flex flex-col gap-4">
      {SAFETY_LIST_KEYS.map((key) => (
        <SafetyList
          key={key}
          listKey={key}
          terms={value[key]}
          disabled={disabled}
          onChange={(next) => onChange({ ...value, [key]: next })}
        />
      ))}
    </div>
  );
}

/** Whether the partner changed what the owner entered (order ignored). */
export function safetyEdited(before: SafetyLists, after: SafetyLists): boolean {
  return SAFETY_LIST_KEYS.some((key) => {
    const a = new Set(before[key]);
    const b = new Set(after[key]);
    return a.size !== b.size || [...a].some((t) => !b.has(t));
  });
}
