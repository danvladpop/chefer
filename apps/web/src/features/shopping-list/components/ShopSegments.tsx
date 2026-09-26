'use client';

import Link from 'next/link';
import { cn } from '@chefer/utils';

// ─── Shop = "To buy" / "In my kitchen" (P2-8, PM review §5) ──────────────────
// The pantry used to be its own nav destination next to the shopping list,
// with a "Kitchen (3)" chip linking across. Both halves of the same job now
// sit under one Shop tab as segments; /pantry redirects to the kitchen one.

export type ShopView = 'list' | 'kitchen';

export function shopViewFromParam(value: string | null): ShopView {
  return value === 'kitchen' ? 'kitchen' : 'list';
}

export function shopViewHref(view: ShopView): string {
  return view === 'kitchen' ? '/shopping-list?view=kitchen' : '/shopping-list';
}

interface ShopSegmentsProps {
  view: ShopView;
  /** Items in the kitchen, shown on the segment when known. */
  kitchenCount?: number | undefined;
  className?: string;
}

export function ShopSegments({ view, kitchenCount, className }: ShopSegmentsProps) {
  const segments: { key: ShopView; label: string }[] = [
    { key: 'list', label: 'To buy' },
    {
      key: 'kitchen',
      label: kitchenCount ? `In my kitchen (${kitchenCount})` : 'In my kitchen',
    },
  ];
  return (
    <nav
      aria-label="Shop sections"
      data-print-hide
      className={cn('grid grid-cols-2 gap-1 rounded-xl bg-neutral-100 p-1', className)}
    >
      {segments.map(({ key, label }) => {
        const active = view === key;
        return (
          <Link
            key={key}
            href={shopViewHref(key)}
            replace
            scroll={false}
            aria-current={active ? 'page' : undefined}
            data-testid={`shop-segment-${key}`}
            className={cn(
              'flex min-h-11 min-w-0 items-center justify-center rounded-lg px-2 text-sm font-semibold transition',
              active
                ? 'bg-white text-[#944a00] shadow-sm'
                : 'text-neutral-600 hover:text-neutral-900',
            )}
          >
            <span className="truncate">{label}</span>
          </Link>
        );
      })}
    </nav>
  );
}
