'use client';

import { useEffect, useState } from 'react';
import { trpc } from '@/lib/trpc';
import { X } from 'lucide-react';
import { Biscuit, pressControl } from '@chefer/ui';
import { cn, ONBOARDING_V4_COPY } from '@chefer/utils';

// ─── "You're all set" (OnbV4Done) ──────────────────────────────────────────────
// Shown once on the landing page after finishing Onboarding V4. The flow sets a
// localStorage marker on finish; the card reads it after mount (no SSR
// mismatch) and Dismiss clears it. Without the marker — every flag-off user —
// it renders nothing and makes no request.

export const ONBOARDING_V4_WELCOME_KEY = 'chefer.onboardingV4.welcome';

/** What got set up: the body line follows it. `none` = title only. */
export type WelcomeKind = 'food' | 'train' | 'both' | 'none';
const KINDS: readonly WelcomeKind[] = ['food', 'train', 'both', 'none'];

export function markWelcomePending(kind: WelcomeKind): void {
  try {
    window.localStorage.setItem(ONBOARDING_V4_WELCOME_KEY, kind);
  } catch {
    // Storage blocked (private mode): the card is a nicety, skip it.
  }
}

function readWelcomePending(): WelcomeKind | null {
  try {
    const raw = window.localStorage.getItem(ONBOARDING_V4_WELCOME_KEY);
    return KINDS.find((k) => k === raw) ?? null;
  } catch {
    return null;
  }
}

function clearWelcome(): void {
  try {
    window.localStorage.removeItem(ONBOARDING_V4_WELCOME_KEY);
  } catch {
    // Nothing to clear.
  }
}

function bodyFor(kind: WelcomeKind): string | null {
  switch (kind) {
    case 'food':
      return ONBOARDING_V4_COPY.doneBodyFood;
    case 'train':
      return ONBOARDING_V4_COPY.doneBodyTrain;
    case 'both':
      return ONBOARDING_V4_COPY.doneBodyBoth;
    default:
      return null;
  }
}

export function OnboardingV4WelcomeCard({ className }: { className?: string }) {
  const [kind, setKind] = useState<WelcomeKind | null>(null);
  useEffect(() => setKind(readWelcomePending()), []);
  if (kind === null) return null;
  return (
    <WelcomeCard
      kind={kind}
      className={className}
      onDismiss={() => {
        clearWelcome();
        setKind(null);
      }}
    />
  );
}

function WelcomeCard({
  kind,
  className,
  onDismiss,
}: {
  kind: WelcomeKind;
  className?: string | undefined;
  onDismiss: () => void;
}) {
  const { data: me } = trpc.user.me.useQuery(undefined, { staleTime: 30_000 });
  const body = bodyFor(kind);
  return (
    <section
      aria-label="Welcome"
      data-testid="onb-v4-welcome"
      className={cn(
        'relative flex items-center gap-3 rounded-card bg-revamp-brand-tint py-3 pl-3 pr-14',
        className,
      )}
    >
      <Biscuit loop="allSet" size={84} className="shrink-0" />
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <b className="text-[1.0625rem] text-revamp-label">
          {ONBOARDING_V4_COPY.doneTitle(me?.firstName ?? null)}
        </b>
        {body && <span className="text-[0.9375rem] text-revamp-label-secondary">{body}</span>}
      </div>
      <button
        type="button"
        onClick={onDismiss}
        aria-label={ONBOARDING_V4_COPY.doneDismiss}
        className={cn(
          'absolute right-1 top-1 flex h-11 w-11 items-center justify-center rounded-full text-revamp-label-secondary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
          pressControl,
        )}
      >
        <X className="h-5 w-5" aria-hidden="true" />
      </button>
    </section>
  );
}
