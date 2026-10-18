import type { Metadata } from 'next';

// Per-segment tab title; the page is a client component and cannot export metadata.
export const metadata: Metadata = { title: 'Workouts', robots: { index: false } };

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
