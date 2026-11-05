import { HouseholdJoinFlow } from '@/features/household-sharing/components/HouseholdJoinFlow';

export default async function HouseholdJoinPage({ params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  return <HouseholdJoinFlow code={decodeURIComponent(code)} />;
}
