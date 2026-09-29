import type { Metadata } from 'next';
import { GymToastHost } from '@/features/gym/shared/gym-toast';

// Per-segment tab title (F-X-1-1) — the page itself is a client component and
// can't export metadata. Renders as "Gym | Chefer" via the root template.
export const metadata: Metadata = { title: 'Gym' };

export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    <>
      {children}
      {/* UX-44 (T-44.5): the "Workout deleted · Undo" toast outlives the page that started it. */}
      <GymToastHost />
    </>
  );
}
