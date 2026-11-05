import type { Metadata } from 'next';

// Per-segment tab title — the page is a client component and can't export
// metadata. Renders as "Import workouts | Chefer" via the root template.
export const metadata: Metadata = { title: 'Import workouts' };

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
