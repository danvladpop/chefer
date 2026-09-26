'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useIsPremium } from '@/hooks/useIsPremium';
import { Sparkles, X } from 'lucide-react';
import { UpgradeButton } from './UpgradeButton';

// ─── Nav plan footer (review P-6) ────────────────────────────────────────────
// The upgrade card in the sidebar/More drawer was permanent wallpaper — by
// minute five it reads as nagging. It's now dismissible (persisted), leaving a
// slim one-line entry so the upgrade path never disappears entirely.

const DISMISS_KEY = 'chefer.nav-upsell-dismissed';

export function PlanFooterCard({ source }: { source: string }) {
  const isPremium = useIsPremium();
  // null = not yet read from localStorage (first client render matches SSR).
  const [dismissed, setDismissed] = useState<boolean | null>(null);

  useEffect(() => {
    setDismissed(localStorage.getItem(DISMISS_KEY) === '1');
  }, []);

  if (isPremium === true) {
    return (
      <div className="flex items-center gap-2 rounded-xl bg-[#fff3e8] px-3 py-2">
        <Sparkles className="h-4 w-4 text-[#944a00]" />
        <span className="text-xs font-semibold text-[#944a00]">Premium plan</span>
      </div>
    );
  }
  if (isPremium !== false || dismissed === null) return null;

  if (dismissed) {
    return (
      <Link
        href="/premium"
        className="flex min-h-11 items-center gap-2 rounded-lg px-3 text-xs font-semibold text-[#944a00] transition-colors hover:bg-[#fff3e8]"
      >
        <Sparkles className="h-3.5 w-3.5" />
        Go premium — free in beta
      </Link>
    );
  }

  return (
    <div className="relative rounded-xl border border-amber-200 bg-gradient-to-br from-amber-50 to-orange-50 p-3">
      <button
        type="button"
        aria-label="Dismiss upgrade card"
        onClick={() => {
          localStorage.setItem(DISMISS_KEY, '1');
          setDismissed(true);
        }}
        className="touch-target absolute right-1 top-1 flex h-8 w-8 items-center justify-center rounded-lg text-gray-500 transition-colors hover:bg-amber-100 hover:text-gray-700"
      >
        <X className="h-3.5 w-3.5" />
      </button>
      <p className="text-xs font-semibold text-gray-800">Free plan</p>
      <p className="mt-0.5 text-xs leading-snug text-gray-600">
        Chef-picked recipes. Go premium for your personal AI chef — free during the beta.
      </p>
      <UpgradeButton className="mt-2 w-full" source={source} />
    </div>
  );
}
