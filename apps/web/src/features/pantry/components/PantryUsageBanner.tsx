'use client';

import { useEffect, useRef } from 'react';
import { capture } from '@/lib/analytics';
import { Refrigerator } from 'lucide-react';

// ─── "Uses N things you already have" banner (F3) ────────────────────────────
// Renders the pantry line of a premium generation's `personalisation`
// (`usedPantryItems` — computed server-side by
// application/pantry/pantry-context.ts#computeUsedPantryItemsForUser) and
// fires `plan_used_pantry {itemCount}` once per mount.
//
// INTEGRATION NOTE (wave-2 integrator): mount on the meal-plan page next to
// the existing P1-1 personalisation banner:
//   <PantryUsageBanner usedPantryItems={personalisation?.usedPantryItems ?? []} />

export function PantryUsageBanner({ usedPantryItems }: { usedPantryItems: string[] }) {
  const fired = useRef(false);
  const count = usedPantryItems.length;

  useEffect(() => {
    if (count > 0 && !fired.current) {
      fired.current = true;
      capture('plan_used_pantry', { itemCount: count });
    }
  }, [count]);

  if (count === 0) return null;

  const shown = usedPantryItems.slice(0, 4);
  const more = count - shown.length;

  return (
    <div className="flex items-start gap-2 rounded-2xl border border-emerald-200 bg-emerald-50 p-3">
      <Refrigerator className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" aria-hidden="true" />
      <p className="min-w-0 text-sm text-emerald-900">
        This week uses <strong>{count}</strong> thing{count !== 1 ? 's' : ''} you already have:{' '}
        <span className="capitalize">{shown.join(', ')}</span>
        {more > 0 ? ` and ${more} more` : ''} — less waste, smaller shop.
      </p>
    </div>
  );
}
