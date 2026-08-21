'use client';

import { useState } from 'react';
import { IngredientFormModal } from '@/features/ingredients/components/IngredientFormModal';
import { trpc } from '@/lib/trpc';
import type { RouterOutputs } from '@/lib/trpc';
import { Pencil, Plus, Search, Trash2 } from 'lucide-react';
import { Sheet } from '@chefer/ui';

type IngredientItem = RouterOutputs['ingredients']['list']['items'][0];

type Tab = 'all' | 'mine';

const PAGE_SIZE = 60;

const FALLBACK_IMAGE =
  'https://images.unsplash.com/photo-1490645935967-10de6ba17061?w=120&h=120&fit=crop&q=80';

export default function IngredientsPage() {
  const [tab, setTab] = useState<Tab>('all');
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [limit, setLimit] = useState(PAGE_SIZE);
  const [editTarget, setEditTarget] = useState<IngredientItem | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<IngredientItem | null>(null);

  const handleSearch = (value: string) => {
    setSearch(value);
    clearTimeout((window as unknown as { _ist?: ReturnType<typeof setTimeout> })._ist);
    (window as unknown as { _ist?: ReturnType<typeof setTimeout> })._ist = setTimeout(() => {
      setDebouncedSearch(value);
      setLimit(PAGE_SIZE);
    }, 300);
  };

  const { data, isLoading, isFetching } = trpc.ingredients.list.useQuery(
    {
      search: debouncedSearch || undefined,
      mineOnly: tab === 'mine',
      limit,
      offset: 0,
    },
    { placeholderData: (p) => p },
  );

  const utils = trpc.useUtils();
  const invalidate = () => {
    void utils.ingredients.list.invalidate();
    void utils.ingredients.search.invalidate();
  };

  const deleteMutation = trpc.ingredients.delete.useMutation({
    onSuccess: () => {
      setDeleteTarget(null);
      invalidate();
    },
  });

  const items = data?.items ?? [];

  const handleTabChange = (t: Tab) => {
    setTab(t);
    setLimit(PAGE_SIZE);
  };

  return (
    <div className="px-4 py-6 sm:px-6 sm:py-8">
      {/* Header */}
      <div className="mb-6 flex items-start justify-between gap-3">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-widest text-gray-500">
            Catalog
          </p>
          <h1 className="font-serif text-xl font-bold text-gray-900 sm:text-2xl">Ingredients</h1>
        </div>
        <button
          onClick={() => setShowCreate(true)}
          className="flex min-h-11 shrink-0 items-center gap-1.5 rounded-xl bg-[#944a00] px-4 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-[#7a3d00]"
        >
          <Plus className="h-4 w-4" />
          <span className="sm:hidden">Add</span>
          <span className="hidden sm:inline">Add Ingredient</span>
        </button>
      </div>

      {/* Tabs */}
      <div className="scroll-rail mb-4 gap-1 border-b">
        {(
          [
            { key: 'all', label: 'All Ingredients' },
            { key: 'mine', label: '✎ My Ingredients' },
          ] as const
        ).map(({ key, label }) => (
          <button
            key={key}
            onClick={() => handleTabChange(key)}
            className={`min-h-11 shrink-0 whitespace-nowrap px-4 text-sm font-medium transition-colors ${
              tab === key
                ? 'border-b-2 border-[#944a00] text-[#944a00]'
                : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {/* Search */}
      <div className="relative mb-6">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-500" />
        <input
          type="search"
          value={search}
          onChange={(e) => handleSearch(e.target.value)}
          placeholder="Search ingredients…"
          className="w-full rounded-xl border bg-white py-2.5 pl-9 pr-4 text-sm text-gray-800 placeholder-gray-400 focus:border-[#944a00] focus:outline-none"
        />
      </div>

      {/* Content */}
      {isLoading ? (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {Array.from({ length: 8 }, (_, i) => (
            <div key={i} className="h-28 animate-pulse rounded-2xl bg-gray-100" />
          ))}
        </div>
      ) : items.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed py-16 text-center">
          <span className="mb-3 text-4xl">🥕</span>
          <h2 className="mb-1 font-semibold text-gray-700">
            {tab === 'mine' ? 'No custom ingredients yet' : 'No ingredients found'}
          </h2>
          <p className="max-w-xs text-sm text-gray-500">
            {tab === 'mine'
              ? 'Ingredients you create are private to you and usable in your recipes.'
              : 'Try a different search term.'}
          </p>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {items.map((ing) => (
              <div
                key={ing.name}
                className="group flex gap-3 rounded-2xl border bg-white p-3 shadow-sm transition-all hover:shadow-md"
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={ing.imageUrl}
                  alt={ing.displayName}
                  className="h-16 w-16 shrink-0 rounded-xl object-cover"
                  onError={(e) => {
                    e.currentTarget.src = FALLBACK_IMAGE;
                  }}
                />
                <div className="min-w-0 flex-1">
                  <div className="flex items-start justify-between gap-1">
                    <p className="truncate text-sm font-semibold text-gray-900">
                      {ing.displayName}
                    </p>
                    {ing.isCustom && (
                      <span className="shrink-0 rounded-full bg-purple-100 px-1.5 py-0.5 text-[9px] font-semibold uppercase text-purple-700">
                        Mine
                      </span>
                    )}
                  </div>

                  {/* Macros per 100 g */}
                  {ing.caloriesPer100g != null ? (
                    <p className="mt-0.5 text-[11px] text-gray-500">
                      {Math.round(ing.caloriesPer100g)} kcal · P {ing.proteinPer100g ?? 0} · C{' '}
                      {ing.carbsPer100g ?? 0} · F {ing.fatPer100g ?? 0}{' '}
                      <span className="text-gray-500">/ 100 g</span>
                    </p>
                  ) : (
                    <p className="mt-0.5 text-[11px] italic text-gray-500">
                      Nutrition being estimated…
                    </p>
                  )}

                  {/* Price */}
                  <p className="mt-0.5 text-[11px] text-gray-500">
                    {ing.pricePer100gEur != null && <>~€{ing.pricePer100gEur.toFixed(2)}/100g </>}
                    {ing.pricePerPieceEur != null && <>~€{ing.pricePerPieceEur.toFixed(2)}/pc</>}
                  </p>

                  {/* Actions */}
                  {ing.canEdit && (
                    <div className="mt-1.5 flex gap-4">
                      <button
                        onClick={() => setEditTarget(ing)}
                        className="flex min-h-11 items-center gap-1 text-xs font-medium text-[#944a00] hover:underline sm:min-h-0 sm:text-[11px]"
                      >
                        <Pencil className="h-3 w-3" /> Edit
                      </button>
                      <button
                        onClick={() => setDeleteTarget(ing)}
                        className="flex min-h-11 items-center gap-1 text-xs font-medium text-red-500 hover:underline sm:min-h-0 sm:text-[11px]"
                      >
                        <Trash2 className="h-3 w-3" /> Delete
                      </button>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>

          {data?.hasMore && (
            <div className="mt-6 flex justify-center">
              <button
                onClick={() => setLimit((l) => l + PAGE_SIZE)}
                disabled={isFetching}
                className="flex items-center gap-2 rounded-xl border bg-white px-5 py-2 text-sm font-medium text-gray-600 hover:bg-gray-50 disabled:opacity-60"
              >
                {isFetching && (
                  <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-gray-300 border-t-[#944a00]" />
                )}
                {isFetching ? 'Loading…' : 'Load more'}
              </button>
            </div>
          )}
        </>
      )}

      {/* Create modal */}
      {showCreate && (
        <IngredientFormModal
          mode="create"
          onClose={() => setShowCreate(false)}
          onSaved={() => {
            setShowCreate(false);
            invalidate();
          }}
        />
      )}

      {/* Edit modal */}
      {editTarget && (
        <IngredientFormModal
          mode="edit"
          initial={editTarget}
          onClose={() => setEditTarget(null)}
          onSaved={() => {
            setEditTarget(null);
            invalidate();
          }}
        />
      )}

      {/* Delete confirmation */}
      <Sheet
        open={deleteTarget !== null}
        onClose={() => setDeleteTarget(null)}
        title="Delete ingredient?"
        size="sm"
        footer={
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <button
              onClick={() => setDeleteTarget(null)}
              className="min-h-11 rounded-xl border px-4 text-sm font-medium text-gray-600 hover:bg-gray-50"
            >
              Cancel
            </button>
            <button
              onClick={() => deleteTarget && deleteMutation.mutate({ name: deleteTarget.name })}
              disabled={deleteMutation.isPending}
              className="min-h-11 rounded-xl bg-red-600 px-4 text-sm font-semibold text-white hover:bg-red-700 disabled:opacity-50"
            >
              {deleteMutation.isPending ? 'Deleting…' : 'Delete'}
            </button>
          </div>
        }
      >
        <div className="px-5 pb-5">
          <p className="text-sm text-gray-500">
            &ldquo;{deleteTarget?.displayName}&rdquo; will be removed from the catalog.
            {deleteTarget &&
              !deleteTarget.isCustom &&
              ' Global ingredients may be re-added automatically with AI estimates if recipes still use them.'}
          </p>
          {deleteMutation.isError && (
            <p className="mt-2 text-xs text-red-500">{deleteMutation.error.message}</p>
          )}
        </div>
      </Sheet>
    </div>
  );
}
