import { useLocalSearchParams } from 'expo-router';
import { FriendProfileScreen } from '../../src/features/friends/profile/profile-screen';

// Someone's profile (UX §8): the header, then their Food | Gym content as far
// as they share it with me. My own id opens the preview of what followers
// see (§8.3, `See what followers see`).
export default function FriendProfileRoute() {
  const { userId } = useLocalSearchParams<{ userId: string }>();
  return <FriendProfileScreen userId={userId} />;
}
