import Link from 'next/link';
import { UpgradeButton } from '@/features/premium/components/UpgradeButton';
import { Sparkles } from 'lucide-react';

// ─── Locked chat (free tier) ──────────────────────────────────────────────────
// Per-user AI is premium-only (owner decision 2026-09-25). Free users keep the
// chat button: it opens a clearly labelled example of what the chef does, the
// upgrade button, and links to the free (non-AI) tools that do the same jobs.
// No input, no network call.

const EXAMPLE: { role: 'user' | 'assistant'; text: string }[] = [
  { role: 'user', text: "Swap tomorrow's lunch for something lighter" },
  {
    role: 'assistant',
    text: 'Done — I swapped Chicken Caesar Salad for a Quinoa Veggie Bowl (−180 kcal, same protein). Your shopping list is updated.',
  },
  { role: 'user', text: 'I had a croissant for breakfast' },
  { role: 'assistant', text: 'Logged a croissant (~270 kcal) to today. You have 1,480 kcal left.' },
];

const FREE_TOOLS = [
  { href: '/meal-plan', label: 'Replace a meal' },
  { href: '/tracker', label: 'Quick-add what you ate' },
  { href: '/shopping-list', label: 'Add to your shopping list' },
];

export function LockedChatPreview() {
  return (
    <div className="flex flex-col gap-3" data-testid="chat-locked">
      <p className="text-xs font-semibold uppercase tracking-wide text-neutral-500">
        Example conversation
      </p>
      <div className="flex flex-col gap-2 opacity-80" aria-label="Example conversation">
        {EXAMPLE.map((m, i) => (
          <div key={i} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
            <div
              className={`max-w-[85%] rounded-2xl px-3 py-2 text-sm ${
                m.role === 'user' ? 'bg-[#944a00] text-white' : 'bg-neutral-100 text-neutral-800'
              }`}
            >
              {m.text}
            </div>
          </div>
        ))}
      </div>
      <div className="flex flex-col gap-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-3">
        <p className="flex items-start gap-2 text-sm text-amber-900">
          <Sparkles className="mt-0.5 h-4 w-4 shrink-0 text-amber-500" aria-hidden="true" />
          Your AI chef can change your plan, log what you ate and import recipes for you. It&apos;s
          part of Premium.
        </p>
        <UpgradeButton className="min-h-11 w-full" source="chat-locked" />
      </div>
      <div>
        <p className="mb-1 text-xs text-neutral-500">Free tools that do the same jobs:</p>
        <ul className="flex flex-col">
          {FREE_TOOLS.map((t) => (
            <li key={t.href}>
              <Link
                href={t.href}
                className="flex min-h-11 items-center text-sm font-medium text-[#944a00] hover:underline"
              >
                {t.label} →
              </Link>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
