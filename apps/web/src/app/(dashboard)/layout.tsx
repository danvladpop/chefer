import { cookies } from 'next/headers';
import { ChatWidget } from '@/features/chat/components/ChatWidget';
import { DashboardShell } from '@/features/nav/components/dashboard-shell';
import { MODE_COOKIE, parseMode } from '@/features/nav/nav-items';

interface DashboardLayoutProps {
  children: React.ReactNode;
}

export default async function DashboardLayout({ children }: DashboardLayoutProps) {
  // Food / Gym mode for pages that belong to neither (profile, premium …), so
  // the server renders the right nav with no flash (gym_plan.md D3).
  const initialMode = parseMode((await cookies()).get(MODE_COOKIE)?.value) ?? 'food';

  return (
    <DashboardShell initialMode={initialMode}>
      {children}
      <ChatWidget />
    </DashboardShell>
  );
}
