import type { Metadata } from 'next';

// Per-segment tab title (F-X-1-1). /history itself redirects to /my-weeks;
// this still titles the read-only week view at /history/[planId].
export const metadata: Metadata = { title: 'Plan history' };

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
