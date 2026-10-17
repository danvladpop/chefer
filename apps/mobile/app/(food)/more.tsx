import { FOOD_MORE_ITEMS } from '../../src/features/more/more-items';
import { MoreScreen } from '../../src/features/more/more-screen';

// Food mode's More tab — the item list lives in features/more (shared body
// with Gym's More, FB7-01).
export default function FoodMoreScreen() {
  return <MoreScreen items={FOOD_MORE_ITEMS} />;
}
