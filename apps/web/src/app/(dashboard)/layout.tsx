import { NavBar } from '@/features/nav/components/nav-bar';

interface DashboardLayoutProps {
  children: React.ReactNode;
}

export default function DashboardLayout({ children }: DashboardLayoutProps) {
  return (
    <>
      <NavBar />
      <main className="flex-1">{children}</main>
    </>
  );
}
