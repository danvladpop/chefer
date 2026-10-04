import type { Metadata } from 'next';

// Per-segment tab title; the page is a client component and cannot export metadata.
export const metadata: Metadata = { title: 'Join your trainer', robots: { index: false } };

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
