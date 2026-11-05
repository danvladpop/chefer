import { TrainerModeGate } from '@/features/trainer-mode/components/TrainerModeGate';
import { TrainerYou } from '@/features/trainer-mode/components/TrainerYou';
import { getServerTranslator } from '@/lib/i18n/server';

/** Trainer You on web (trainer-mode.md §6.8); without trainer mode, /trainer takes over. */
export default async function TrainerSettingsPage() {
  const { t } = await getServerTranslator();
  return (
    <TrainerModeGate title={t('nav.items.trainerSettings')}>
      <TrainerYou />
    </TrainerModeGate>
  );
}
