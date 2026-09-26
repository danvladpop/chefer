'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { activationSteps } from '@/features/premium/lib/activation-steps';
import { capture } from '@/lib/analytics';
import { trpc } from '@/lib/trpc';
import { Sparkles } from 'lucide-react';
import { Sheet } from '@chefer/ui';
import { activationIntro } from '@chefer/utils';

// ─── Post-upgrade activation (review P-8) ────────────────────────────────────
// After the tier flips, show "3 things to do first" — without it, a fresh
// premium user regenerates on defaults and premium looks identical to free.
// Lives in the dashboard shell (not inside UpgradeButton) because most
// upgrade buttons sit in free-only UI that unmounts the moment the tier
// flips; the button signals through sessionStorage + a window event. The
// steps follow the upgrade source and skip what's done (activation-steps.ts).

export const ACTIVATION_FLAG = 'chefer.post-upgrade-activation';
export const ACTIVATION_EVENT = 'chefer:upgraded';

/**
 * The flag's value is the upgrade `source` (older builds wrote '1'), so the
 * sheet can lead with what the user upgraded for (audit F-PREM-1-5).
 */
export function readActivationSource(raw: string | null): string | null {
  if (raw === null || raw === '' || raw === '1') return null;
  return raw;
}

export function PostUpgradeActivation() {
  const [open, setOpen] = useState(false);
  const [source, setSource] = useState<string | null>(null);
  // "Set your goal" hides once it's done — and a user with a profile must
  // never be sent to /onboarding, which redirects them (audit F-PM-9).
  const { data: hasProfile } = trpc.preferences.hasProfile.useQuery(undefined, {
    enabled: open,
  });

  useEffect(() => {
    const maybeOpen = () => {
      const raw = sessionStorage.getItem(ACTIVATION_FLAG);
      if (raw !== null) {
        sessionStorage.removeItem(ACTIVATION_FLAG);
        const from = readActivationSource(raw);
        capture('post_upgrade_activation_shown', { source: from });
        setSource(from);
        setOpen(true);
      }
    };
    maybeOpen(); // survives the router.refresh() after upgrading
    window.addEventListener(ACTIVATION_EVENT, maybeOpen);
    return () => window.removeEventListener(ACTIVATION_EVENT, maybeOpen);
  }, []);

  // Until hasProfile loads, assume a profile: hiding the goal step for a
  // moment beats flashing a link that bounces back to the dashboard.
  const steps = activationSteps(source, hasProfile ?? true);
  const first = steps[0];

  return (
    <Sheet
      open={open}
      onClose={() => setOpen(false)}
      title="You're premium, chef"
      description={activationIntro(steps.length)}
      size="sm"
      footer={
        first && (
          <Link
            href={first.href}
            onClick={() => setOpen(false)}
            className="flex min-h-11 w-full items-center justify-center rounded-xl bg-gradient-to-r from-amber-500 to-orange-500 px-4 py-2.5 text-center text-sm font-semibold text-white shadow-sm transition-opacity hover:opacity-90"
          >
            {first.title} →
          </Link>
        )
      }
    >
      {/* The Sheet body has no padding of its own (audit F-ONB-3-3). */}
      <div className="px-5 pb-4">
        <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-r from-amber-500 to-orange-500 text-white">
          <Sparkles className="h-5 w-5" aria-hidden="true" />
        </div>
        <ol className="space-y-3">
          {steps.map(({ key, href, title, detail }, i) => (
            <li key={key}>
              <Link
                href={href}
                onClick={() => setOpen(false)}
                className="flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50/60 p-3 transition-colors hover:bg-amber-50"
              >
                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[#944a00] text-xs font-bold text-white">
                  {i + 1}
                </span>
                <span className="min-w-0">
                  <span className="block text-sm font-semibold text-gray-900">{title}</span>
                  <span className="block text-xs text-gray-600">{detail}</span>
                </span>
              </Link>
            </li>
          ))}
        </ol>
      </div>
    </Sheet>
  );
}
