import { TrainerClients } from '@/features/trainer-mode/components/TrainerClients';
import { TrainerModeGate } from '@/features/trainer-mode/components/TrainerModeGate';
import { getServerTranslator } from '@/lib/i18n/server';

/** Trainer mode's Clients (trainer-mode.md §6.4); without trainer mode, /trainer takes over. */
export default async function TrainerClientsPage() {
  const { t } = await getServerTranslator();
  return (
    <TrainerModeGate title={t('nav.items.clients')}>
      <TrainerClients />
    </TrainerModeGate>
  );
}
