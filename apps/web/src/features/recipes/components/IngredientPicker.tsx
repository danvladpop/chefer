'use client';

import { useEffect, useRef, useState } from 'react';
import { trpc } from '@/lib/trpc';
import { Plus, Search, Sparkles } from 'lucide-react';

// ─── Searchable ingredient picker ─────────────────────────────────────────────
// Replaces the free-text ingredient name input: searches the catalog (global
// vocabulary + the user's custom ingredients) and offers "create custom" when
// nothing matches.

interface IngredientPickerProps {
  value: string;
  onSelect: (name: string) => void;
  onCreateCustom: (query: string) => void;
  placeholder?: string;
  /** Id of the search input (lets a form focus it on a validation error). */
  id?: string | undefined;
  /** Accessible name — the placeholder alone is not a label (F-X-5-1). */
  ariaLabel?: string;
  invalid?: boolean;
  /** Id of the error text describing this input. */
  describedBy?: string | undefined;
}

export function IngredientPicker({
  value,
  onSelect,
  onCreateCustom,
  placeholder = 'Search ingredient…',
  id,
  ariaLabel = 'Ingredient',
  invalid = false,
  describedBy,
}: IngredientPickerProps) {
  const [query, setQuery] = useState(value);
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  // Keep the input in sync when the parent sets the value (e.g. after custom create)
  useEffect(() => setQuery(value), [value]);

  // Debounce the search input
  const [debounced, setDebounced] = useState('');
  useEffect(() => {
    const t = setTimeout(() => setDebounced(query.trim()), 300);
    return () => clearTimeout(t);
  }, [query]);

  const { data: results, isFetching } = trpc.ingredients.search.useQuery(
    { query: debounced },
    { enabled: open && debounced.length >= 2, staleTime: 30_000, placeholderData: (p) => p },
  );

  // Close on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
        // Revert unselected free text back to the committed value
        setQuery(value);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [value]);

  const pick = (name: string) => {
    onSelect(name);
    setQuery(name);
    setOpen(false);
  };

  return (
    <div ref={containerRef} className="relative flex-1">
      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-gray-500" />
        <input
          id={id}
          type="text"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onKeyDown={(e) => {
            if (e.key === 'Escape' && open) {
              setOpen(false);
              setQuery(value);
            }
          }}
          placeholder={placeholder}
          aria-label={ariaLabel}
          aria-invalid={invalid || undefined}
          aria-describedby={describedBy}
          className={`w-full rounded-xl border bg-white py-2 pl-9 pr-3 text-sm text-gray-800 placeholder-gray-400 focus:outline-none ${
            invalid ? 'border-red-400 focus:border-red-500' : 'focus:border-[#944a00]'
          }`}
        />
      </div>

      {open && debounced.length >= 2 && (
        <div className="absolute z-30 mt-1 w-full overflow-hidden rounded-xl border border-gray-200 bg-white shadow-lg">
          <ul className="max-h-56 overflow-y-auto">
            {(results ?? []).map((r) => (
              <li key={r.name}>
                <button
                  type="button"
                  onClick={() => pick(r.displayName)}
                  className="flex min-h-11 w-full items-center gap-2.5 px-3 py-2.5 text-left text-sm hover:bg-[#fff3e8]"
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={r.imageUrl}
                    alt=""
                    className="h-7 w-7 shrink-0 rounded-md object-cover"
                  />
                  <span className="min-w-0 flex-1 truncate text-gray-800">{r.displayName}</span>
                  {r.isCustom && (
                    <span className="shrink-0 rounded-full bg-purple-100 px-1.5 py-0.5 text-xs font-semibold uppercase text-purple-700">
                      Mine
                    </span>
                  )}
                  {!r.hasMacros && (
                    <span
                      className="shrink-0 rounded-full bg-gray-100 px-1.5 py-0.5 text-xs text-gray-600"
                      title="Nutrition data is still being estimated for this ingredient"
                    >
                      no macros yet
                    </span>
                  )}
                </button>
              </li>
            ))}
            {results?.length === 0 && !isFetching && (
              <li className="px-3 py-2 text-xs text-gray-500">No matches in the catalog.</li>
            )}
            {isFetching && !results?.length && (
              <li className="px-3 py-2 text-xs text-gray-500">Searching…</li>
            )}
          </ul>

          <button
            type="button"
            onClick={() => {
              setOpen(false);
              onCreateCustom(query.trim());
            }}
            className="flex min-h-11 w-full items-center gap-1.5 border-t border-gray-100 px-3 py-2.5 text-left text-xs font-medium text-[#944a00] hover:bg-[#fff3e8]"
          >
            <Plus className="h-3.5 w-3.5" />
            Create &ldquo;{query.trim()}&rdquo; as a custom ingredient
            <Sparkles className="ml-auto h-3 w-3 text-amber-500" />
          </button>
        </div>
      )}
    </div>
  );
}
