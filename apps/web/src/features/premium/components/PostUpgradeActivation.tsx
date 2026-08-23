'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { capture } from '@/lib/analytics';
import { Sparkles } from 'lucide-react';
import { Sheet } from '@chefer/ui';

// ─── Post-upgrade activation (review P-8) ────────────────────────────────────
// After the tier flips, show "3 things to do first" — without it, a fresh
// premium user regenerates on defaults and premium looks identical to free.
// Lives in the dashboard shell (not inside UpgradeButton) because most
// upgrade buttons sit in free-only UI that unmounts the moment the tier
// flips; the button signals through sessionStorage + a window event.

export const ACTIVATION_FLAG = 'chefer.post-upgrade-activation';
export const ACTIVATION_EVENT = 'chefer:upgraded';

const STEPS = [
  {
    href: '/onboarding',
    title: 'Set your goal & body metrics',
    detail: 'Everything the AI chef builds starts from your target.',
  },
  {
    href: '/meal-plan',
    title: 'Regenerate this week',
    detail: 'Turn the chef-picked plan into one built around you.',
  },
  {
    href: '/recipes',
    title: 'Cheferize a favourite recipe',
    detail: 'Paste any link — the chef adapts it to your goals.',
  },
] as const;

export function PostUpgradeActivation() {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const maybeOpen = () => {
      if (sessionStorage.getItem(ACTIVATION_FLAG) === '1') {
        sessionStorage.removeItem(ACTIVATION_FLAG);
        capture('post_upgrade_activation_shown');
        setOpen(true);
      }
    };
    maybeOpen(); // survives the router.refresh() after upgrading
    window.addEventListener(ACTIVATION_EVENT, maybeOpen);
    return () => window.removeEventListener(ACTIVATION_EVENT, maybeOpen);
  }, []);

  return (
    <Sheet
      open={open}
      onClose={() => setOpen(false)}
      title="You're premium, chef"
      description="Three things make it worth it immediately:"
      size="sm"
      footer={
        <Link
          href="/onboarding"
          onClick={() => setOpen(false)}
          className="block w-full rounded-xl bg-gradient-to-r from-amber-500 to-orange-500 px-4 py-2.5 text-center text-sm font-semibold text-white shadow-sm transition-opacity hover:opacity-90"
        >
          Start with your profile →
        </Link>
      }
    >
      <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-r from-amber-500 to-orange-500 text-white">
        <Sparkles className="h-5 w-5" />
      </div>
      <ol className="space-y-3">
        {STEPS.map(({ href, title, detail }, i) => (
          <li key={href}>
            <Link
              href={href}
              onClick={() => setOpen(false)}
              className="flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50/60 p-3 transition-colors hover:bg-amber-50"
            >
              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[#944a00] text-xs font-bold text-white">
                {i + 1}
              </span>
              <span>
                <span className="block text-sm font-semibold text-gray-900">{title}</span>
                <span className="block text-xs text-gray-600">{detail}</span>
              </span>
            </Link>
          </li>
        ))}
      </ol>
    </Sheet>
  );
}
