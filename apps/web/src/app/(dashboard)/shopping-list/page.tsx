'use client';

import Link from 'next/link';
import { useState } from 'react';
import { trpc } from '@/lib/trpc';
import { Check, Printer, ShoppingCart } from 'lucide-react';

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function ShoppingListPage() {
  const { data: groups, isLoading } = trpc.mealPlan.getShoppingList.useQuery();
  // Track checked items in local state (keyed by "name")
  const [checked, setChecked] = useState<Set<string>>(new Set());

  const toggle = (key: string) => {
    setChecked((prev) => {
      const next = new Set(prev);
      next.has(key) ? next.delete(key) : next.add(key);
      return next;
    });
  };

  if (isLoading) return <ShoppingListSkeleton />;

  const hasItems = groups && groups.some((g) => g.items.length > 0);

  if (!hasItems) {
    return (
      <div className="flex flex-col items-center justify-center gap-4 px-6 py-20 text-center">
        <ShoppingCart className="h-12 w-12 text-gray-300" />
        <div>
          <h2 className="font-serif text-xl font-semibold text-gray-900">No shopping list yet</h2>
          <p className="mt-1 text-sm text-gray-500">
            Generate a meal plan to automatically build your grocery list.
          </p>
        </div>
        <Link
          href="/meal-plan"
          className="rounded-full bg-[#944a00] px-5 py-2.5 text-sm font-semibold text-white hover:bg-[#7a3d00]"
        >
          Go to Meal Planner →
        </Link>
      </div>
    );
  }

  const totalItems = groups!.reduce((sum, g) => sum + g.items.length, 0);
  const checkedCount = checked.size;

  return (
    <div className="mx-auto max-w-2xl px-6 py-8">
      {/* Header */}
      <div className="mb-6 flex items-start justify-between">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-widest text-gray-400">
            This Week
          </p>
          <h1 className="font-serif text-2xl font-bold text-gray-900">Shopping List</h1>
          <p className="mt-1 text-sm text-gray-500">
            {checkedCount} of {totalItems} items checked off
          </p>
        </div>
        <button
          onClick={() => window.print()}
          className="flex items-center gap-1.5 rounded-xl border px-3 py-2 text-sm text-gray-600 hover:border-gray-300 hover:bg-gray-50"
        >
          <Printer className="h-4 w-4" />
          Print
        </button>
      </div>

      {/* Progress bar */}
      <div className="mb-6 h-2 w-full overflow-hidden rounded-full bg-gray-100">
        <div
          className="h-full rounded-full bg-[#944a00] transition-all"
          style={{ width: `${Math.round((checkedCount / totalItems) * 100)}%` }}
        />
      </div>

      {/* Grouped items */}
      <div className="flex flex-col gap-6">
        {groups!.map((group) => (
          <div key={group.category}>
            <h2 className="mb-2 text-[11px] font-semibold uppercase tracking-widest text-gray-400">
              {group.category}
            </h2>
            <div className="overflow-hidden rounded-2xl border bg-white shadow-sm">
              {group.items.map((item, idx) => {
                const key = item.name;
                const isDone = checked.has(key);
                return (
                  <button
                    key={idx}
                    onClick={() => toggle(key)}
                    className={`flex w-full items-center gap-4 border-b px-5 py-3.5 text-left last:border-b-0 transition-colors hover:bg-gray-50 ${isDone ? 'opacity-50' : ''}`}
                  >
                    <span
                      className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2 transition-colors ${
                        isDone ? 'border-[#944a00] bg-[#944a00]' : 'border-gray-300'
                      }`}
                    >
                      {isDone && <Check className="h-3 w-3 text-white" />}
                    </span>
                    <span
                      className={`flex-1 text-sm font-medium capitalize ${isDone ? 'line-through text-gray-400' : 'text-gray-800'}`}
                    >
                      {item.name}
                    </span>
                    <span className="text-sm text-gray-400">
                      {item.quantity % 1 === 0 ? item.quantity : item.quantity.toFixed(1)}{' '}
                      {item.unit}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </div>

      {/* Chef's Tip */}
      <div className="mt-6 flex items-start gap-3 rounded-2xl bg-[#fff3e8] px-5 py-4">
        <span className="text-xl" aria-hidden="true">
          💡
        </span>
        <p className="text-sm text-[#7a3d00]">
          <strong>Chef&apos;s Tip:</strong> Shop produce last so it stays fresh during the rest of
          your shopping trip. Store high-protein items with airtight packaging for meal prep.
        </p>
      </div>
    </div>
  );
}

// ─── Skeleton ─────────────────────────────────────────────────────────────────

function ShoppingListSkeleton() {
  return (
    <div className="mx-auto max-w-2xl animate-pulse px-6 py-8">
      <div className="mb-6 h-10 w-48 rounded-xl bg-gray-100" />
      <div className="mb-6 h-2 w-full rounded-full bg-gray-100" />
      {[1, 2, 3].map((i) => (
        <div key={i} className="mb-6">
          <div className="mb-2 h-3 w-24 rounded bg-gray-100" />
          <div className="overflow-hidden rounded-2xl border bg-white">
            {[1, 2, 3].map((j) => (
              <div key={j} className="flex items-center gap-4 border-b px-5 py-3.5 last:border-b-0">
                <div className="h-5 w-5 rounded-full bg-gray-100" />
                <div className="h-4 flex-1 rounded bg-gray-100" />
                <div className="h-4 w-16 rounded bg-gray-100" />
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
