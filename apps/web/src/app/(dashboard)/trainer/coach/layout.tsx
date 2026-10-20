import type { Metadata } from 'next';

// Per-segment tab title (trainer-mode.md §6.7); the pages are client components.
export const metadata: Metadata = { title: 'Coaching', robots: { index: false } };

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
