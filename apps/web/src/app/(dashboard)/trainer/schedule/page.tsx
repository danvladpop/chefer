import { ScheduleView } from '@/features/trainer-bookings/components/ScheduleView';
import { TrainerModeGate } from '@/features/trainer-mode/components/TrainerModeGate';
import { getServerTranslator } from '@/lib/i18n/server';

/** Schedule (trainer-mode.md §6.2): the trainer's calendar. */
export default async function TrainerSchedulePage() {
  const { t } = await getServerTranslator();
  return (
    <TrainerModeGate title={t('trainer.bookings.schedule.title')}>
      <ScheduleView />
    </TrainerModeGate>
  );
}
