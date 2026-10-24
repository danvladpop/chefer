import type { Metadata } from 'next';

export const metadata: Metadata = { title: 'Curated recipes' };

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
