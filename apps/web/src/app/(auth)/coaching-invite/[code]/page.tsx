import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { smartAppBanner } from '@/features/app-stores/store-metadata';
import { SignedOutInvite } from '@/features/coaching/components/SignedOutInvite';
import { safeNextPath } from '@/features/coaching/lib/next-path';
import { getServerTranslator } from '@/lib/i18n/server';

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getServerTranslator();
  return {
    ...smartAppBanner(),
    title: t('coaching.join.signedOutTitle'),
    robots: { index: false },
  };
}

// Never linked to: middleware.ts rewrites a signed-out phone's /coaching/join/<code>
// here, so the visible address stays the invite link.
export default async function CoachingInvitePage({
  params,
}: {
  params: Promise<{ code: string }>;
}) {
  const { code } = await params;
  if (!safeNextPath(`/coaching/join/${code}`)) notFound();
  const { t } = await getServerTranslator();
  return <SignedOutInvite code={code} t={t} />;
}
