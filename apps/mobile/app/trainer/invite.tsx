import { TrainerGate } from '../../src/features/trainer/components/trainer-gate';
import { InviteScreen } from '../../src/features/trainer/invite/invite-screen';

// `/trainer/invite`: create and share a client invite link, list pending invites.
export default function TrainerInviteRoute() {
  return (
    <TrainerGate>
      <InviteScreen />
    </TrainerGate>
  );
}
