import { FriendsBlockedScreen } from '../../src/features/friends/settings/blocked-screen';

// Blocked people (UX §11.6). Gated on `friends.availability` inside the screen.
export default function FriendsBlockedRoute() {
  return <FriendsBlockedScreen />;
}
