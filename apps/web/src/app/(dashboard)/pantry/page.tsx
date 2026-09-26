'use client';

import Link from 'next/link';
import { useState } from 'react';
import { PantryConfirmSheet } from '@/features/pantry/components/PantryConfirmSheet';
import { UpgradeButton } from '@/features/premium/components/UpgradeButton';
import { useEntitlement } from '@/hooks/useEntitlement';
import { trpc } from '@/lib/trpc';
import { ClipboardCheck, Lock, Plus, Refrigerator, Trash2 } from 'lucide-react';

// ─── Pantry page (F3 Zero-Waste Kitchen) ─────────────────────────────────────
// What Chefer knows the user has. Rows arrive from shopping-list check-offs
// (PURCHASE) or manual adds (MANUAL); oldest items list first — those are the
// ones generation tries to use up. Free tier sees the page READ-ONLY with the
// upsell (§6.4, source `pantry`); management (add / remove / weekly confirm)
// is premium.

const UNIT_OPTIONS = ['pcs', 'g', 'kg', 'ml', 'l', 'pack', 'can', 'bunch'];

function ageLabel(updatedAt: Date | string): string {
  const days = Math.max(
    0,
    Math.floor((Date.now() - new Date(updatedAt).getTime()) / (24 * 60 * 60 * 1000)),
  );
  if (days === 0) return 'today';
  if (days === 1) return 'yesterday';
  if (days < 14) return `${days} days ago`;
  return `${Math.floor(days / 7)} weeks ago`;
}

export default function PantryPage() {
  const { enabled, isPremium } = useEntitlement('pantryPlanning');
  // Show the upsell only once we KNOW the account is free — while the user
  // is loading neither the upsell nor the premium controls render.
  const locked = isPremium === false;
  const { data, isLoading } = trpc.pantry.list.useQuery(undefined, { staleTime: 30_000 });
  const utils = trpc.useUtils();
  const [confirmOpen, setConfirmOpen] = useState(false);

  const [name, setName] = useState('');
  const [quantity, setQuantity] = useState('');
  const [unit, setUnit] = useState('pcs');

  const invalidate = () => {
    void utils.pantry.list.invalidate();
    void utils.shoppingList.getForWeek.invalidate();
  };
  const addMutation = trpc.pantry.addItem.useMutation({
    onSuccess: () => {
      setName('');
      setQuantity('');
      invalidate();
    },
  });
  const removeMutation = trpc.pantry.removeItem.useMutation({ onSuccess: invalidate });

  const handleAdd = () => {
    if (!name.trim() || addMutation.isPending) return;
    const qty = parseFloat(quantity.replace(',', '.'));
    addMutation.mutate({
      name: name.trim(),
      ...(Number.isFinite(qty) && qty > 0 ? { quantity: qty } : {}),
      unit,
    });
  };

  const items = data?.items ?? [];

  return (
    <div className="mx-auto max-w-3xl p-4 lg:p-6">
      {/* Header */}
      <div className="mb-4">
        <p className="text-xs font-semibold uppercase tracking-widest text-neutral-500">
          YOUR KITCHEN
        </p>
        <div className="mt-1 flex flex-wrap items-center justify-between gap-3">
          <h1 className="text-xl font-bold tracking-tight sm:text-2xl">Pantry</h1>
          {enabled && items.length > 0 && (
            <button
              type="button"
              onClick={() => setConfirmOpen(true)}
              className="flex min-h-11 items-center gap-1.5 rounded-xl border border-neutral-200 px-3 py-1.5 text-xs font-medium text-neutral-600 transition hover:bg-neutral-50 sm:min-h-0"
            >
              <ClipboardCheck className="h-3.5 w-3.5 shrink-0" />
              Still have these?
            </button>
          )}
        </div>
        <p className="mt-1 text-sm text-neutral-500">
          Checked-off{' '}
          <Link href="/shopping-list" className="underline underline-offset-2">
            shopping list
          </Link>{' '}
          items land here automatically. The longest-sitting items are used first in your plans.
        </p>
      </div>

      {/* Free-tier upsell — the page stays visible read-only (§6.4) */}
      {locked && (
        <div className="mb-4 rounded-2xl border border-amber-200 bg-gradient-to-br from-amber-50 to-orange-50 p-4">
          <div className="flex items-start gap-3">
            <Lock className="mt-0.5 h-5 w-5 shrink-0 text-[#944a00]" aria-hidden="true" />
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold text-gray-900">
                Chefer sees your kitchen — premium cooks from it.
              </p>
              <p className="mt-1 text-sm text-gray-700">
                Premium plans use these items up before they go to waste, subtract them from your
                shopping list, and show what you saved each week.
              </p>
              <div className="mt-3">
                <UpgradeButton source="pantry" />
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Manual add (premium) */}
      {enabled && (
        <div className="mb-4 flex gap-2">
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                handleAdd();
              }
            }}
            placeholder="Add something you have… e.g. rice"
            aria-label="Add an item to your kitchen"
            disabled={addMutation.isPending}
            className="min-h-11 min-w-0 flex-1 rounded-xl border border-neutral-200 px-3 py-2 text-base focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary disabled:opacity-50 sm:text-sm"
          />
          <input
            value={quantity}
            onChange={(e) => setQuantity(e.target.value)}
            inputMode="decimal"
            placeholder="Qty"
            aria-label="Quantity (optional)"
            disabled={addMutation.isPending}
            className="min-h-11 w-16 rounded-xl border border-neutral-200 px-2 py-2 text-base focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary disabled:opacity-50 sm:text-sm"
          />
          <select
            value={unit}
            onChange={(e) => setUnit(e.target.value)}
            aria-label="Unit"
            disabled={addMutation.isPending}
            className="min-h-11 w-20 shrink-0 rounded-xl border border-neutral-200 px-2 py-2 text-base focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary disabled:opacity-50 sm:text-sm"
          >
            {UNIT_OPTIONS.map((u) => (
              <option key={u} value={u}>
                {u}
              </option>
            ))}
          </select>
          <button
            type="button"
            onClick={handleAdd}
            disabled={!name.trim() || addMutation.isPending}
            aria-label="Add to pantry"
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-neutral-200 text-neutral-600 transition hover:bg-neutral-50 disabled:opacity-40"
          >
            <Plus className="h-4 w-4" />
          </button>
        </div>
      )}
      {addMutation.isError && (
        <p className="mb-3 text-sm text-red-600">{addMutation.error.message}</p>
      )}

      {/* Item list */}
      {isLoading ? (
        <div className="space-y-2">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="h-14 animate-pulse rounded-xl bg-neutral-100" />
          ))}
        </div>
      ) : items.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-neutral-200 py-16 text-center">
          <Refrigerator className="mb-4 h-10 w-10 text-neutral-300" />
          <h2 className="mb-2 font-semibold text-neutral-700">Nothing tracked yet</h2>
          <p className="mb-6 max-w-xs text-sm text-neutral-500">
            Check items off your shopping list while you shop — everything you buy lands here.
          </p>
          <Link
            href="/shopping-list"
            className="inline-flex min-h-11 items-center rounded-xl bg-primary px-5 py-2.5 text-sm font-medium text-white transition hover:bg-primary/90"
          >
            Open Shopping List
          </Link>
        </div>
      ) : (
        <div className="space-y-2">
          {items.map((item) => (
            <div
              key={item.id}
              className="flex items-center gap-1 rounded-xl border border-neutral-200 bg-white"
            >
              <div className="flex min-h-11 min-w-0 flex-1 items-center gap-3 p-2 sm:p-3">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium capitalize text-neutral-800">
                    {item.ingredientName}
                  </p>
                  <p className="truncate text-xs text-neutral-500">
                    {item.quantity != null ? `${item.quantity} ${item.unit}` : 'some left'}
                    <span className="ml-2">
                      {item.source === 'PURCHASE' ? 'bought' : 'added'} {ageLabel(item.updatedAt)}
                    </span>
                  </p>
                </div>
              </div>
              {enabled && (
                <button
                  type="button"
                  onClick={() => removeMutation.mutate({ id: item.id })}
                  disabled={removeMutation.isPending}
                  aria-label={`Remove ${item.ingredientName} from your kitchen`}
                  className="mr-1 flex h-11 w-11 shrink-0 items-center justify-center rounded-lg text-neutral-300 transition hover:bg-red-50 hover:text-red-500 disabled:opacity-50"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              )}
            </div>
          ))}
          <p className="pt-2 text-xs text-neutral-500">
            Staples like salt, pepper, oil and water are always assumed on hand — they&apos;re never
            tracked here.
          </p>
        </div>
      )}

      <PantryConfirmSheet open={confirmOpen} onClose={() => setConfirmOpen(false)} />
    </div>
  );
}
