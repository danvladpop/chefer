'use client';

import { useEffect, useRef } from 'react';
import { UpgradeButton } from '@/features/premium/components/UpgradeButton';
import { capture } from '@/lib/analytics';
import { trpc } from '@/lib/trpc';
import { Refrigerator } from 'lucide-react';
import type { DisplayCurrency } from '@chefer/types';
import { formatMoney } from '@chefer/utils';

// ─── Pantry ghost state (F3, §6.4) ───────────────────────────────────────────
// Free tier, shopping list header, after any check-off session: their
// check-offs REALLY seeded PantryItem rows, so both numbers are real —
// "You now have N items in your kitchen" + "this week that would have saved
// ~€X" (Σ estimated prices of the list items the pantry covers). Fires
// upgrade_prompt_shown {source:'pantry'} as the impression and
// teaser_engaged {feature:'pantry'} on interaction.

export function PantryGhostBanner({
  savedEur,
  currency = 'EUR',
}: {
  savedEur: number;
  /** Display currency — savedEur is converted for display (P2-6). */
  currency?: DisplayCurrency;
}) {
  // Live count (pantry.list is invalidated after every check-off) so the
  // banner appears mid-session, right after the first items are seeded.
  const { data } = trpc.pantry.list.useQuery(undefined, { staleTime: 15_000 });
  const itemCount = data?.count ?? 0;

  const impressionFired = useRef(false);
  useEffect(() => {
    if (itemCount > 0 && !impressionFired.current) {
      impressionFired.current = true;
      capture('upgrade_prompt_shown', { source: 'pantry' });
    }
  }, [itemCount]);

  const engagementFired = useRef(false);
  const fireTeaserEngaged = () => {
    if (engagementFired.current) return;
    engagementFired.current = true;
    capture('teaser_engaged', { feature: 'pantry' });
  };

  if (itemCount === 0) return null;

  return (
    <div
      onClickCapture={fireTeaserEngaged}
      className="rounded-2xl border border-amber-200 bg-gradient-to-br from-amber-50 to-orange-50 p-4"
      data-print-hide
    >
      <div className="flex items-start gap-3">
        <Refrigerator className="mt-0.5 h-5 w-5 shrink-0 text-[#944a00]" aria-hidden="true" />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-gray-900">
            You now have {itemCount} item{itemCount !== 1 ? 's' : ''} in your kitchen — premium
            plans cook from them.
          </p>
          <p className="mt-1 text-sm text-gray-700">
            {savedEur > 0
              ? `This week that would have saved ~${formatMoney(savedEur, currency)} off this list.`
              : 'Premium plans use them up before they go to waste — and subtract them from this list.'}
          </p>
          <div className="mt-3">
            <UpgradeButton source="pantry" />
          </div>
        </div>
      </div>
    </div>
  );
}
