'use client';

import { useEffect, useId, useRef, useState } from 'react';
import { SourceBadge } from '@/features/ingredients/components/SourceBadge';
import {
  pickedFromRef,
  pickedFromSearch,
  type PickedIngredient,
} from '@/features/ingredients/lib/picked-ingredient';
import { trpc } from '@/lib/trpc';
import { ChevronDown, Plus, Search } from 'lucide-react';
import type { IngredientCategory } from '@chefer/types';
import { cn, pressControl, Sheet } from '@chefer/ui';
import { INGREDIENT_CATEGORY_LABELS, PICKER_CATEGORY_CHIPS } from '@chefer/utils';

// ─── Ingredient picker (plan-ingredient-catalog §10) ──────────────────────────
// Every recipe line is picked from the catalog: global rows plus the user's own
// private ingredients. The trigger opens a Sheet (scroll lock, focus trap and
// Escape come with it) with a search box and category chips; a category on
// its own browses that shelf. Nothing matching → "Create '…' as my
// ingredient", which hands the query to the private-ingredient sheet.

const MIN_QUERY = 2;

export function IngredientPickerSheet({
  open,
  onClose,
  initialQuery = '',
  onPick,
  onCreate,
}: {
  open: boolean;
  onClose: () => void;
  initialQuery?: string;
  onPick: (ingredient: PickedIngredient) => void;
  onCreate: (query: string) => void;
}) {
  const [query, setQuery] = useState(initialQuery);
  const [debounced, setDebounced] = useState(initialQuery.trim());
  const [category, setCategory] = useState<IngredientCategory | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const searchId = useId();
  const resultsId = useId();

  useEffect(() => {
    if (!open) return;
    setQuery(initialQuery);
    setDebounced(initialQuery.trim());
    setCategory(null);
    // The Sheet focuses its first control (Close) after its children's
    // effects run; move focus to the search box on the next frame.
    const frame = requestAnimationFrame(() => inputRef.current?.focus());
    return () => cancelAnimationFrame(frame);
  }, [open, initialQuery]);

  useEffect(() => {
    const t = setTimeout(() => setDebounced(query.trim()), 250);
    return () => clearTimeout(t);
  }, [query]);

  const searching = debounced.length >= MIN_QUERY;
  const search = trpc.ingredients.search.useQuery(
    { query: debounced, ...(category ? { category } : {}) },
    { enabled: open && searching, staleTime: 30_000, placeholderData: (p) => p },
  );
  // A category with no query browses that shelf.
  const shelf = trpc.ingredients.catalogList.useQuery(
    { category: category ?? undefined, limit: 40 },
    { enabled: open && !searching && category !== null, staleTime: 60_000 },
  );

  const results: PickedIngredient[] = searching
    ? (search.data ?? []).flatMap((r) => {
        const picked = pickedFromSearch(r);
        return picked ? [picked] : [];
      })
    : category
      ? (shelf.data?.items ?? []).map(pickedFromRef)
      : [];
  const loading = searching ? search.isFetching && !search.data : shelf.isLoading && !!category;
  const trimmed = query.trim();

  return (
    <Sheet open={open} onClose={onClose} title="Choose an ingredient" size="lg">
      <div className="px-5 pb-5">
        <label htmlFor={searchId} className="sr-only">
          Search ingredients
        </label>
        <div className="relative">
          <Search
            aria-hidden="true"
            className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-500"
          />
          <input
            ref={inputRef}
            id={searchId}
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search: chicken, rice, telemea…"
            aria-controls={resultsId}
            autoComplete="off"
            className="min-h-11 w-full rounded-xl border bg-white py-2.5 pl-9 pr-3 text-sm text-gray-800 placeholder-gray-500 focus:border-[#944a00] focus:outline-none"
          />
        </div>

        <div
          role="group"
          aria-label="Filter by category"
          className="scroll-rail -mx-5 mt-3 gap-2 px-5 pb-1"
        >
          <CategoryChip label="All" active={category === null} onClick={() => setCategory(null)} />
          {PICKER_CATEGORY_CHIPS.map((c) => (
            <CategoryChip
              key={c}
              label={INGREDIENT_CATEGORY_LABELS[c]}
              active={category === c}
              onClick={() => setCategory(category === c ? null : c)}
            />
          ))}
        </div>

        <div id={resultsId} aria-live="polite" className="mt-3">
          {!searching && !category ? (
            <p className="py-6 text-center text-sm text-gray-500">
              Type at least {MIN_QUERY} letters, or pick a category.
            </p>
          ) : loading ? (
            <p className="py-6 text-center text-sm text-gray-500">Searching…</p>
          ) : results.length === 0 ? (
            <p className="py-6 text-center text-sm text-gray-500">
              {searching ? `Nothing in the catalog matches “${debounced}”.` : 'Nothing here yet.'}
            </p>
          ) : (
            <ul className="divide-y rounded-xl border" aria-label="Matching ingredients">
              {results.map((r) => (
                <li key={r.id}>
                  <button
                    type="button"
                    onClick={() => onPick(r)}
                    className={cn(
                      'flex min-h-11 w-full items-center gap-2 px-3 py-2.5 text-left hover:bg-[#fff3e8]',
                      pressControl,
                    )}
                  >
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium text-gray-900">
                        {r.name}
                      </span>
                      <span className="block truncate text-xs text-gray-500">
                        {INGREDIENT_CATEGORY_LABELS[r.category]}
                      </span>
                    </span>
                    <SourceBadge source={r.nutritionSource} owner={r.owner} />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        {trimmed.length >= MIN_QUERY && (
          <button
            type="button"
            onClick={() => onCreate(trimmed)}
            className={cn(
              'mt-3 flex min-h-11 w-full items-center gap-2 rounded-xl border border-dashed border-[#944a00]/40 px-3 py-2 text-left text-sm font-medium text-[#944a00] hover:bg-[#fff3e8]',
              pressControl,
            )}
          >
            <Plus className="h-4 w-4 shrink-0" aria-hidden="true" />
            <span className="min-w-0 truncate">Create “{trimmed}” as my ingredient</span>
          </button>
        )}
        <p className="mt-2 text-xs text-gray-500">
          Nutrition comes from USDA and CIQUAL food data, or from the label you enter for your own
          ingredients — never an estimate.
        </p>
      </div>
    </Sheet>
  );
}

function CategoryChip({
  label,
  active,
  onClick,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        'min-h-11 min-w-11 shrink-0 snap-start whitespace-nowrap rounded-full border px-3 text-xs font-medium',
        pressControl,
        active
          ? 'border-[#944a00] bg-[#944a00] text-white'
          : 'border-gray-200 bg-white text-gray-700 hover:border-[#944a00]/40 hover:text-[#944a00]',
      )}
    >
      {label}
    </button>
  );
}

/**
 * The row's ingredient control: shows the pick (or the unmatched text) and
 * opens the picker. A button, so it has one accessible name and a 44px target.
 */
export function IngredientField({
  id,
  label,
  ingredient,
  rawName,
  invalid = false,
  describedBy,
  onOpen,
}: {
  id?: string | undefined;
  /** Accessible name, e.g. "Ingredient 2". */
  label: string;
  ingredient: PickedIngredient | null;
  rawName: string;
  invalid?: boolean;
  describedBy?: string | undefined;
  onOpen: () => void;
}) {
  const shown = ingredient?.name ?? rawName.trim();
  const unmatched = !ingredient && shown !== '';
  return (
    <button
      id={id}
      type="button"
      onClick={onOpen}
      aria-label={`${label}: ${
        ingredient
          ? ingredient.name
          : unmatched
            ? `${shown}, not matched to the catalog`
            : 'not chosen'
      }`}
      aria-haspopup="dialog"
      aria-invalid={invalid || undefined}
      aria-describedby={describedBy}
      className={cn(
        'flex min-h-11 w-full min-w-0 items-center gap-2 rounded-xl border bg-white px-3 py-2 text-left text-sm',
        pressControl,
        invalid
          ? 'border-red-400'
          : unmatched
            ? 'border-amber-400 bg-amber-50/50'
            : 'hover:border-[#944a00]/50',
      )}
    >
      <Search className="h-3.5 w-3.5 shrink-0 text-gray-500" aria-hidden="true" />
      <span
        className={cn(
          'min-w-0 flex-1 line-clamp-2 break-words',
          shown ? 'text-gray-900' : 'text-gray-500',
        )}
      >
        {shown || 'Choose ingredient…'}
      </span>
      {ingredient ? (
        <SourceBadge source={ingredient.nutritionSource} owner={ingredient.owner} />
      ) : unmatched ? (
        <span className="shrink-0 rounded-full bg-amber-100 px-1.5 py-0.5 text-xs font-semibold text-amber-900">
          Pick a match
        </span>
      ) : null}
      <ChevronDown className="h-4 w-4 shrink-0 text-gray-400" aria-hidden="true" />
    </button>
  );
}
