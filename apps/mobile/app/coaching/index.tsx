import { useLocalSearchParams } from 'expo-router';
import { YourTrainerScreen } from '../../src/features/coaching/your-trainer/your-trainer-screen';

// `/coaching`: Your trainer (spec §2.3 step 5, §2.6) — who coaches you, what they see and can do, Leave.
// Gates itself on `coaching.availability` (off: "isn’t available right now"). `?leave=1` (the consent
// v2 notice's Leave on Today/Train, trainer-mode.md §10) opens the Leave confirmation.
export default function YourTrainerRoute() {
  const { leave } = useLocalSearchParams<{ leave?: string }>();
  return <YourTrainerScreen openLeave={leave === '1'} />;
}
