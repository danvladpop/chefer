'use client';

import type { ComponentType } from 'react';
import { capture } from '@/lib/analytics';
import { trpc } from '@/lib/trpc';
import { CalendarCheck, Camera, ChefHat, Video } from 'lucide-react';
import type { OnboardingJob, PremiumSource } from '@chefer/types';
import { ONBOARDING_V4_COPY, premiumJobFor } from '@chefer/utils';
import { BiscuitHalo, ErrorLine, PrimaryButton, TextButton, TickLine, V4Heading } from './ui';

// ─── Premium (OnbV4Premium + OnbV4PremiumOn) — free users only ────────────────
// The same soft-paywall flip as UpgradeButton (user.upgradePlan): no price, no
// checkout. Unlike UpgradeButton it does not router.refresh() — that would
// re-run the /onboarding server page mid-flow — and it does not raise the
// shell's post-upgrade activation: "Premium is on" below is this flow's own.

const PERK_ICONS: ComponentType<{ className?: string | undefined }>[] = [
  ChefHat,
  Camera,
  Video,
  CalendarCheck,
];
const SOURCE: PremiumSource = 'onboarding';

export function StepPremium({
  jobs,
  onContinue,
}: {
  jobs: readonly OnboardingJob[];
  onContinue: () => void;
}) {
  const job = premiumJobFor(SOURCE, jobs);
  const utils = trpc.useUtils();
  const upgrade = trpc.user.upgradePlan.useMutation({
    meta: { silent: true },
    onSuccess: () => {
      capture('upgrade_completed', { source: SOURCE, job });
      void utils.user.invalidate();
      void utils.profile.invalidate();
    },
  });

  if (upgrade.isSuccess) {
    return (
      <div className="flex flex-1 flex-col justify-center gap-6" data-testid="v4-premium-on">
        <BiscuitHalo loop="premium" size={200} />
        <V4Heading title={ONBOARDING_V4_COPY.premiumOnTitle} />
        <ul className="mx-auto flex flex-col gap-3">
          {ONBOARDING_V4_COPY.premiumOnTicks.map((tick) => (
            <TickLine key={tick}>{tick}</TickLine>
          ))}
        </ul>
        <PrimaryButton onClick={onContinue} testId="v4-premium-continue">
          {ONBOARDING_V4_COPY.continue}
        </PrimaryButton>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4" data-testid="v4-premium">
      <BiscuitHalo loop="premium" size={150} />
      <div className="flex flex-col items-center gap-1.5">
        <span className="text-sm font-bold tracking-[0.1em] text-revamp-brand">
          {ONBOARDING_V4_COPY.premiumEyebrow}
        </span>
        <V4Heading title={ONBOARDING_V4_COPY.premiumTitle} />
      </div>
      <ul className="grid grid-cols-2 gap-2.5">
        {ONBOARDING_V4_COPY.premiumPerks.map((perk, i) => {
          const Icon = PERK_ICONS[i] ?? ChefHat;
          return (
            <li
              key={perk}
              className="flex min-h-24 min-w-0 flex-col justify-between gap-2.5 rounded-card border border-revamp-separator bg-revamp-surface p-3.5"
            >
              <span className="flex h-10 w-10 items-center justify-center rounded-control bg-revamp-brand-tint text-revamp-brand">
                <Icon className="h-5 w-5" aria-hidden="true" />
              </span>
              <span className="text-base font-semibold leading-snug text-revamp-label">{perk}</span>
            </li>
          );
        })}
      </ul>
      <p className="text-center text-[0.9375rem] text-revamp-label-secondary">
        {ONBOARDING_V4_COPY.premiumNote}
      </p>
      {upgrade.isError && <ErrorLine message={ONBOARDING_V4_COPY.premiumFailed} />}
      <div className="flex flex-col gap-1.5">
        <PrimaryButton
          onClick={() => {
            capture('upgrade_clicked', { source: SOURCE, job });
            upgrade.mutate();
          }}
          busy={upgrade.isPending}
          testId="v4-premium-turn-on"
        >
          {ONBOARDING_V4_COPY.premiumTurnOn}
        </PrimaryButton>
        <TextButton onClick={onContinue} disabled={upgrade.isPending} testId="v4-premium-later">
          {ONBOARDING_V4_COPY.premiumLater}
        </TextButton>
      </div>
    </div>
  );
}
