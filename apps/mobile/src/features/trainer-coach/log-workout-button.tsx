import { router } from 'expo-router';
import { BOOKING_COPY } from '@chefer/types';
import { Button } from '@chefer/ui-mobile';
import { NO_BOOKING } from './coach-model';

/**
 * Client detail (trainer-mode.md §6.5, §6.7): "Log a workout for Maria" — the coached logger with no
 * booking, on the client's next routine day. Trainer mode only (the caller decides).
 */
export function LogCoachedWorkoutButton({
  clientId,
  firstName,
}: {
  clientId: string;
  firstName: string;
}) {
  return (
    <Button
      testID="trainer-client-log-workout"
      variant="outline"
      onPress={() =>
        router.push({
          pathname: '/trainer/coach/[bookingId]',
          params: { bookingId: NO_BOOKING, clientId },
        })
      }
    >
      {BOOKING_COPY.clientDetail.logWorkout(firstName)}
    </Button>
  );
}
