import type { Metadata } from 'next';

// Per-segment tab title (F-X-1-1) — the page itself is a client component and
// can't export metadata. Renders as "Past meal plan | Chefer" via the root template.
export const metadata: Metadata = { title: 'Past meal plan' };

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
