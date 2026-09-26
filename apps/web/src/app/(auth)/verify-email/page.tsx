import type { Metadata } from 'next';
import { Suspense } from 'react';
import { EmailLinkShell } from '@/features/email/components/email-link-shell';
import { VerifyEmailView } from '@/features/email/components/verify-email-view';

export const metadata: Metadata = {
  title: 'Confirm your email',
  description: 'Confirm your email address for weekly emails',
  robots: { index: false },
};

export default function VerifyEmailPage() {
  return (
    <EmailLinkShell title="Confirm your email">
      {/* useSearchParams requires a Suspense boundary in production builds */}
      <Suspense fallback={null}>
        <VerifyEmailView />
      </Suspense>
    </EmailLinkShell>
  );
}
