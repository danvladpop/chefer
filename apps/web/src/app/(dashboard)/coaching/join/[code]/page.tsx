import { JoinFlow } from '@/features/coaching/components/JoinFlow';

export default async function CoachingJoinPage({ params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  return <JoinFlow code={decodeURIComponent(code)} />;
}
