import { GYM_MORE_ITEMS } from '../../src/features/more/more-items';
import { MoreScreen } from '../../src/features/more/more-screen';

// Gym mode's More tab (FB7-01). Named `gym-more`, not `more`: group names
// don't count in the URL, and `/more` already belongs to the Food tab.
export default function GymMoreScreen() {
  return <MoreScreen items={GYM_MORE_ITEMS} mode="gym" />;
}
