import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { RegisterForm } from '@/features/auth/components/register-form';
import { getSessionUser } from '@/features/auth/lib/session';

export const metadata: Metadata = {
  title: 'Create Account',
  description: 'Create your Chefer account',
  robots: { index: false },
};

export default async function RegisterPage() {
  // Validate the session rather than trusting the cookie's presence — see
  // getSessionUser for why a stale cookie must not bounce to /dashboard.
  if (await getSessionUser()) {
    redirect('/dashboard');
  }

  return (
    <div className="flex min-h-dvh flex-col items-center px-4 py-8 sm:py-12">
      {/* my-auto (not justify-center on the parent): auto margins collapse to 0
          when the card overflows a short phone viewport, keeping the top reachable. */}
      <div className="my-auto w-full max-w-md space-y-8">
        {/* Logo / Brand */}
        <div className="text-center">
          <Link
            href="/"
            className="inline-flex min-h-11 items-center gap-2 font-serif text-2xl font-semibold text-[#944a00]"
          >
            <span className="text-3xl" aria-hidden="true">
              🍽️
            </span>
            <span>Chefer</span>
          </Link>
          <h1 className="mt-4 font-serif text-2xl font-semibold tracking-tight">
            Create your account
          </h1>
          {/* UX-25 (T-25.2, "only what works on the free tier" rule): the old
              copy ("Start your personal chef journey today") mentioned only
              meal planning — CI-16/CI-25, "meal planning? My friend said it
              does workouts." The Terms/Privacy/16+ disclaimer that used to
              live here as static text is now the explicit checkboxes inside
              RegisterForm (T-39.1/T-26.5) — kept in one place, not both. */}
          <p className="mt-2 text-sm text-muted-foreground">
            Free workout log and weekly meal plans.
          </p>
        </div>

        {/* Register Form Card */}
        <div className="rounded-xl border bg-card p-6 shadow-sm sm:p-8">
          <RegisterForm />
        </div>

        {/* Footer Links */}
        <p className="text-center text-sm text-muted-foreground">
          Already have an account?{' '}
          <Link
            href="/login"
            className="touch-target relative font-medium text-primary underline underline-offset-4 hover:text-primary/80"
          >
            Sign in
          </Link>
        </p>
      </div>
    </div>
  );
}
