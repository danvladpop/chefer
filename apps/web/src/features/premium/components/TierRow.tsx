'use client';

import { UpgradeButton } from '@/features/premium/components/UpgradeButton';
import { useIsPremium } from '@/hooks/useIsPremium';
import { ChevronRight, Star } from 'lucide-react';
import { pressCard } from '@chefer/ui';
import { cn, PREMIUM_PITCH_COPY } from '@chefer/utils';

// F6/F7 (owner feedback 2026-10-17, docs/research/premium-entry-points.md):
// web parity of the mobile You tier row — Free or Premium, first thing on Profile.
// Status, not a nudge: it never opens on its own, so no dismiss and no nudge
// cap. Free opens the overview pitch; Premium only says so and jumps to the
// plan card below (#plan) — never pitch to someone who has it.

const ROW = cn(
  'flex min-h-11 w-full items-center gap-3 rounded-2xl border bg-white p-4 text-left shadow-sm hover:bg-gray-50 sm:p-5',
  pressCard,
);

function Body({ title, hint }: { title: string; hint: string }) {
  return (
    <>
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[#fff3e8] text-[#944a00]">
        <Star className="h-4 w-4" aria-hidden="true" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block font-semibold text-gray-900">{title}</span>
        <span className="block text-sm text-gray-600">{hint}</span>
      </span>
      <ChevronRight className="h-4 w-4 shrink-0 text-gray-400" aria-hidden="true" />
    </>
  );
}

export function TierRow() {
  const isPremium = useIsPremium();
  // Nothing while loading, so a Premium user never sees "Free" flash.
  if (isPremium === undefined) return null;
  if (isPremium) {
    return (
      <a href="#plan" data-testid="profile-tier-row" className={cn('mb-6', ROW)}>
        <Body
          title={PREMIUM_PITCH_COPY.tierRowPremium}
          hint={PREMIUM_PITCH_COPY.tierRowPremiumHint}
        />
      </a>
    );
  }
  return (
    <div data-testid="profile-tier-row" className="mb-6">
      <UpgradeButton source="tier-row" className={ROW}>
        <Body title={PREMIUM_PITCH_COPY.tierRowFree} hint={PREMIUM_PITCH_COPY.seeWhatPremiumAdds} />
      </UpgradeButton>
    </div>
  );
}
