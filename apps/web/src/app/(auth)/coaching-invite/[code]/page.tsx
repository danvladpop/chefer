import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { smartAppBanner } from '@/features/app-stores/store-metadata';
import { SignedOutInvite } from '@/features/coaching/components/SignedOutInvite';
import { safeNextPath } from '@/features/coaching/lib/next-path';

export const metadata: Metadata = {
  ...smartAppBanner(),
  title: 'Join your trainer',
  robots: { index: false },
};

// Never linked to: middleware.ts rewrites a signed-out phone's /coaching/join/<code>
// here, so the visible address stays the invite link.
export default async function CoachingInvitePage({
  params,
}: {
  params: Promise<{ code: string }>;
}) {
  const { code } = await params;
  if (!safeNextPath(`/coaching/join/${code}`)) notFound();
  return <SignedOutInvite code={code} />;
}
