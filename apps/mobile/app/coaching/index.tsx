import { YourTrainerScreen } from '../../src/features/coaching/your-trainer/your-trainer-screen';

// `/coaching`: Your trainer (spec §2.3 step 5, §2.6) — who coaches you, what they see and can do, Leave.
// Gates itself on `coaching.availability` (off: "isn’t available right now").
export default function YourTrainerRoute() {
  return <YourTrainerScreen />;
}
