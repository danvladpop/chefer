import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getSessionUser } from '@/features/auth/lib/session';

export const metadata: Metadata = {
  title: 'Chefer — Your AI-Powered Meal Planner',
  description:
    'A personal AI chef: weekly meal plans built around your goals, allergies and budget — with priced shopping lists, photo meal logging, recipe import and adaptive coaching. Free during the beta.',
};

// ─── Landing page ─────────────────────────────────────────────────────────────
// Re-skinned to the in-app brand (serif headings, cream/brown warmth) and
// expanded to tell the real story — the old page was generic SaaS blue and
// mentioned none of the five premium features (review L-1/L-2/L-3).

const BRAND = '#944a00';

const FREE_FEATURES = [
  {
    icon: '🗓️',
    title: 'A week of meals in seconds',
    description:
      'Open the app, tap once, get a full 7-day plan — chef-picked on the free tier, AI-personalised on premium.',
  },
  {
    icon: '🛡️',
    title: 'Allergies respected, always',
    description:
      'Declare allergies, restrictions and dislikes once. Every plan on every tier avoids them — safety is never paywalled.',
  },
  {
    icon: '🛒',
    title: 'Shopping list with prices',
    description:
      'Every plan becomes a consolidated shopping list with estimated prices and a week total, so the budget is visible before the store.',
  },
  {
    icon: '📈',
    title: 'Tracking that talks back',
    description:
      'Check off meals, log your weight, and watch calories and macros against your target — not just a diary, a feedback loop.',
  },
] as const;

const PREMIUM_FEATURES = [
  {
    icon: '🧑‍🍳',
    title: 'A chef that adapts to you',
    description:
      'Weekly reviews of what you actually ate and how your weight trends — your calorie target adjusts automatically, like a coach would.',
  },
  {
    icon: '📸',
    title: 'Snap a photo, log the meal',
    description:
      "Photograph any plate — restaurant, leftovers, grandma's — and the chef estimates the dish and macros, then rebalances your week.",
  },
  {
    icon: '🔗',
    title: 'Cheferize any recipe',
    description:
      'Paste a link or snap a cookbook page. The chef imports it, adapts it to your allergies and goals, and slots it into your week.',
  },
  {
    icon: '👨‍👩‍👧',
    title: 'One plan for the whole table',
    description:
      'Add your partner and kids with their own allergies and portions — plans, servings, and the shopping list scale for everyone.',
  },
  {
    icon: '🧺',
    title: 'Plans that cook from your pantry',
    description:
      'Chefer remembers what you bought and plans around it — fewer duplicates, visible savings, zero-waste weeks.',
  },
  {
    icon: '💶',
    title: 'Budget-aware weeks',
    description:
      'Set "keep my week under €X" and generation favours affordable meals to stay within it.',
  },
] as const;

const FAQ = [
  {
    q: 'What does it cost during the beta?',
    a: 'Nothing. Every feature — premium included — is free while Chefer is in beta, and we never ask for payment details. The free tier stays free after the beta too.',
  },
  {
    q: 'Do I need to fill in a big profile first?',
    a: 'No. Tell us your allergies (30 seconds, optional) and you get a full week immediately. Add goals and body metrics whenever you want plans built around your body.',
  },
  {
    q: 'What happens to my data?',
    a: 'It stays yours: no ads, no selling data, daily backups. See the privacy policy for the plain-language version.',
  },
] as const;

// Static preview of a real plan day — shows, rather than claims, what the
// product produces (numbers match a real generated Mediterranean day).
const PREVIEW_MEALS = [
  { type: 'Breakfast', name: 'Ricotta with honey & walnuts', kcal: 480, emoji: '🥣' },
  { type: 'Lunch', name: 'Minestrone with white beans', kcal: 620, emoji: '🍲' },
  { type: 'Dinner', name: 'Baked cod, lemon & herbs', kcal: 750, emoji: '🐟' },
] as const;

export default async function HomePage() {
  // Redirect authenticated users straight to their dashboard. Validate the
  // session — a stale cookie should see the landing page, not an empty dashboard.
  if (await getSessionUser()) {
    redirect('/dashboard');
  }

  return (
    <div className="flex min-h-dvh flex-col bg-white text-gray-900">
      {/* ── Top bar ── */}
      <header className="flex h-16 items-center justify-between border-b border-orange-100 px-4 sm:px-8">
        <div className="flex items-center gap-2">
          <span className="text-xl" aria-hidden="true">
            🍽️
          </span>
          <span className="font-serif text-lg font-semibold tracking-tight text-[#944a00]">
            Chefer
          </span>
        </div>
        <Link
          href="/login"
          className="rounded-lg px-4 py-2 text-sm font-semibold text-gray-700 transition-colors hover:bg-gray-100"
        >
          Sign in
        </Link>
      </header>

      {/* ── Hero ── */}
      <section className="bg-gradient-to-b from-[#fff3e8] to-white px-4 py-16 text-center sm:py-24">
        <div className="mx-auto max-w-3xl">
          <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-amber-200 bg-amber-50 px-4 py-1.5 text-sm font-medium text-amber-900">
            <span aria-hidden="true">✨</span>
            Open beta — everything free, premium features included
          </div>

          <h1 className="mb-5 font-serif text-4xl font-semibold tracking-tight sm:text-5xl lg:text-6xl">
            Your personal chef,
            <br />
            <span style={{ color: BRAND }}>powered by AI</span>
          </h1>

          <p className="mx-auto mb-10 max-w-xl text-base text-gray-600 sm:text-lg">
            A week of meals built around your goals, allergies and budget — with the shopping list
            priced and ready. No spreadsheet, no nutritionist, no guesswork.
          </p>

          <div className="flex w-full flex-col items-center justify-center gap-3 sm:flex-row sm:gap-4">
            <Link
              href="/register"
              className="inline-flex h-12 w-full items-center justify-center rounded-xl bg-[#944a00] px-8 text-sm font-semibold text-white transition-colors hover:bg-[#7a3d00] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#944a00] focus-visible:ring-offset-2 sm:w-auto"
            >
              Get started free
            </Link>
            <Link
              href="/login"
              className="inline-flex h-12 w-full items-center justify-center rounded-xl border border-gray-300 bg-white px-8 text-sm font-semibold text-gray-800 transition-colors hover:bg-gray-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#944a00] focus-visible:ring-offset-2 sm:w-auto"
            >
              Sign in
            </Link>
          </div>
          <p className="mt-4 text-xs text-gray-500">
            First plan on screen in under a minute — no payment details, ever.
          </p>
        </div>

        {/* ── Plan-day preview card ── */}
        <div className="mx-auto mt-14 w-full max-w-md rounded-2xl border bg-white p-4 text-left shadow-lg sm:p-5">
          <div className="mb-3 flex items-center justify-between">
            <p className="text-[11px] font-semibold uppercase tracking-widest text-gray-500">
              Tuesday · your plan
            </p>
            <span className="rounded-full bg-emerald-100 px-2.5 py-0.5 text-[10px] font-bold text-emerald-700">
              ≈ €42.90 this week
            </span>
          </div>
          <ul className="divide-y">
            {PREVIEW_MEALS.map((meal) => (
              <li key={meal.type} className="flex items-center gap-3 py-2.5">
                <span className="text-2xl" aria-hidden="true">
                  {meal.emoji}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-400">
                    {meal.type}
                  </p>
                  <p className="truncate text-sm font-medium text-gray-900">{meal.name}</p>
                </div>
                <span className="text-xs tabular-nums text-gray-500">{meal.kcal} kcal</span>
              </li>
            ))}
          </ul>
          <div className="mt-3 flex items-center justify-between rounded-xl bg-[#fff3e8] px-3 py-2">
            <span className="text-xs font-medium text-[#944a00]">Day total</span>
            <span className="text-xs font-bold tabular-nums text-[#944a00]">
              1,850 of 1,900 kcal
            </span>
          </div>
        </div>
      </section>

      {/* ── Free features ── */}
      <section className="px-4 py-14 sm:py-20">
        <div className="mx-auto max-w-5xl">
          <div className="mb-12 text-center">
            <h2 className="mb-3 font-serif text-3xl font-semibold tracking-tight">
              Everything you need to eat well
            </h2>
            <p className="text-gray-600">Free. Not a trial — the free tier stays free.</p>
          </div>
          <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-4">
            {FREE_FEATURES.map(({ icon, title, description }) => (
              <div key={title} className="rounded-2xl border bg-white p-5 shadow-sm">
                <div className="mb-3 text-3xl" aria-hidden="true">
                  {icon}
                </div>
                <h3 className="mb-1.5 text-sm font-semibold">{title}</h3>
                <p className="text-xs leading-relaxed text-gray-500">{description}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Premium features ── */}
      <section className="bg-gradient-to-b from-white to-[#fff3e8]/60 px-4 py-14 sm:py-20">
        <div className="mx-auto max-w-5xl">
          <div className="mb-12 text-center">
            <p className="mb-2 text-xs font-bold uppercase tracking-widest text-[#944a00]">
              Premium · free while in beta
            </p>
            <h2 className="mb-3 font-serif text-3xl font-semibold tracking-tight">
              A chef that knows you — and your week
            </h2>
            <p className="mx-auto max-w-xl text-gray-600">
              Premium turns Chefer from a recipe book into a personal chef. During the beta it costs
              nothing — one click activates it, no card asked.
            </p>
          </div>
          <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {PREMIUM_FEATURES.map(({ icon, title, description }) => (
              <div
                key={title}
                className="rounded-2xl border border-amber-100 bg-white p-5 shadow-sm"
              >
                <div className="mb-3 text-3xl" aria-hidden="true">
                  {icon}
                </div>
                <h3 className="mb-1.5 text-sm font-semibold">{title}</h3>
                <p className="text-xs leading-relaxed text-gray-500">{description}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── FAQ ── */}
      <section className="px-4 py-14 sm:py-20">
        <div className="mx-auto max-w-2xl">
          <h2 className="mb-8 text-center font-serif text-3xl font-semibold tracking-tight">
            Fair questions
          </h2>
          <div className="space-y-4">
            {FAQ.map(({ q, a }) => (
              <div key={q} className="rounded-2xl border bg-white p-5">
                <h3 className="mb-1 text-sm font-semibold">{q}</h3>
                <p className="text-sm leading-relaxed text-gray-600">{a}</p>
              </div>
            ))}
          </div>
          <div className="mt-10 text-center">
            <Link
              href="/register"
              className="inline-flex h-12 items-center justify-center rounded-xl bg-[#944a00] px-8 text-sm font-semibold text-white transition-colors hover:bg-[#7a3d00]"
            >
              Cook something better this week
            </Link>
          </div>
        </div>
      </section>

      {/* ── Footer ── */}
      <footer className="border-t px-4 py-8 text-center text-sm text-gray-500">
        <p>
          Chefer is a small independent project in open beta — feedback shapes it weekly, from the{' '}
          <em>Send feedback</em> button inside the app.
        </p>
        <p className="mt-3">
          <Link href="/terms" className="underline underline-offset-4 hover:text-gray-700">
            Terms of Service
          </Link>{' '}
          ·{' '}
          <Link href="/privacy" className="underline underline-offset-4 hover:text-gray-700">
            Privacy Policy
          </Link>
        </p>
        <p className="mt-3 text-xs">&copy; {new Date().getFullYear()} Chefer</p>
      </footer>
    </div>
  );
}
