'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { trpc } from '@/lib/trpc';
import { Check, Sparkles } from 'lucide-react';
import { PLAN_FEATURES, PREMIUM_PERK_KEYS } from '@chefer/types';
import { Sheet } from '@chefer/ui';
import { cn } from '@chefer/utils';

// ─── Upgrade button + confirmation dialog ─────────────────────────────────────
// Demo upgrade flow: one confirmed click flips the user's planTier to PREMIUM
// (no payment integration — Stripe is a later phase).
//
// The perk list renders from the PLAN_FEATURES matrix (launch plan PW-1), so
// marketing copy and enforcement share one source of truth.

const PREMIUM_PERKS = PREMIUM_PERK_KEYS.map((key) => PLAN_FEATURES[key].label);

export function UpgradeButton({ className }: { className?: string }) {
  const [open, setOpen] = useState(false);
  const utils = trpc.useUtils();
  const router = useRouter();

  const upgradeMutation = trpc.user.upgradePlan.useMutation({
    onSuccess: () => {
      // The tier gates data everywhere (plans, preferences, quotas) — drop the
      // whole client cache, and refresh server components: the upgrade panels
      // on /onboarding and /preferences are rendered server-side, so a client
      // cache invalidation alone leaves them visible after upgrading.
      void utils.invalidate();
      router.refresh();
      setOpen(false);
    },
  });

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className={cn(
          'flex items-center justify-center gap-1.5 rounded-lg bg-gradient-to-r from-amber-500 to-orange-500 px-3 py-1.5 text-xs font-semibold text-white shadow-sm transition-opacity hover:opacity-90',
          className,
        )}
      >
        <Sparkles className="h-3.5 w-3.5" />
        Upgrade plan
      </button>

      {/* Sheet (bottom sheet on phones, dialog at sm+) supplies scroll lock,
          focus trap and Escape — the previous hand-rolled fixed-inset div
          had none of those (CLAUDE.md overlay rule, roadmap P0-10). */}
      <Sheet
        open={open}
        onClose={() => setOpen(false)}
        title="Go Premium"
        description="Unlock the personal AI chef. This is a demo upgrade — it activates instantly, no payment needed."
        size="sm"
        footer={
          <button
            onClick={() => upgradeMutation.mutate()}
            disabled={upgradeMutation.isPending}
            className="w-full rounded-xl bg-gradient-to-r from-amber-500 to-orange-500 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition-opacity hover:opacity-90 disabled:opacity-50"
          >
            {upgradeMutation.isPending ? 'Upgrading…' : 'Upgrade now — free demo'}
          </button>
        }
      >
        <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-r from-amber-500 to-orange-500 text-white">
          <Sparkles className="h-5 w-5" />
        </div>

        <ul className="space-y-2">
          {PREMIUM_PERKS.map((perk) => (
            <li key={perk} className="flex items-start gap-2 text-sm text-gray-700">
              <Check className="mt-0.5 h-4 w-4 shrink-0 text-emerald-500" />
              {perk}
            </li>
          ))}
        </ul>

        {upgradeMutation.isError && (
          <p className="mt-3 text-sm text-red-600">
            Upgrade failed: {upgradeMutation.error.message}
          </p>
        )}
      </Sheet>
    </>
  );
}

/**
 * Full-width locked-feature panel used on pages gated behind premium
 * (preferences, onboarding, profile). Title/description stay contextual per
 * page; the perk list always comes from the PLAN_FEATURES matrix.
 */
export function UpgradeCard({ title, description }: { title: string; description: string }) {
  return (
    <div className="rounded-2xl border border-amber-200 bg-gradient-to-br from-amber-50 to-orange-50 p-6 text-center">
      <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-xl bg-gradient-to-r from-amber-500 to-orange-500 text-white">
        <Sparkles className="h-6 w-6" />
      </div>
      <h2 className="text-lg font-bold text-gray-900">{title}</h2>
      <p className="mx-auto mt-1 max-w-md text-sm text-gray-600">{description}</p>
      <ul className="mx-auto mt-4 max-w-md space-y-1.5 text-left">
        {PREMIUM_PERKS.map((perk) => (
          <li key={perk} className="flex items-start gap-2 text-sm text-gray-700">
            <Check className="mt-0.5 h-4 w-4 shrink-0 text-emerald-500" />
            {perk}
          </li>
        ))}
      </ul>
      <div className="mt-4 flex justify-center">
        <UpgradeButton className="px-5 py-2 text-sm" />
      </div>
    </div>
  );
}
