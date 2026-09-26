import type { Metadata } from 'next';
import Link from 'next/link';
import { SUPPORT_EMAIL } from '@chefer/types';

export const metadata: Metadata = {
  title: 'Help & Support',
  description: 'How to get help with Chefer: contact, password reset, account deletion and AI.',
};

// Public support page — the Support URL App Store Connect requires. No auth
// (not in middleware.ts PROTECTED_ROUTES); same look as /privacy and /terms.

const linkClass = 'touch-target relative text-[#944a00] underline underline-offset-4';

const FAQ: { q: string; a: React.ReactNode }[] = [
  {
    q: 'How do I reset my password?',
    a: (
      <>
        On the sign-in screen, tap <em>Forgot password?</em> and enter your email. We send a link
        that lets you choose a new password; it expires after a short while, so use it soon. No
        email? Check your spam folder, or write to us.
      </>
    ),
  },
  {
    q: 'How do I delete my account?',
    a: (
      <>
        Go to <em>Profile → Delete account</em>, on the web or in the iOS and Android app. Confirm
        with your password and type DELETE. Your account and all of its data — preferences, plans,
        logs, recipes, workouts and household — are removed straight away and you are signed out on
        every device. This can&apos;t be undone. Want a copy first? Use{' '}
        <em>Profile → Your data → Download my data</em>. See the{' '}
        <Link href="/privacy" className={linkClass}>
          privacy policy
        </Link>{' '}
        for how long backups keep a copy.
      </>
    ),
  },
  {
    q: 'How does Chefer use AI?',
    a: (
      <>
        Premium meal plans and swaps, meal-photo scanning, recipe import, the AI chef chat and the
        AI shopping-list tidy-up send the data each one needs (for example your preferences and
        allergies, goals and body metrics, or the photo or message you submitted) to Google Gemini
        to produce the result. We ask for your permission before the first one runs, and you can
        turn it off at any time in <em>Profile → AI &amp; your data</em>. Your data is not used to
        train AI models. AI output can be wrong — always check ingredients against your allergies.
      </>
    ),
  },
  {
    q: 'Is Premium free?',
    a: (
      <>
        Yes, for now. Every premium feature is free to use today. If that ever changes, we will tell
        you well in advance, inside the app — nothing is charged automatically.
      </>
    ),
  },
];

export default function SupportPage() {
  return (
    <main id="main" className="mx-auto max-w-2xl px-4 py-12">
      <h1 className="font-serif text-3xl font-semibold text-gray-900">Help &amp; Support</h1>
      <p className="mt-2 text-sm text-gray-500">Chefer · last updated 26 September 2026</p>

      <div className="mt-8 space-y-6 text-sm leading-relaxed text-gray-700">
        <section>
          <h2 className="mb-1 font-semibold text-gray-900">What Chefer is</h2>
          <p>
            Chefer plans a week of meals around your goals and allergies, prices the shopping list,
            tracks what you eat and plans your gym training. It runs on the web and as an app for
            iPhone and Android, with one account for both.
          </p>
        </section>

        <section>
          <h2 className="mb-1 font-semibold text-gray-900">Get help</h2>
          <ul className="list-disc space-y-1 pl-5">
            <li>
              In the app: <em>Send feedback</em> (in the menu on the web, under <em>More</em> in the
              iOS and Android app). A person reads every note.
            </li>
            <li>
              By email:{' '}
              <a href={`mailto:${SUPPORT_EMAIL}`} className={linkClass}>
                {SUPPORT_EMAIL}
              </a>
              . Include the email address you signed up with so we can find your account.
            </li>
          </ul>
        </section>

        <section>
          <h2 className="mb-2 font-semibold text-gray-900">Frequently asked questions</h2>
          <div className="space-y-4">
            {FAQ.map(({ q, a }) => (
              <div key={q}>
                <h3 className="font-medium text-gray-900">{q}</h3>
                <p className="mt-1">{a}</p>
              </div>
            ))}
          </div>
        </section>
      </div>

      <p className="mt-10 text-sm">
        <Link href="/" className={linkClass}>
          ← Back to Chefer
        </Link>{' '}
        ·{' '}
        <Link href="/privacy" className={linkClass}>
          Privacy Policy
        </Link>{' '}
        ·{' '}
        <Link href="/terms" className={linkClass}>
          Terms of Service
        </Link>
      </p>
    </main>
  );
}
