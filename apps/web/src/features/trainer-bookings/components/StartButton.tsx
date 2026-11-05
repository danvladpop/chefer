'use client';

import Link from 'next/link';
import { useT } from '@/lib/i18n';
import { Play } from 'lucide-react';
import { BOOKING_START_EARLY_MIN, type TrainerBookingDto } from '@chefer/types';
import { Button, buttonVariants } from '@chefer/ui';
import { canStartBooking, cn } from '@chefer/utils';

/** Start → the coached logger, enabled from 15 minutes before the start time (§6.1). */
export function StartButton({
  booking,
  now,
  className,
}: {
  booking: TrainerBookingDto;
  now: Date;
  className?: string;
}) {
  const { t } = useT();
  if (canStartBooking(booking, now)) {
    return (
      <Link
        href={`/trainer/coach/${encodeURIComponent(booking.id)}`}
        className={cn(buttonVariants(), 'min-h-11', className)}
        data-testid="booking-start"
      >
        <Play className="h-4 w-4" aria-hidden="true" /> {t('trainer.bookings.detail.start')}
      </Link>
    );
  }
  return (
    <span className="flex flex-col gap-1">
      <Button
        type="button"
        className={cn('min-h-11', className)}
        disabled
        aria-describedby={`start-hint-${booking.id}`}
        data-testid="booking-start"
      >
        <Play className="h-4 w-4" aria-hidden="true" /> {t('trainer.bookings.detail.start')}
      </Button>
      <span id={`start-hint-${booking.id}`} className="text-xs text-gray-600">
        {t('trainer.bookings.detail.startAvailable', { count: BOOKING_START_EARLY_MIN })}
      </span>
    </span>
  );
}
