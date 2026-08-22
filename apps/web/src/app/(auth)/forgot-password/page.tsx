import type { Metadata } from 'next';
import Link from 'next/link';
import { ForgotPasswordForm } from '@/features/auth/components/forgot-password-form';

export const metadata: Metadata = {
  title: 'Forgot Password',
  description: 'Request a password reset link',
  robots: { index: false },
};

export default function ForgotPasswordPage() {
  return (
    <div className="flex min-h-dvh flex-col items-center px-4 py-8 sm:py-12">
      {/* my-auto (not justify-center on the parent): auto margins collapse to 0
          when the card overflows a short phone viewport, keeping the top reachable. */}
      <div className="my-auto w-full max-w-md space-y-8">
        <div className="text-center">
          <Link href="/" className="inline-flex items-center gap-2 text-2xl font-bold">
            <span className="text-3xl" aria-hidden="true">
              🍽️
            </span>
            <span>PersonalChef.ai</span>
          </Link>
          <h1 className="mt-4 text-2xl font-bold tracking-tight">Forgot your password?</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Enter your email and we&apos;ll send you a reset link
          </p>
        </div>

        <div className="rounded-xl border bg-card p-6 shadow-sm sm:p-8">
          <ForgotPasswordForm />
        </div>

        <p className="text-center text-sm text-muted-foreground">
          Remembered it?{' '}
          <Link
            href="/login"
            className="font-medium text-primary underline underline-offset-4 hover:text-primary/80"
          >
            Sign in
          </Link>
        </p>
      </div>
    </div>
  );
}
