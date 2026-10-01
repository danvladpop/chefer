import { Screen } from '@chefer/ui-mobile';
import { FriendsGate } from './friends-gate';
import { FriendsScreenHeader } from './friends-screen-header';

// Placeholder body for the Following routes until their lanes (F2.1 home,
// requests, activity, suggestions · F2.2 profile · F2.3 settings, blocked)
// replace them. Exists so `router.push('/friends/…')` typechecks everywhere
// (typedRoutes) and every entry point lands on a real, gated screen.
export function FriendsStubScreen({ title, testID }: { title: string; testID: string }) {
  return (
    <FriendsGate>
      <Screen testID={testID} className="px-0">
        <FriendsScreenHeader title={title} testID={`${testID}-header`} />
      </Screen>
    </FriendsGate>
  );
}
