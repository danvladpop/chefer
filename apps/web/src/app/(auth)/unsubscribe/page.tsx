import type { Metadata } from 'next';
import { Suspense } from 'react';
import { EmailLinkShell } from '@/features/email/components/email-link-shell';
import { UnsubscribeView } from '@/features/email/components/unsubscribe-view';
import { getServerTranslator } from '@/lib/i18n/server';

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getServerTranslator();
  return {
    title: t('auth.emailLinks.unsubscribeTitle'),
    description: t('auth.emailLinks.unsubscribeDescription'),
    robots: { index: false },
  };
}

export default async function UnsubscribePage() {
  const { t } = await getServerTranslator();
  return (
    <EmailLinkShell title={t('auth.emailLinks.unsubscribeHeading')}>
      {/* useSearchParams requires a Suspense boundary in production builds */}
      <Suspense fallback={null}>
        <UnsubscribeView />
      </Suspense>
    </EmailLinkShell>
  );
}
