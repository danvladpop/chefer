'use client';

import { useEffect, useId, useState } from 'react';
import {
  IngredientFormModal,
  type CatalogListItem,
} from '@/features/ingredients/components/IngredientFormModal';
import { SourceBadge } from '@/features/ingredients/components/SourceBadge';
import { useCurrency } from '@/hooks/useCurrency';
import { trpc } from '@/lib/trpc';
import { Pencil, Plus, Search, Trash2 } from 'lucide-react';
import { INGREDIENT_CATEGORIES, type IngredientCategory } from '@chefer/types';
import { cn, pressControl, Sheet } from '@chefer/ui';
import { formatMoney, INGREDIENT_CATEGORY_LABELS, normalizeIngredientKey } from '@chefer/utils';

// ─── Ingredients page (plan-ingredient-catalog §10) ───────────────────────────
// The catalog recipes compute from: Chefer's global rows (nutrition from USDA
// FoodData Central or CIQUAL, read-only — D7) plus the user's own private
// ingredients (from their labels, fully editable). Each card shows where the
// numbers come from, the other names it answers to and its portions. Admins
// can still edit a global row's price and image.

type Tab = 'all' | 'mine';

const PAGE_SIZE = 60;

const FALLBACK_IMAGE =
  'https://images.unsplash.com/photo-1490645935967-10de6ba17061?w=120&h=120&fit=crop&q=80';

const fmt = (n: number) => String(Math.round(n * 10) / 10);

export default function IngredientsPage() {
  const [tab, setTab] = useState<Tab>('all');
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [category, setCategory] = useState<IngredientCategory | ''>('');
  const [editTarget, setEditTarget] = useState<CatalogListItem | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<CatalogListItem | null>(null);
  const currency = useCurrency();
  const searchId = useId();
  const categoryId = useId();

  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search.trim()), 300);
    return () => clearTimeout(t);
  }, [search]);

  const query = trpc.ingredients.catalogList.useInfiniteQuery(
    {
      search: debouncedSearch || undefined,
      category: category || undefined,
      mineOnly: tab === 'mine',
      limit: PAGE_SIZE,
    },
    {
      getNextPageParam: (last) => last.nextCursor ?? undefined,
      placeholderData: (p) => p,
    },
  );

  const utils = trpc.useUtils();
  const invalidate = () => {
    void utils.ingredients.catalogList.invalidate();
    void utils.ingredients.search.invalidate();
    void utils.ingredients.getMany.invalidate();
    void utils.ingredients.list.invalidate();
  };

  const deleteMutation = trpc.ingredients.delete.useMutation({
    onSuccess: () => {
      setDeleteTarget(null);
      invalidate();
    },
  });

  const items = query.data?.pages.flatMap((p) => p.items) ?? [];

  return (
    <div className="px-4 py-6 sm:px-6 sm:py-8">
      {/* Header */}
      <div className="mb-2 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs font-semibold uppercase tracking-wider text-gray-500">Catalog</p>
          <h1 className="font-serif text-xl font-bold text-gray-900 sm:text-2xl">Ingredients</h1>
        </div>
        <button
          type="button"
          onClick={() => setShowCreate(true)}
          className={cn(
            'flex min-h-11 shrink-0 items-center gap-1.5 rounded-xl bg-[#944a00] px-4 text-sm font-semibold text-white shadow-sm hover:bg-[#7a3d00]',
            pressControl,
          )}
        >
          <Plus className="h-4 w-4" aria-hidden="true" />
          <span className="sm:hidden">Add</span>
          <span className="hidden sm:inline">Add my ingredient</span>
        </button>
      </div>
      <p className="mb-5 max-w-2xl text-sm text-gray-600">
        Recipe nutrition is computed from these. Chefer&apos;s ingredients use published food data
        (USDA, CIQUAL); your own ingredients use the label values you enter.
      </p>

      {/* Tabs */}
      <div className="scroll-rail mb-4 gap-1 border-b" role="group" aria-label="Which ingredients">
        {(
          [
            { key: 'all', label: 'All ingredients' },
            { key: 'mine', label: 'My ingredients' },
          ] as const
        ).map(({ key, label }) => (
          <button
            key={key}
            type="button"
            aria-pressed={tab === key}
            onClick={() => setTab(key)}
            className={cn(
              'min-h-11 shrink-0 whitespace-nowrap px-4 text-sm font-medium',
              pressControl,
              tab === key
                ? 'border-b-2 border-[#944a00] text-[#944a00]'
                : 'text-gray-600 hover:text-gray-800',
            )}
          >
            {label}
          </button>
        ))}
      </div>

      {/* Search + category */}
      <div className="mb-6 flex flex-col gap-3 sm:flex-row">
        <div className="relative min-w-0 flex-1">
          <label htmlFor={searchId} className="sr-only">
            Search ingredients
          </label>
          <Search
            aria-hidden="true"
            className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-500"
          />
          <input
            id={searchId}
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search in English or Romanian…"
            className="w-full rounded-xl border bg-white py-2.5 pl-9 pr-4 text-sm text-gray-800 placeholder-gray-500 focus:border-[#944a00] focus:outline-none"
          />
        </div>
        <div className="sm:w-56">
          <label htmlFor={categoryId} className="sr-only">
            Category
          </label>
          <select
            id={categoryId}
            value={category}
            onChange={(e) => setCategory(e.target.value as IngredientCategory | '')}
            className="min-h-11 w-full rounded-xl border bg-white px-3 text-sm text-gray-800 focus:border-[#944a00] focus:outline-none"
          >
            <option value="">All categories</option>
            {INGREDIENT_CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {INGREDIENT_CATEGORY_LABELS[c]}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Content */}
      {query.isLoading ? (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {Array.from({ length: 8 }, (_, i) => (
            <div key={i} className="h-36 animate-pulse rounded-2xl bg-gray-100" />
          ))}
        </div>
      ) : items.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed py-16 text-center">
          <span className="mb-3 text-4xl" aria-hidden="true">
            🥕
          </span>
          <h2 className="mb-1 font-semibold text-gray-700">
            {tab === 'mine' && !debouncedSearch && !category
              ? 'No ingredients of your own yet'
              : 'No ingredients found'}
          </h2>
          <p className="max-w-xs text-sm text-gray-600">
            {tab === 'mine' && !debouncedSearch && !category
              ? 'Add one when Chefer’s catalog lacks something you cook with — only you see it.'
              : 'Try another word or category.'}
          </p>
        </div>
      ) : (
        <>
          <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {items.map((ing) => (
              <IngredientCard
                key={ing.id}
                ing={ing}
                currencyFormat={(eur) => formatMoney(eur, currency)}
                onEdit={() => setEditTarget(ing)}
                onDelete={() => setDeleteTarget(ing)}
              />
            ))}
          </ul>

          {query.hasNextPage && (
            <div className="mt-6 flex justify-center">
              <button
                type="button"
                onClick={() => void query.fetchNextPage()}
                disabled={query.isFetchingNextPage}
                className={cn(
                  'flex min-h-11 items-center gap-2 rounded-xl border bg-white px-5 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-60',
                  pressControl,
                )}
              >
                {query.isFetchingNextPage && (
                  <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-gray-300 border-t-[#944a00]" />
                )}
                {query.isFetchingNextPage ? 'Loading…' : 'Load more'}
              </button>
            </div>
          )}
        </>
      )}

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

      {editTarget && (
        <IngredientFormModal
          mode="edit"
          item={editTarget}
          onClose={() => setEditTarget(null)}
          onSaved={() => {
            setEditTarget(null);
            invalidate();
          }}
        />
      )}

      {/* Delete confirmation — own private rows only */}
      <Sheet
        open={deleteTarget !== null}
        onClose={() => setDeleteTarget(null)}
        title="Delete this ingredient?"
        size="sm"
        footer={
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <button
              type="button"
              onClick={() => setDeleteTarget(null)}
              className={cn(
                'min-h-11 rounded-xl border px-4 text-sm font-medium text-gray-700 hover:bg-gray-50',
                pressControl,
              )}
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={() =>
                deleteTarget &&
                deleteMutation.mutate({
                  id: deleteTarget.id,
                  name: (deleteTarget.priceRowName ?? deleteTarget.name).slice(0, 60),
                })
              }
              disabled={deleteMutation.isPending}
              className={cn(
                'min-h-11 rounded-xl bg-red-600 px-4 text-sm font-semibold text-white hover:bg-red-700 disabled:opacity-50',
                pressControl,
              )}
            >
              {deleteMutation.isPending ? 'Deleting…' : 'Delete'}
            </button>
          </div>
        }
      >
        <div className="px-5 pb-5">
          <p className="text-sm text-gray-600">
            &ldquo;{deleteTarget?.name}&rdquo; leaves your ingredients and search. Recipes that
            already use it keep their numbers.
          </p>
          {deleteMutation.isError && (
            <p role="alert" className="mt-2 text-sm text-red-600">
              {deleteMutation.error.message}
            </p>
          )}
        </div>
      </Sheet>
    </div>
  );
}

function IngredientCard({
  ing,
  currencyFormat,
  onEdit,
  onDelete,
}: {
  ing: CatalogListItem;
  currencyFormat: (eur: number) => string;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const n = ing.per100g;
  const ownKey = normalizeIngredientKey(ing.name);
  const otherNames = ing.aliases.map((a) => a.alias).filter((a) => a !== ownKey);
  const prices = ing.prices;
  return (
    <li
      className="flex min-w-0 gap-3 rounded-2xl border bg-white p-3 shadow-e1"
      data-testid="ingredient-card"
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={ing.imageUrl}
        alt=""
        className="h-16 w-16 shrink-0 rounded-xl object-cover"
        onError={(e) => {
          e.currentTarget.src = FALLBACK_IMAGE;
        }}
      />
      <div className="min-w-0 flex-1">
        <div className="flex items-start justify-between gap-2">
          <h2 className="min-w-0 text-sm font-semibold leading-snug text-gray-900">{ing.name}</h2>
          <SourceBadge source={ing.nutritionSource} owner={ing.owner} />
        </div>
        <p className="text-xs text-gray-500">{INGREDIENT_CATEGORY_LABELS[ing.category]}</p>

        <p className="mt-1 text-xs text-gray-700">
          {Math.round(n.calories)} kcal · P {fmt(n.protein)} · C {fmt(n.carbs)} · F {fmt(n.fat)} ·
          Fiber {fmt(n.fiber)} <span className="text-gray-500">/ 100 g</span>
        </p>

        {ing.portions.length > 0 && (
          <p className="mt-0.5 text-xs text-gray-600">
            {ing.portions
              .slice(0, 4)
              .map((p) => `1 ${p.unit} = ${fmt(p.grams)} g`)
              .join(' · ')}
            {ing.portions.length > 4 ? ` · +${ing.portions.length - 4}` : ''}
          </p>
        )}

        {prices && (prices.per100gEur != null || prices.perPieceEur != null) && (
          <p className="mt-0.5 text-xs text-gray-600">
            {prices.per100gEur != null && <>~{currencyFormat(prices.per100gEur)}/100 g </>}
            {prices.perPieceEur != null && <>~{currencyFormat(prices.perPieceEur)}/piece</>}
          </p>
        )}

        {otherNames.length > 0 && (
          <details className="mt-1 text-xs text-gray-600">
            <summary className="flex min-h-11 cursor-pointer items-center font-medium text-[#944a00] sm:min-h-0 sm:py-1">
              Also called ({otherNames.length})
            </summary>
            <p className="mt-0.5 break-words">{otherNames.join(', ')}</p>
          </details>
        )}

        {ing.editable !== 'none' && (
          <div className="mt-1 flex flex-wrap gap-x-4">
            <button
              type="button"
              onClick={onEdit}
              aria-label={`${ing.editable === 'full' ? 'Edit' : 'Edit price and image of'} ${ing.name}`}
              className="flex min-h-11 items-center gap-1 text-xs font-medium text-[#944a00] hover:underline"
            >
              <Pencil className="h-3 w-3" aria-hidden="true" />
              {ing.editable === 'full' ? 'Edit' : 'Price & image'}
            </button>
            {ing.editable === 'full' && (
              <button
                type="button"
                onClick={onDelete}
                aria-label={`Delete ${ing.name}`}
                className="flex min-h-11 items-center gap-1 text-xs font-medium text-red-600 hover:underline"
              >
                <Trash2 className="h-3 w-3" aria-hidden="true" />
                Delete
              </button>
            )}
          </div>
        )}
      </div>
    </li>
  );
}
