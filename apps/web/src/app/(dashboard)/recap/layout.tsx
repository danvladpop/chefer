import type { Metadata } from 'next';

// Lane E2: per-segment tab title — the page is a client component.
export const metadata: Metadata = { title: 'Your week in review' };

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
