import { useLocalSearchParams } from 'expo-router';
import { FriendsStubScreen } from '../../src/features/friends/components/friends-stub-screen';

// STUB (F2.0): gate + header only, so `router.push(`/friends/${id}`)` typechecks
// for the parallel lanes. F2.2 replaces this with the profile (UX §8); its
// nav-bar title is the person's name, scrolled in once the header is gone.
export default function FriendProfileRoute() {
  const { userId } = useLocalSearchParams<{ userId: string }>();
  return <FriendsStubScreen title="" testID={`friends-profile-${userId}`} />;
}
