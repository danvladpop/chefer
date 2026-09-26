import type { Metadata } from 'next';
import Link from 'next/link';

export const metadata: Metadata = { title: 'Terms of Service' };

// Plain-language beta terms. The register/login pages have linked here since
// launch — until this page existed, that link 404'd (review L-3).

export default function TermsPage() {
  return (
    <main id="main" className="mx-auto max-w-2xl px-4 py-12">
      <h1 className="font-serif text-3xl font-semibold text-gray-900">Terms of Service</h1>
      <p className="mt-2 text-sm text-gray-500">Chefer beta · last updated 23 August 2026</p>

      <div className="mt-8 space-y-6 text-sm leading-relaxed text-gray-700">
        <section>
          <h2 className="mb-1 font-semibold text-gray-900">The short version</h2>
          <p>
            Chefer is a meal-planning app in open beta. It is free to use while in beta — including
            every premium feature — and we will announce any future pricing well in advance, inside
            the app.
          </p>
        </section>
        <section>
          <h2 className="mb-1 font-semibold text-gray-900">Not medical advice</h2>
          <p>
            Meal plans, calorie targets and nutrition estimates are generated automatically and are
            approximate. They are not medical or dietetic advice. If you have a medical condition,
            an eating disorder history, or specific clinical needs, talk to a professional before
            following any generated plan.
          </p>
        </section>
        <section>
          <h2 className="mb-1 font-semibold text-gray-900">Allergies</h2>
          <p>
            We filter recipes against the allergies and restrictions you declare, and we take that
            seriously — but automated filtering can miss things. Always check ingredients yourself
            before cooking or buying.
          </p>
        </section>
        <section>
          <h2 className="mb-1 font-semibold text-gray-900">Your content</h2>
          <p>
            Recipes you import or create stay in your personal collection and are not shared with
            other users. You keep whatever rights you have in them.
          </p>
        </section>
        <section>
          <h2 className="mb-1 font-semibold text-gray-900">Beta means beta</h2>
          <p>
            Things may break, change or be reset while we build. We do keep backups and we will not
            delete your data on purpose without telling you first. The service is provided as-is,
            without warranties, to the extent the law allows.
          </p>
        </section>
        <section>
          <h2 className="mb-1 font-semibold text-gray-900">Contact</h2>
          <p>
            Use the <em>Send feedback</em> button inside the app — a person reads every note.
          </p>
        </section>
      </div>

      <p className="mt-10 text-sm">
        <Link
          href="/"
          className="touch-target relative text-[#944a00] underline underline-offset-4"
        >
          ← Back to Chefer
        </Link>{' '}
        ·{' '}
        <Link
          href="/privacy"
          className="touch-target relative text-[#944a00] underline underline-offset-4"
        >
          Privacy Policy
        </Link>
      </p>
    </main>
  );
}
