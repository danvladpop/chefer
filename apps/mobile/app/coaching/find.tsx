import { FindTrainerScreen } from '../../src/features/coaching/find/find-screen';

// `/coaching/find`: Find a trainer by name (PRD 2026-10 §4.1). Gates itself on `coaching.availability`.
export default function FindTrainerRoute() {
  return <FindTrainerScreen />;
}
