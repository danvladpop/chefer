import { ScheduleView } from '@/features/trainer-bookings/components/ScheduleView';
import { TrainerModeGate } from '@/features/trainer-mode/components/TrainerModeGate';
import { BOOKING_COPY } from '@chefer/types';

/** Schedule (trainer-mode.md §6.2): the trainer's calendar. */
export default function TrainerSchedulePage() {
  return (
    <TrainerModeGate title={BOOKING_COPY.schedule.title}>
      <ScheduleView />
    </TrainerModeGate>
  );
}
