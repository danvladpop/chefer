import type { Metadata } from 'next';
import { Suspense } from 'react';
import { EmailLinkShell } from '@/features/email/components/email-link-shell';
import { VerifyEmailView } from '@/features/email/components/verify-email-view';
import { getServerTranslator } from '@/lib/i18n/server';

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getServerTranslator();
  return {
    title: t('auth.emailLinks.verifyTitle'),
    description: t('auth.emailLinks.verifyDescription'),
    robots: { index: false },
  };
}

export default async function VerifyEmailPage() {
  const { t } = await getServerTranslator();
  return (
    <EmailLinkShell title={t('auth.emailLinks.verifyTitle')}>
      {/* useSearchParams requires a Suspense boundary in production builds */}
      <Suspense fallback={null}>
        <VerifyEmailView />
      </Suspense>
    </EmailLinkShell>
  );
}
