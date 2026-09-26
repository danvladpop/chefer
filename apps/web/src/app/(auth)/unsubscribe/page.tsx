import type { Metadata } from 'next';
import { Suspense } from 'react';
import { EmailLinkShell } from '@/features/email/components/email-link-shell';
import { UnsubscribeView } from '@/features/email/components/unsubscribe-view';

export const metadata: Metadata = {
  title: 'Unsubscribe',
  description: 'Weekly email settings',
  robots: { index: false },
};

export default function UnsubscribePage() {
  return (
    <EmailLinkShell title="Email settings">
      {/* useSearchParams requires a Suspense boundary in production builds */}
      <Suspense fallback={null}>
        <UnsubscribeView />
      </Suspense>
    </EmailLinkShell>
  );
}
