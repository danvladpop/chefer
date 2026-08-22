import type { Metadata } from 'next';
import Link from 'next/link';
import { Suspense } from 'react';
import { ResetPasswordForm } from '@/features/auth/components/reset-password-form';

export const metadata: Metadata = {
  title: 'Reset Password',
  description: 'Choose a new password',
  robots: { index: false },
};

export default function ResetPasswordPage() {
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
          <h1 className="mt-4 text-2xl font-bold tracking-tight">Choose a new password</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            This link works once and expires an hour after it was requested
          </p>
        </div>

        <div className="rounded-xl border bg-card p-6 shadow-sm sm:p-8">
          {/* useSearchParams requires a Suspense boundary in production builds */}
          <Suspense fallback={null}>
            <ResetPasswordForm />
          </Suspense>
        </div>
      </div>
    </div>
  );
}
