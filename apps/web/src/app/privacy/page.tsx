import type { Metadata } from 'next';
import Link from 'next/link';
import { SUPPORT_EMAIL } from '@chefer/types';

export const metadata: Metadata = { title: 'Privacy Policy' };

// Plain-language privacy policy — linked from register/login since
// launch; the link 404'd until this page existed (review L-3).

export default function PrivacyPage() {
  return (
    <main id="main" className="mx-auto max-w-2xl px-4 py-12">
      <h1 className="font-serif text-3xl font-semibold text-gray-900">Privacy Policy</h1>
      <p className="mt-2 text-sm text-gray-500">Chefer · last updated 26 September 2026</p>

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
            Plan generation, meal swaps, meal-photo scanning, recipe import, chat and AI
            shopping-list tidy-up send the relevant data (your preferences and allergies, goals and
            body metrics, the photo, recipe or message you submitted) to an AI provider — currently
            Google Gemini; if Gemini is overloaded, a text-only request may be handled by a backup
            AI provider — to produce the result. We do not use your data to train models.
          </p>
          <p className="mt-2">
            We ask for your permission before the first AI feature sends anything, and tell you what
            that feature sends. If you choose <em>Not now</em>, nothing is sent. You can withdraw
            permission at any time in <em>Profile → AI &amp; your data</em>, on the web or in the
            app; we then ask again before the next AI feature runs.
          </p>
        </section>
        <section>
          <h2 className="mb-1 font-semibold text-gray-900">Camera &amp; photos</h2>
          <p>
            The iOS and Android app use your camera or photo library only when you choose to take or
            attach a photo — for example to scan a meal or add a recipe photo. Nothing is read in
            the background.
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
          <h2 className="mb-1 font-semibold text-gray-900">Deleting your account</h2>
          <p>
            You can delete your account yourself at any time: <em>Profile → Delete account</em>, on
            the web or in the iOS and Android app (you confirm with your password). This removes
            your account and everything in it — preferences, plans, logs, recipes, workouts,
            household and feedback — from the live database immediately, and signs you out on every
            device. You can also download all your data first from <em>Profile → Your data</em>.
          </p>
          <p className="mt-2">
            The database is backed up daily. Deleted data rolls off the backups within the 14-day
            backup retention window.
          </p>
        </section>
        <section>
          <h2 className="mb-1 font-semibold text-gray-900">Contact</h2>
          <p>
            Questions about your data or this policy? Email{' '}
            <a
              href={`mailto:${SUPPORT_EMAIL}`}
              className="touch-target relative text-[#944a00] underline underline-offset-4"
            >
              {SUPPORT_EMAIL}
            </a>{' '}
            or see{' '}
            <Link
              href="/support"
              className="touch-target relative text-[#944a00] underline underline-offset-4"
            >
              Help &amp; support
            </Link>
            .
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
          href="/terms"
          className="touch-target relative text-[#944a00] underline underline-offset-4"
        >
          Terms of Service
        </Link>{' '}
        ·{' '}
        <Link
          href="/support"
          className="touch-target relative text-[#944a00] underline underline-offset-4"
        >
          Support
        </Link>
      </p>
    </main>
  );
}
