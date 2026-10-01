import { FriendsGate } from '../../src/features/friends/components/friends-gate';
import { FriendsEntry } from '../../src/features/friends/home/friends-entry';

// `/friends`: the intro until the person turns Following on, then the home
// (UX §4–§5). Inside the availability gate like every Following route.
export default function FriendsHomeRoute() {
  return (
    <FriendsGate>
      <FriendsEntry />
    </FriendsGate>
  );
}
