import type { Metadata } from 'next';
import Link from 'next/link';
import { StoreBadges } from '@/features/app-stores/components/StoreBadges';
import { serializeJsonLd, smartAppBanner } from '@/features/app-stores/store-metadata';
import { PublicFooter, PublicHeader } from '@/features/marketing/components/PublicChrome';
import { SwitchPageViewed } from '@/features/switch/components/SwitchPageViewed';
import {
  CARRIES_OVER,
  CHEFER_ADDS,
  IMPORT_STEPS,
  MEALIME_CLOSING_URL,
  NOT_AFFILIATED,
  SWITCH_DESCRIPTION,
  SWITCH_FAQ,
  SWITCH_TITLE,
  type SwitchFeature,
} from '@/features/switch/mealime-content';
import { mealimeSwitchJsonLd } from '@/features/switch/switch-json-ld';
import { env } from '@/lib/env';
import { pressControl } from '@chefer/ui';
import { cn } from '@chefer/utils';

// ─── /switch/mealime (market review 2026-10, lane L) ──────────────────────────
// Public page for people whose meal planner closed on 2026-10-21. Same brand
// and chrome as the landing page; copy and sources live in mealime-content.ts.
// Static: no session check, so a signed-in reader sees it too.

export const metadata: Metadata = {
  ...smartAppBanner(),
  title: SWITCH_TITLE,
  description: SWITCH_DESCRIPTION,
  alternates: { canonical: '/switch/mealime' },
  openGraph: {
    type: 'website',
    url: '/switch/mealime',
    title: `${SWITCH_TITLE} | Chefer`,
    description: SWITCH_DESCRIPTION,
    siteName: 'Chefer',
  },
};

const primaryCta = cn(
  'inline-flex h-12 w-full items-center justify-center rounded-xl bg-[#944a00] px-8 text-sm font-semibold text-white hover:bg-[#7a3d00] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#944a00] focus-visible:ring-offset-2 sm:w-auto',
  pressControl,
);

function FeatureGrid({ items, tone }: { items: readonly SwitchFeature[]; tone: 'plain' | 'warm' }) {
  return (
    <ul
      className={cn(
        'grid grid-cols-1 gap-4 sm:grid-cols-2 sm:gap-6',
        items.length > 4 ? 'lg:grid-cols-3' : 'lg:grid-cols-4',
      )}
    >
      {items.map(({ icon, title, description }) => (
        <li
          key={title}
          className={cn(
            'rounded-2xl border bg-white p-5 shadow-sm',
            tone === 'warm' && 'border-amber-100',
          )}
        >
          <div className="mb-3 text-3xl" aria-hidden="true">
            {icon}
          </div>
          <h3 className="mb-1.5 text-sm font-semibold">{title}</h3>
          <p className="text-sm leading-relaxed text-gray-600">{description}</p>
        </li>
      ))}
    </ul>
  );
}

export default function MealimeSwitchPage() {
  return (
    <div className="flex min-h-dvh flex-col bg-white text-gray-900">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: serializeJsonLd(mealimeSwitchJsonLd(env.NEXT_PUBLIC_APP_URL)),
        }}
      />
      <SwitchPageViewed source="mealime" />
      <PublicHeader />

      <main id="main" tabIndex={-1} className="flex-1 outline-none">
        {/* ── Hero ── */}
        <section className="bg-gradient-to-b from-[#fff3e8] to-white px-4 py-14 text-center sm:py-20">
          <div className="mx-auto max-w-3xl">
            <p className="mb-5 inline-flex items-center rounded-full border border-amber-200 bg-amber-50 px-4 py-1.5 text-sm font-medium text-amber-900">
              Switching meal planners?
            </p>
            <h1 className="mb-5 font-serif text-4xl font-semibold tracking-tight sm:text-5xl">
              A Mealime alternative for your weekly meal plan
            </h1>
            <p className="mx-auto mb-8 max-w-xl text-base text-gray-600 sm:text-lg">
              Mealime closed on 21 October 2026 (
              <a
                href={MEALIME_CLOSING_URL}
                rel="noopener noreferrer"
                className="touch-target relative text-[#944a00] underline underline-offset-4"
              >
                its closing notice
              </a>
              ). If you used it to plan the week and shop from one list, Chefer does that too, and
              adds a few things. Free to use on the web and on your phone.
            </p>
            <Link href="/register" className={primaryCta}>
              Get started free
            </Link>
            <p className="mt-8 text-sm font-medium text-gray-700">Or get the app on your phone</p>
            <StoreBadges campaign="switch-mealime" className="mt-1" />
            <p className="mx-auto mt-6 max-w-xl text-xs text-gray-500">{NOT_AFFILIATED}</p>
          </div>
        </section>

        {/* ── What carries over ── */}
        <section aria-labelledby="carries-over" className="px-4 py-12 sm:py-16">
          <div className="mx-auto max-w-5xl">
            <div className="mb-8 text-center">
              <h2
                id="carries-over"
                className="mb-2 font-serif text-3xl font-semibold tracking-tight"
              >
                What carries over
              </h2>
              <p className="text-gray-600">The parts of your routine that work the same way.</p>
            </div>
            <FeatureGrid items={CARRIES_OVER} tone="plain" />
          </div>
        </section>

        {/* ── What Chefer adds ── */}
        <section
          aria-labelledby="chefer-adds"
          className="bg-gradient-to-b from-white to-[#fff3e8]/60 px-4 py-12 sm:py-16"
        >
          <div className="mx-auto max-w-5xl">
            <div className="mb-8 text-center">
              <h2
                id="chefer-adds"
                className="mb-2 font-serif text-3xl font-semibold tracking-tight"
              >
                What Chefer adds
              </h2>
              <p className="text-gray-600">Built for households, budgets and the gym.</p>
            </div>
            <FeatureGrid items={CHEFER_ADDS} tone="warm" />
          </div>
        </section>

        {/* ── Moving recipes ── */}
        <section aria-labelledby="move-recipes" className="px-4 py-12 sm:py-16">
          <div className="mx-auto max-w-2xl">
            <h2
              id="move-recipes"
              className="mb-3 text-center font-serif text-3xl font-semibold tracking-tight"
            >
              How to move your favourite recipes
            </h2>
            <p className="mb-8 text-center text-gray-600">
              Chefer can’t read a Mealime account, but any recipe you can still open or have saved
              can come with you, one at a time.
            </p>
            <ol className="space-y-4">
              {IMPORT_STEPS.map(({ title, body }, index) => (
                <li key={title} className="flex gap-4 rounded-2xl border bg-white p-5">
                  <span
                    aria-hidden="true"
                    className="flex size-8 shrink-0 items-center justify-center rounded-full bg-[#fff3e8] text-sm font-bold text-[#944a00]"
                  >
                    {index + 1}
                  </span>
                  <div className="min-w-0">
                    <h3 className="mb-1 text-sm font-semibold">{title}</h3>
                    <p className="text-sm leading-relaxed text-gray-600">{body}</p>
                  </div>
                </li>
              ))}
            </ol>
          </div>
        </section>

        {/* ── FAQ ── */}
        <section aria-labelledby="switch-faq" className="px-4 pb-14 sm:pb-20">
          <div className="mx-auto max-w-2xl">
            <h2
              id="switch-faq"
              className="mb-6 text-center font-serif text-3xl font-semibold tracking-tight"
            >
              Fair questions
            </h2>
            <div className="space-y-4">
              {SWITCH_FAQ.map(({ q, a }) => (
                <div key={q} className="rounded-2xl border bg-white p-5">
                  <h3 className="mb-1 text-sm font-semibold">{q}</h3>
                  <p className="text-sm leading-relaxed text-gray-600">{a}</p>
                </div>
              ))}
            </div>
            <div className="mt-10 text-center">
              <Link href="/register" className={primaryCta}>
                Plan next week in Chefer
              </Link>
              <StoreBadges campaign="switch-mealime" className="mt-6" />
            </div>
          </div>
        </section>
      </main>

      <PublicFooter />
    </div>
  );
}
