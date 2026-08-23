'use client';

import { FREE_EQUIVALENT_LABELS } from '@/features/premium/premium-features';
import { Check, Minus } from 'lucide-react';
import { PLAN_FEATURES, type FeatureAccess, type PlanFeatureKey } from '@chefer/types';

// ─── Free vs Premium comparison (premium_plan.md §6.2, principle 3) ──────────
// Rendered ENTIRELY from the PLAN_FEATURES matrix — the PW-1 principle
// extended to marketing: pricing copy and enforcement cannot drift because
// they are the same object. Perk rows first, then the limit plumbing.

const KEYS = Object.keys(PLAN_FEATURES) as PlanFeatureKey[];
const ORDERED_KEYS = [
  ...KEYS.filter((k) => PLAN_FEATURES[k].upsell),
  ...KEYS.filter((k) => !PLAN_FEATURES[k].upsell),
];

function AccessCell({
  access,
  perDay,
  freeLabel,
}: {
  access: FeatureAccess;
  perDay: boolean;
  /** Named free equivalent (review P-4) — shown instead of a dash. */
  freeLabel?: string | undefined;
}) {
  if (access === false || access === 0) {
    if (freeLabel) {
      return <span className="text-xs text-neutral-500">{freeLabel}</span>;
    }
    return <Minus aria-label="Not included" className="mx-auto h-4 w-4 text-neutral-300" />;
  }
  if (access === true) {
    return <Check aria-label="Included" className="mx-auto h-4 w-4 text-emerald-500" />;
  }
  return (
    <span className="text-xs font-semibold text-neutral-700">
      {access}
      {perDay ? '/day' : ''}
    </span>
  );
}

export function PremiumComparisonTable() {
  return (
    <div className="overflow-x-auto rounded-2xl border bg-white shadow-sm">
      <table className="w-full min-w-[28rem] text-left text-sm">
        <thead>
          <tr className="border-b bg-neutral-50 text-xs uppercase tracking-wider text-neutral-500">
            <th scope="col" className="px-4 py-3 font-semibold">
              What you get
            </th>
            <th scope="col" className="w-24 px-2 py-3 text-center font-semibold">
              Free
            </th>
            <th scope="col" className="w-24 px-2 py-3 text-center font-semibold text-amber-600">
              Premium
            </th>
          </tr>
        </thead>
        <tbody>
          {ORDERED_KEYS.map((key) => {
            const feature = PLAN_FEATURES[key];
            // Numeric access means "daily limit" (FeatureAccess contract) —
            // householdMembers is the one absolute cap.
            const perDay = key !== 'householdMembers';
            return (
              <tr key={key} className="border-b last:border-b-0">
                <th scope="row" className="px-4 py-3 font-medium text-neutral-800">
                  {feature.label}
                  <span className="mt-0.5 block text-xs font-normal text-neutral-500">
                    {feature.description}
                  </span>
                </th>
                <td className="px-2 py-3 text-center">
                  <AccessCell
                    access={feature.free}
                    perDay={perDay}
                    freeLabel={FREE_EQUIVALENT_LABELS[key]}
                  />
                </td>
                <td className="bg-amber-50/50 px-2 py-3 text-center">
                  <AccessCell access={feature.premium} perDay={perDay} />
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
