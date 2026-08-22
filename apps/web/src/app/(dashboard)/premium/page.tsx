'use client';

import { useSearchParams } from 'next/navigation';
import { useEffect } from 'react';
import { PremiumComparisonTable } from '@/features/premium/components/PremiumComparisonTable';
import { UpgradeButton } from '@/features/premium/components/UpgradeButton';
import { COMING_SOON_KEYS, PREMIUM_FEATURE_CARDS } from '@/features/premium/premium-features';
import { useIsPremium } from '@/hooks/useIsPremium';
import { capture } from '@/lib/analytics';
import { BadgeCheck, ChefHat, Sparkles } from 'lucide-react';
import { PLAN_FEATURES } from '@chefer/types';

// ─── /premium showcase page (premium_plan.md §6.2, wave 0) ────────────────────
// The full pitch, one URL every touchpoint can deep-link to while preserving
// its funnel `source` (/premium?source=chat-quota). Cards render from the
// registry in premium-features.ts; wave agents append theirs as features land.
//
// Deliberately NO future-price promise yet — exact price and early-bird
// wording are the product owner's call (§6.1 principle 5). The euro anchor
// stack (principle 4) carries the value story until then.

// The apps a Chefer premium user would otherwise stack (research doc:
// docs/premium-feature-ideas.md — MacroFactor + MyFitnessPal + Samsung Food).
const ANCHOR_STACK = [
  { name: 'Adaptive macro coaching app', price: '~€66/yr' },
  { name: 'Food-logging app with photo scan', price: '~€73/yr' },
  { name: 'Recipe saver + meal planner app', price: '~€27/yr' },
];

const FAQ: { q: string; a: string }[] = [
  {
    q: 'What does premium cost during the beta?',
    a: 'Nothing. Premium is free while Chefer is in beta — one click activates it, no payment details asked, ever.',
  },
  {
    q: 'What happens if I downgrade?',
    a: 'Nothing is deleted. Your plans, recipes, ratings and logs all stay — you just go back to the free tier’s curated plans and daily limits. You can switch back any time from your profile.',
  },
  {
    q: 'Will Chefer stay free?',
    a: 'The free tier stays free. Premium will eventually have a price — beta members will hear about it well in advance, directly in the app.',
  },
];

export default function PremiumPage() {
  const searchParams = useSearchParams();
  const source = searchParams.get('source') ?? 'direct';
  const isPremium = useIsPremium();

  // One view event per mount, tagged with the surface that linked here.
  useEffect(() => {
    capture('premium_page_viewed', { source });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- fire once per visit, not per param change
  }, []);

  // Conversions from this page keep the ORIGIN surface's attribution when
  // there is one — the page is a corridor, not the gate that convinced them.
  const ctaSource = source === 'direct' ? 'premium-page' : source;

  return (
    <div className="mx-auto max-w-3xl px-4 py-8 sm:py-12">
      {/* Hero */}
      <div className="text-center">
        <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-r from-amber-500 to-orange-500 text-white">
          <ChefHat className="h-7 w-7" />
        </div>
        <h1 className="font-serif text-3xl font-bold text-neutral-900 sm:text-4xl">
          A chef that knows you — and your week
        </h1>
        <p className="mx-auto mt-3 max-w-xl text-neutral-600">
          Premium turns Chefer from a recipe book into a personal chef: plans built around your
          body, your budget and your taste, that keep getting better every week.
        </p>
        <div className="mt-6 flex justify-center">
          {isPremium ? (
            <span className="flex items-center gap-2 rounded-xl bg-emerald-50 px-4 py-2 text-sm font-semibold text-emerald-700">
              <BadgeCheck className="h-4 w-4" /> You&apos;re premium — everything below is yours
            </span>
          ) : (
            <UpgradeButton className="px-6 py-3 text-sm" source={ctaSource} />
          )}
        </div>
      </div>

      {/* Feature cards */}
      <div className="mt-12 grid gap-4 sm:grid-cols-2">
        {PREMIUM_FEATURE_CARDS.map(({ key, icon: Icon }) => (
          <div key={key} className="rounded-2xl border bg-white p-5 shadow-sm">
            <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-r from-amber-500 to-orange-500 text-white">
              <Icon className="h-5 w-5" />
            </div>
            <h2 className="text-base font-bold text-neutral-900">{PLAN_FEATURES[key].label}</h2>
            <p className="mt-1 text-sm text-neutral-600">{PLAN_FEATURES[key].description}</p>
          </div>
        ))}
      </div>

      {/* Cooking now */}
      {COMING_SOON_KEYS.length > 0 && (
        <div className="mt-6 rounded-2xl border border-dashed border-amber-300 bg-amber-50/50 p-5">
          <p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-widest text-amber-700">
            <Sparkles className="h-4 w-4" /> Cooking now — coming to premium
          </p>
          <ul className="mt-3 space-y-2">
            {COMING_SOON_KEYS.map((key) => (
              <li key={key} className="text-sm text-neutral-700">
                <span className="font-semibold">{PLAN_FEATURES[key].label}.</span>{' '}
                <span className="text-neutral-600">{PLAN_FEATURES[key].description}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Comparison table */}
      <h2 className="mt-12 mb-4 font-serif text-2xl font-bold text-neutral-900">Free vs Premium</h2>
      <PremiumComparisonTable />

      {/* Euro anchor stack */}
      <div className="mt-12 rounded-2xl border bg-white p-6 shadow-sm">
        <h2 className="font-serif text-2xl font-bold text-neutral-900">What this replaces</h2>
        <p className="mt-1 text-sm text-neutral-600">
          Getting the same toolkit from separate apps costs real money:
        </p>
        <ul className="mt-4 space-y-2">
          {ANCHOR_STACK.map((item) => (
            <li key={item.name} className="flex items-center justify-between gap-4 text-sm">
              <span className="min-w-0 text-neutral-700">{item.name}</span>
              <span className="shrink-0 font-semibold text-neutral-900">{item.price}</span>
            </li>
          ))}
          <li className="flex items-center justify-between gap-4 border-t pt-3 text-sm">
            <span className="min-w-0 font-semibold text-neutral-900">
              Chefer Premium, all in one place
            </span>
            <span className="shrink-0 font-bold text-emerald-600">Free during the beta</span>
          </li>
        </ul>
      </div>

      {/* FAQ */}
      <h2 className="mt-12 mb-4 font-serif text-2xl font-bold text-neutral-900">Fair questions</h2>
      <div className="space-y-3">
        {FAQ.map((item) => (
          <div key={item.q} className="rounded-2xl border bg-white p-5 shadow-sm">
            <h3 className="text-sm font-bold text-neutral-900">{item.q}</h3>
            <p className="mt-1 text-sm text-neutral-600">{item.a}</p>
          </div>
        ))}
      </div>

      {/* Bottom CTA */}
      {!isPremium && (
        <div className="mt-12 flex justify-center">
          <UpgradeButton className="px-6 py-3 text-sm" source={ctaSource} />
        </div>
      )}
    </div>
  );
}
