'use client';

import { useRouter } from 'next/navigation';
import { useEffect } from 'react';
import { useAppMode } from '@/features/nav/mode-context';

/** The page frame while trainer mode is being confirmed: its one h1, and a skeleton. */
export function TrainerModeSkeleton({ title }: { title: string }) {
  return (
    <div className="mx-auto w-full max-w-5xl px-4 py-6 sm:px-6">
      <h1 className="sr-only">{title}</h1>
      <div className="h-48 animate-pulse rounded-2xl bg-gray-100" aria-hidden="true" />
    </div>
  );
}

/**
 * Trainer mode's pages (trainer-mode.md §5.4) exist only while the mode is
 * available (flag on + trainer tools active). Otherwise they hand over to
 * `/trainer`, which shows turn-on or "not available" exactly as before. A
 * switch in flight (turning trainer tools off lands on Food Today) is left to
 * finish rather than redirected.
 */
export function TrainerModeGate({ title, children }: { title: string; children: React.ReactNode }) {
  const router = useRouter();
  const { trainerModeAvailable, trainerModeLoading, switching } = useAppMode();
  const leave = !trainerModeLoading && !trainerModeAvailable && !switching;

  useEffect(() => {
    if (leave) router.replace('/trainer');
  }, [leave, router]);

  if (!trainerModeAvailable) return <TrainerModeSkeleton title={title} />;
  return <>{children}</>;
}
