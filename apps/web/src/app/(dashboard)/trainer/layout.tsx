import type { Metadata } from 'next';

// Per-segment tab title; the pages are client components and cannot export metadata.
export const metadata: Metadata = { title: 'Clients', robots: { index: false } };

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
