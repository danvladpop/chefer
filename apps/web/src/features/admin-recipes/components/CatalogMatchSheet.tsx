'use client';

import { useEffect, useId, useRef, useState } from 'react';
import { trpc } from '@/lib/trpc';
import { Search } from 'lucide-react';
import { cn, pressControl, Sheet } from '@chefer/ui';
import { INGREDIENT_CATEGORY_LABELS } from '@chefer/utils';

// Curated recipes compute from the GLOBAL catalog only (nobody's private
// ingredients), so this picker lists global rows and hands back their slug.

export interface CatalogPick {
  slug: string;
  name: string;
}

export function CatalogMatchSheet({
  open,
  initialQuery,
  onClose,
  onPick,
}: {
  open: boolean;
  initialQuery: string;
  onClose: () => void;
  onPick: (pick: CatalogPick) => void;
}) {
  const [query, setQuery] = useState(initialQuery);
  const [debounced, setDebounced] = useState(initialQuery);
  const inputRef = useRef<HTMLInputElement>(null);
  const searchId = useId();

  useEffect(() => {
    if (!open) return;
    setQuery(initialQuery);
    setDebounced(initialQuery);
    const frame = requestAnimationFrame(() => inputRef.current?.focus());
    return () => cancelAnimationFrame(frame);
  }, [open, initialQuery]);

  useEffect(() => {
    const t = setTimeout(() => setDebounced(query.trim()), 250);
    return () => clearTimeout(t);
  }, [query]);

  const search = trpc.ingredients.search.useQuery(
    { query: debounced, limit: 20 },
    { enabled: open && debounced.length >= 2, placeholderData: (p) => p },
  );
  const rows = (search.data ?? []).filter((r) => r.slug && r.owner !== 'mine' && !r.isCustom);

  return (
    <Sheet open={open} onClose={onClose} title="Match to the catalog" size="lg">
      <div className="px-5 pb-5">
        <label htmlFor={searchId} className="sr-only">
          Search the global catalog
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
            placeholder="Search: chicken, telemea, smântână…"
            autoComplete="off"
            className="min-h-11 w-full rounded-xl border bg-white py-2.5 pl-9 pr-3 text-sm focus:border-[#944a00] focus:outline-none"
          />
        </div>
        <div aria-live="polite" className="mt-3">
          {debounced.length < 2 ? (
            <p className="py-6 text-center text-sm text-gray-500">Type at least 2 letters.</p>
          ) : rows.length === 0 ? (
            <p className="py-6 text-center text-sm text-gray-500">
              {search.isFetching ? 'Searching…' : `Nothing global matches “${debounced}”.`}
            </p>
          ) : (
            <ul className="divide-y rounded-xl border" aria-label="Catalog rows">
              {rows.map((r) => (
                <li key={r.slug}>
                  <button
                    type="button"
                    onClick={() => onPick({ slug: r.slug!, name: r.displayName })}
                    className={cn(
                      'flex min-h-11 w-full flex-col px-3 py-2 text-left hover:bg-[#fff3e8]',
                      pressControl,
                    )}
                  >
                    <span className="text-sm font-medium text-gray-900">{r.displayName}</span>
                    <span className="text-xs text-gray-500">
                      {r.category ? INGREDIENT_CATEGORY_LABELS[r.category] : ''} · {r.slug}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </Sheet>
  );
}
