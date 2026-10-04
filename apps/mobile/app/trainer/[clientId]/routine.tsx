import { useLocalSearchParams } from 'expo-router';
import { TrainerGate } from '../../../src/features/trainer/components/trainer-gate';
import { TrainerRoutineScreen } from '../../../src/features/trainer/routine/trainer-routine-screen';

// `/trainer/[clientId]/routine`: the client's routine in the shared editor, plus next-session targets.
export default function TrainerRoutineRoute() {
  const { clientId } = useLocalSearchParams<{ clientId?: string }>();
  return (
    <TrainerGate>
      <TrainerRoutineScreen clientId={typeof clientId === 'string' ? clientId : ''} />
    </TrainerGate>
  );
}
