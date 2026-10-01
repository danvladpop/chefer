'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import {
  ACTIVATION_EVENT,
  ACTIVATION_FLAG,
} from '@/features/premium/components/PostUpgradeActivation';
import { usePremiumPitch } from '@/features/premium/lib/use-premium-pitch';
import { PREMIUM_FEATURE_CARDS } from '@/features/premium/premium-features';
import { useHousehold } from '@/hooks/useHousehold';
import { capture } from '@/lib/analytics';
import { trpc } from '@/lib/trpc';
import { Check, Sparkles } from 'lucide-react';
import { PLAN_FEATURES, PREMIUM_PERK_KEYS } from '@chefer/types';
import { Sheet } from '@chefer/ui';
import { cn, downgradeLosses, PREMIUM_PITCH_COPY } from '@chefer/utils';

// ─── Upgrade button + confirmation dialog (PW-2) ──────────────────────────────
// The one shared upgrade surface. Every touchpoint passes a `source` so the
// PW-3 funnel can answer "which gate converts": upgrade_prompt_shown →
// upgrade_clicked → upgrade_completed, all tagged with it.
//
// Soft-paywall phase: one confirmed click flips planTier to PREMIUM — no
// payment. Stripe (roadmap P2-1) replaces only how the flag gets set.
//
// T-10.5 (UX-10): the dialog is headlined by the JOB the source unlocks
// (packages/utils premium-pitch.ts — the same registry the mobile sheet reads),
// shows only live bullets, and carries the included-at-no-cost terms every time it
// opens. The trigger is "See what Premium adds", not a generic upgrade.
//
// The perk list on UpgradeCard still renders from the PLAN_FEATURES matrix
// (launch plan PW-1), so marketing copy and enforcement share one truth.

const PREMIUM_PERKS = PREMIUM_PERK_KEYS.map((key) => PLAN_FEATURES[key].label);

export interface UpgradeButtonProps {
  className?: string;
  /** Which touchpoint rendered this button — feeds the PW-3 funnel. */
  source: string;
  /** The trigger's text; defaults to `See what Premium adds`. */
  label?: string;
}

export function UpgradeButton({
  className,
  source,
  label = PREMIUM_PITCH_COPY.seeWhatPremiumAdds,
}: UpgradeButtonProps) {
  const [open, setOpen] = useState(false);
  const pitch = usePremiumPitch(source, open);
  const utils = trpc.useUtils();
  const router = useRouter();

  const upgradeMutation = trpc.user.upgradePlan.useMutation({
    onSuccess: () => {
      capture('upgrade_completed', { source });
      // Post-upgrade activation (review P-8) is shown by the shell-mounted
      // PostUpgradeActivation — signalled via storage + event because THIS
      // button usually sits in free-only UI that unmounts when the tier flips.
      // The value is the source, so activation leads with it (F-PREM-1-5).
      sessionStorage.setItem(ACTIVATION_FLAG, source);
      // The tier gates data everywhere (plans, preferences, quotas) — drop the
      // whole client cache, and refresh server components: the upgrade panels
      // on /onboarding and /preferences are rendered server-side, so a client
      // cache invalidation alone leaves them visible after upgrading.
      void utils.invalidate();
      router.refresh();
      setOpen(false);
      window.dispatchEvent(new Event(ACTIVATION_EVENT));
    },
  });

  return (
    <>
      <button
        onClick={() => {
          capture('upgrade_prompt_shown', { source, job: pitch.job });
          setOpen(true);
        }}
        className={cn(
          'flex min-h-11 items-center justify-center gap-1.5 rounded-lg bg-gradient-to-r from-amber-500 to-orange-500 px-3 py-1.5 text-xs font-semibold text-white shadow-sm transition-opacity hover:opacity-90',
          className,
        )}
      >
        <Sparkles className="h-3.5 w-3.5" aria-hidden="true" />
        {label}
      </button>

      {/* Sheet (bottom sheet on phones, dialog at sm+) supplies scroll lock,
          focus trap and Escape — the previous hand-rolled fixed-inset div
          had none of those (CLAUDE.md overlay rule, roadmap P0-10). */}
      <Sheet
        open={open}
        onClose={() => setOpen(false)}
        title={pitch.headline}
        description={pitch.lede}
        size="sm"
        footer={
          <div className="flex w-full flex-col gap-2">
            <button
              onClick={() => {
                capture('upgrade_clicked', { source, job: pitch.job });
                upgradeMutation.mutate();
              }}
              disabled={upgradeMutation.isPending}
              className="min-h-11 w-full rounded-xl bg-gradient-to-r from-amber-500 to-orange-500 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition-opacity hover:opacity-90 disabled:opacity-50"
            >
              {upgradeMutation.isPending
                ? 'Turning on…'
                : upgradeMutation.isError
                  ? PREMIUM_PITCH_COPY.tryAgain
                  : PREMIUM_PITCH_COPY.turnOn}
            </button>
            <button
              onClick={() => setOpen(false)}
              className="min-h-11 w-full rounded-xl border px-4 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-50"
            >
              {PREMIUM_PITCH_COPY.notNow}
            </button>
          </div>
        }
      >
        <p className="mb-2 text-xs font-semibold uppercase tracking-widest text-[#944a00]">
          {PREMIUM_PITCH_COPY.eyebrow}
        </p>
        <ul className="space-y-2" data-testid="premium-bullets">
          {pitch.bullets.map((bullet) => (
            <li key={bullet} className="flex items-start gap-2 text-sm text-gray-800">
              <Check className="mt-0.5 h-4 w-4 shrink-0 text-emerald-500" aria-hidden="true" />
              <span className="min-w-0">{bullet}</span>
            </li>
          ))}
        </ul>

        {pitch.alsoIncluded.length > 0 && (
          <details className="mt-3">
            <summary className="flex min-h-11 cursor-pointer items-center text-sm font-medium text-gray-800">
              {PREMIUM_PITCH_COPY.alsoIncluded}
            </summary>
            <ul className="space-y-1 pb-1 pl-1 text-sm text-gray-600">
              {pitch.alsoIncluded.map((line) => (
                <li key={line}>· {line}</li>
              ))}
            </ul>
          </details>
        )}

        <Link
          href={`/premium?source=${encodeURIComponent(source)}`}
          onClick={() => setOpen(false)}
          className="flex min-h-11 items-center text-sm font-semibold text-[#944a00] underline-offset-2 hover:underline"
        >
          See everything Premium does →
        </Link>

        {/* The terms are plain text, read before the button — on every open. */}
        <div data-testid="premium-terms" className="mt-2 rounded-xl bg-gray-50 p-3">
          <p className="text-xs font-semibold uppercase tracking-widest text-gray-500">
            {pitch.terms.heading}
          </p>
          <p className="mt-1 text-xs text-gray-600">{pitch.terms.body}</p>
        </div>

        {upgradeMutation.isError && (
          <p role="alert" className="mt-3 text-sm text-red-600">
            {PREMIUM_PITCH_COPY.errorBody}
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
export function UpgradeCard({
  title,
  description,
  source,
  perkDisplay = 'list',
}: {
  title: string;
  description: string;
  source: string;
  /** 'carousel' swaps the perk list for compact feature cards (§6.6). */
  perkDisplay?: 'list' | 'carousel';
}) {
  return (
    <div className="rounded-2xl border border-amber-200 bg-gradient-to-br from-amber-50 to-orange-50 p-6 text-center">
      <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-xl bg-gradient-to-r from-amber-500 to-orange-500 text-white">
        <Sparkles className="h-6 w-6" />
      </div>
      <h2 className="text-lg font-bold text-gray-900">{title}</h2>
      <p className="mx-auto mt-1 max-w-md text-sm text-gray-600">{description}</p>
      {perkDisplay === 'list' ? (
        <ul className="mx-auto mt-4 max-w-md space-y-1.5 text-left">
          {PREMIUM_PERKS.map((perk) => (
            <li key={perk} className="flex items-start gap-2 text-sm text-gray-700">
              <Check className="mt-0.5 h-4 w-4 shrink-0 text-emerald-500" />
              {perk}
            </li>
          ))}
        </ul>
      ) : (
        <>
          {/* Compact feature-card carousel — same registry as /premium */}
          <div className="-mx-6 mt-4 flex snap-x gap-3 overflow-x-auto px-6 pb-2 text-left">
            {PREMIUM_FEATURE_CARDS.map(({ key, icon: Icon }) => (
              <div
                key={key}
                className="w-56 shrink-0 snap-start rounded-xl border border-amber-200/70 bg-white p-4"
              >
                <div className="mb-2 flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-r from-amber-500 to-orange-500 text-white">
                  <Icon className="h-4 w-4" />
                </div>
                <p className="text-sm font-semibold text-gray-900">{PLAN_FEATURES[key].label}</p>
                <p className="mt-1 text-xs text-gray-600">{PLAN_FEATURES[key].description}</p>
              </div>
            ))}
          </div>
          <Link
            href={`/premium?source=${encodeURIComponent(source)}`}
            className="mt-2 inline-flex min-h-11 items-center text-sm font-semibold text-[#944a00] underline-offset-2 hover:underline"
          >
            See the full free-vs-premium comparison →
          </Link>
        </>
      )}
      <div className="mt-4 flex justify-center">
        <UpgradeButton className="px-5 py-2 text-sm" source={source} />
      </div>
    </div>
  );
}

/**
 * Self-service downgrade (PW-2) — honest while Premium is free, and the only
 * way to test both sides of every gate without an admin. T-10.3/T-10.5: it asks
 * first and says what you keep and what you lose — only the Premium jobs this
 * user has used — and "Keep Premium" leaves everything as it was.
 */
export function DowngradeButton({ className }: { className?: string }) {
  const [confirming, setConfirming] = useState(false);
  const utils = trpc.useUtils();
  const router = useRouter();
  const { memberCount } = useHousehold();
  const { data: usage } = trpc.profile.getAiUsage.useQuery(undefined, {
    enabled: confirming,
    staleTime: 30_000,
  });

  const downgradeMutation = trpc.user.downgradePlan.useMutation({
    onSuccess: () => {
      capture('downgrade_completed', {});
      void utils.invalidate();
      router.refresh();
      setConfirming(false);
    },
  });

  const losses = downgradeLosses({
    members: memberCount,
    aiMealPlans: usage?.aiMealPlans ?? 0,
    imports: usage?.today.RECIPE_IMPORT ?? 0,
    chatMessages: usage?.today.CHAT ?? 0,
    scans: usage?.today.SCAN ?? 0,
  });

  return (
    <>
      <button
        onClick={() => setConfirming(true)}
        className={cn(
          'inline-flex min-h-11 items-center text-xs text-gray-600 underline-offset-2 hover:underline',
          className,
        )}
      >
        {PREMIUM_PITCH_COPY.switchBackToFree}
      </button>
      <Sheet
        open={confirming}
        onClose={() => setConfirming(false)}
        title={PREMIUM_PITCH_COPY.downgradeTitle}
        description={PREMIUM_PITCH_COPY.downgradeKeep}
        size="sm"
        footer={
          <div className="flex w-full flex-col gap-2 sm:flex-row-reverse">
            <button
              onClick={() => downgradeMutation.mutate()}
              disabled={downgradeMutation.isPending}
              className="min-h-11 w-full rounded-xl bg-red-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-red-700 disabled:opacity-50"
            >
              {downgradeMutation.isPending ? 'Switching…' : PREMIUM_PITCH_COPY.downgradeConfirm}
            </button>
            <button
              onClick={() => setConfirming(false)}
              className="min-h-11 w-full rounded-xl border px-4 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-50"
            >
              {PREMIUM_PITCH_COPY.downgradeCancel}
            </button>
          </div>
        }
      >
        {losses.length > 0 && (
          <div data-testid="downgrade-losses">
            <p className="text-sm font-semibold text-gray-900">
              {PREMIUM_PITCH_COPY.downgradeLose}
            </p>
            <ul className="mt-1 space-y-1 text-sm text-gray-700">
              {losses.map((line) => (
                <li key={line}>· {line}</li>
              ))}
            </ul>
          </div>
        )}
        {downgradeMutation.isError && (
          <p role="alert" className="mt-3 text-sm text-red-600">
            {downgradeMutation.error.message}
          </p>
        )}
      </Sheet>
    </>
  );
}
