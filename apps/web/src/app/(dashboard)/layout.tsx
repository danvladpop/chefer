import { cookies } from 'next/headers';
import { AiConsentProvider } from '@/features/ai-consent/AiConsentProvider';
import { ChatWidgetGate } from '@/features/chat/components/ChatWidgetGate';
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
    // AI data consent guard (App Store 5.1.2(i)) for every AI action below.
    <AiConsentProvider>
      <DashboardShell initialMode={initialMode}>
        {children}
        {/* Hidden on /gym/workout*: the active workout stays distraction-free. */}
        <ChatWidgetGate />
      </DashboardShell>
    </AiConsentProvider>
  );
}
