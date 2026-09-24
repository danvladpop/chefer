import { GymPlaceholder } from '../../src/features/gym/components/gym-placeholder';

// Gym stack route — placeholder (G1-C); wave G2 replaces this screen's body.
export default function GymSetupScreen() {
  return (
    <GymPlaceholder
      variant="stack"
      title="Set up your training"
      testID="gym-setup-title"
      description="Days per week, experience and equipment, then a recommended routine (G2-B)."
    />
  );
}
