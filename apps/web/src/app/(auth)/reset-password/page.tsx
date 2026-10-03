import type { Metadata } from 'next';
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
      {/* sm:my-auto (UX-ACC-14: top-aligned on phones so fields do not jump as errors
          appear; not justify-center on the parent): auto margins collapse to 0
          when the card overflows a short phone viewport, keeping the top reachable. */}
      <div className="w-full max-w-md space-y-8 sm:my-auto">
        {/* The form owns the logo + heading + card (UX-ACC-09: the heading follows
            the stage); useSearchParams requires a Suspense boundary in production builds */}
        <Suspense fallback={null}>
          <ResetPasswordForm />
        </Suspense>
      </div>
    </div>
  );
}
