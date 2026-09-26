import type { Metadata } from 'next';

// Per-segment tab title (F-X-1-1) — the page itself is a client component and
// can't export metadata. Renders as "Workout summary | Chefer" via the root template.
export const metadata: Metadata = { title: 'Workout summary' };

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
