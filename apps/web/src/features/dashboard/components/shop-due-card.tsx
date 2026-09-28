'use client';

import Link from 'next/link';
import type { RouterOutputs } from '@/lib/trpc';
import { ShoppingCart } from 'lucide-react';

// ─── Shop-due card (UX-04 §4, T-04.2/T-04.7) ────────────────────────────────────
// Unticked shopping-list lines used by tomorrow's planned meals. Hidden when
// there's nothing due (dashboard.summary already returns null in that case).

type ShopDue = NonNullable<RouterOutputs['dashboard']['summary']['shopDue']>;

export function ShopDueCard({ shopDue }: { shopDue: ShopDue }) {
  const sample = shopDue.sample.join(', ');
  const more = shopDue.count - shopDue.sample.length;

  return (
    <Link
      href="/shopping-list"
      data-testid="shop-due-card"
      className="flex items-center gap-3 rounded-2xl border bg-white p-4 shadow-sm transition hover:border-[#944a00]/30"
    >
      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[#fff3e8] text-[#944a00]">
        <ShoppingCart className="h-4 w-4" aria-hidden="true" />
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold text-gray-900">
          {shopDue.count} thing{shopDue.count === 1 ? '' : 's'} to buy for tomorrow
        </p>
        <p className="truncate text-xs text-gray-500">
          {sample}
          {more > 0 ? ` and ${more} more` : ''}
        </p>
      </div>
      <span className="shrink-0 text-sm font-semibold text-[#944a00]">Open list</span>
    </Link>
  );
}
