import { ChatWidget } from '@/features/chat/components/ChatWidget';
import { DashboardShell } from '@/features/nav/components/dashboard-shell';

interface DashboardLayoutProps {
  children: React.ReactNode;
}

export default function DashboardLayout({ children }: DashboardLayoutProps) {
  return (
    <DashboardShell>
      {children}
      <ChatWidget />
    </DashboardShell>
  );
}
