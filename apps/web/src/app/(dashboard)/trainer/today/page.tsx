import { TrainerModeGate } from '@/features/trainer-mode/components/TrainerModeGate';
import { TrainerToday } from '@/features/trainer-mode/components/TrainerToday';
import { getServerTranslator } from '@/lib/i18n/server';

/** Trainer mode's Today (trainer-mode.md §6.1); without trainer mode, /trainer takes over. */
export default async function TrainerTodayPage() {
  const { t } = await getServerTranslator();
  return (
    <TrainerModeGate title={t('nav.items.today')}>
      <TrainerToday />
    </TrainerModeGate>
  );
}
