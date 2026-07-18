'use client';

import { useState } from 'react';
import { trpc } from '@/lib/trpc';
import { Check, Sparkles, X } from 'lucide-react';
import { cn } from '@chefer/utils';

// ─── Upgrade button + confirmation dialog ─────────────────────────────────────
// Demo upgrade flow: one confirmed click flips the user's planTier to PREMIUM
// (no payment integration — Stripe is a later phase).

const PREMIUM_PERKS = [
  'AI meal plans tailored to your goals, allergies and preferences',
  'AI-powered meal swaps',
  'Personal profile: body metrics, calorie targets, dietary restrictions',
];

export function UpgradeButton({ className }: { className?: string }) {
  const [open, setOpen] = useState(false);
  const utils = trpc.useUtils();

  const upgradeMutation = trpc.user.upgradePlan.useMutation({
    onSuccess: () => {
      void utils.user.me.invalidate();
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

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
          role="dialog"
          aria-modal="true"
          aria-label="Upgrade to premium"
        >
          <div className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-xl">
            <div className="mb-4 flex items-start justify-between">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-r from-amber-500 to-orange-500 text-white">
                <Sparkles className="h-5 w-5" />
              </div>
              <button
                onClick={() => setOpen(false)}
                aria-label="Close"
                className="rounded-lg p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <h2 className="text-lg font-bold text-gray-900">Go Premium</h2>
            <p className="mt-1 text-sm text-gray-500">
              Unlock the personal AI chef. This is a demo upgrade — it activates instantly, no
              payment needed.
            </p>

            <ul className="mt-4 space-y-2">
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

            <button
              onClick={() => upgradeMutation.mutate()}
              disabled={upgradeMutation.isPending}
              className="mt-5 w-full rounded-xl bg-gradient-to-r from-amber-500 to-orange-500 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition-opacity hover:opacity-90 disabled:opacity-50"
            >
              {upgradeMutation.isPending ? 'Upgrading…' : 'Upgrade now — free demo'}
            </button>
          </div>
        </div>
      )}
    </>
  );
}

/**
 * Full-width locked-feature panel used on pages gated behind premium
 * (preferences, onboarding).
 */
export function UpgradeCard({ title, description }: { title: string; description: string }) {
  return (
    <div className="rounded-2xl border border-amber-200 bg-gradient-to-br from-amber-50 to-orange-50 p-6 text-center">
      <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-xl bg-gradient-to-r from-amber-500 to-orange-500 text-white">
        <Sparkles className="h-6 w-6" />
      </div>
      <h2 className="text-lg font-bold text-gray-900">{title}</h2>
      <p className="mx-auto mt-1 max-w-md text-sm text-gray-600">{description}</p>
      <div className="mt-4 flex justify-center">
        <UpgradeButton className="px-5 py-2 text-sm" />
      </div>
    </div>
  );
}
