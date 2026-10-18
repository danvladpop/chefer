import { ClientsScreen } from '../../src/features/trainer-mode/clients/clients-screen';

// Trainer mode: Clients (trainer-mode.md §6.4). The screen names itself and
// owns its top bar's "Invite a client" (it opens the invite sheet).
export default function TrainerClientsTab() {
  return <ClientsScreen />;
}
