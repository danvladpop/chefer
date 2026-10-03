import type { Metadata } from 'next';

// Per-segment tab title (F-X-1-1). /history itself redirects to /my-weeks;
// this still titles the read-only week view at /history/[planId].
// UX-PLAN-15: the screen is "My weeks › past weeks" now, not "History".
export const metadata: Metadata = { title: 'Past weeks' };

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
