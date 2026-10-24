import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { smartAppBanner } from '@/features/app-stores/store-metadata';
import { safeNextPath } from '@/features/coaching/lib/next-path';
import { SignedOutHouseholdInvite } from '@/features/household-sharing/components/SignedOutHouseholdInvite';
import { HOUSEHOLD_SHARING_COPY } from '@chefer/types';

export const metadata: Metadata = {
  ...smartAppBanner(),
  title: HOUSEHOLD_SHARING_COPY.joinPageTitle,
  robots: { index: false },
};

// Never linked to: middleware.ts rewrites a signed-out phone's /household/join/<code>
// here, so the visible address stays the invite link.
export default async function HouseholdInvitePage({
  params,
}: {
  params: Promise<{ code: string }>;
}) {
  const { code } = await params;
  if (!safeNextPath(`/household/join/${code}`)) notFound();
  return <SignedOutHouseholdInvite code={code} />;
}
