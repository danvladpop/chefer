import type { Metadata } from 'next';
import Link from 'next/link';

export const metadata: Metadata = { title: 'Privacy Policy' };

// Plain-language beta privacy policy — linked from register/login since
// launch; the link 404'd until this page existed (review L-3).

export default function PrivacyPage() {
  return (
    <main className="mx-auto max-w-2xl px-4 py-12">
      <h1 className="font-serif text-3xl font-semibold text-gray-900">Privacy Policy</h1>
      <p className="mt-2 text-sm text-gray-500">Chefer beta · last updated 23 August 2026</p>

      <div className="mt-8 space-y-6 text-sm leading-relaxed text-gray-700">
        <section>
          <h2 className="mb-1 font-semibold text-gray-900">What we store</h2>
          <p>
            Your account (name, email, hashed password) and what you put into the app: dietary
            preferences and allergies, goals and body metrics, household members, meal plans,
            recipes, logs, weights, pantry items and feedback. We store it to run the product —
            nothing else.
          </p>
        </section>
        <section>
          <h2 className="mb-1 font-semibold text-gray-900">AI processing</h2>
          <p>
            Plan generation, meal-photo scanning, recipe import and chat send the relevant data
            (your preferences, targets, the photo or page you submitted) to an AI provider
            (currently Google Gemini) to produce the result. We do not use your data to train
            models.
          </p>
        </section>
        <section>
          <h2 className="mb-1 font-semibold text-gray-900">Analytics &amp; errors</h2>
          <p>
            We use PostHog for product analytics and Sentry for error reporting, to see what breaks
            and what gets used. We do not sell data or run third-party ads.
          </p>
        </section>
        <section>
          <h2 className="mb-1 font-semibold text-gray-900">Backups &amp; deletion</h2>
          <p>
            The database is backed up daily. You can download all your data or delete your account
            and everything in it at any time from <em>Profile → Your data</em>, on the web or in the
            app. Deleted data is gone from the live database immediately and ages out of backups
            within 14 days.
          </p>
        </section>
      </div>

      <p className="mt-10 text-sm">
        <Link href="/" className="text-[#944a00] underline underline-offset-4">
          ← Back to Chefer
        </Link>{' '}
        ·{' '}
        <Link href="/terms" className="text-[#944a00] underline underline-offset-4">
          Terms of Service
        </Link>
      </p>
    </main>
  );
}
