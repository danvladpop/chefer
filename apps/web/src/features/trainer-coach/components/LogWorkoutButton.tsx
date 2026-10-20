'use client';

import Link from 'next/link';
import { firstName } from '@/features/trainer/format';
import { Dumbbell } from 'lucide-react';
import { BOOKING_COPY } from '@chefer/types';
import { Button } from '@chefer/ui';

/** Client detail (trainer mode, §6.5/§6.7): coach a workout with no booking. */
export function LogWorkoutButton({ clientId, name }: { clientId: string; name: string }) {
  return (
    <Button asChild variant="outline" className="min-h-11">
      <Link
        href={`/trainer/coach/new?clientId=${encodeURIComponent(clientId)}`}
        data-testid="trainer-log-workout"
      >
        <Dumbbell className="h-4 w-4" aria-hidden="true" />{' '}
        {BOOKING_COPY.clientDetail.logWorkout(firstName(name))}
      </Link>
    </Button>
  );
}
