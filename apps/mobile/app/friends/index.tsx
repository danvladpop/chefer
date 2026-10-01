import { FriendsStubScreen } from '../../src/features/friends/components/friends-stub-screen';
import { FRIENDS_SCREEN_TITLES } from '../../src/features/friends/components/screen-titles';

// STUB (F2.0): header + gate only, so `router.push('/friends')` typechecks
// for the parallel lanes. The owning lane replaces this body (UX §2.2).
export default function FriendsHomeRoute() {
  return <FriendsStubScreen title={FRIENDS_SCREEN_TITLES.home} testID="friends-home" />;
}
