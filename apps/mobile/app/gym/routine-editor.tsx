import { GymPlaceholder } from '../../src/features/gym/components/gym-placeholder';

// Gym stack route — placeholder (G1-C); wave G2 replaces this screen's body.
export default function GymRoutineEditorScreen() {
  return (
    <GymPlaceholder
      variant="stack"
      title="Edit routine"
      testID="gym-routine-editor-title"
      description="Days, exercises, sets, rep ranges and rest (G2-C)."
    />
  );
}
