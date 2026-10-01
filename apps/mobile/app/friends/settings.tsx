import { FriendsSettingsScreen } from '../../src/features/friends/settings/settings-screen';

// Sharing & privacy (UX §11.1). Gated on `friends.availability` inside the screen.
export default function FriendsSettingsRoute() {
  return <FriendsSettingsScreen />;
}
