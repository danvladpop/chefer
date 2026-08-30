import { Button, Card, CardTitle, Screen, Text } from '@chefer/ui-mobile';
import { clearToken } from '../../src/lib/auth-store';
import { trpc } from '../../src/lib/trpc';

// Hosts everything not in the tab bar (mirrors web's MobileNavDrawer):
// pantry, tracker, preferences, profile … arrive with their Wave-2 tasks.
export default function MoreScreen() {
  const utils = trpc.useUtils();
  const logout = trpc.auth.logout.useMutation({
    onSettled: async () => {
      // Even if the network call failed, drop the local session — the token
      // may already be dead server-side.
      await clearToken();
      utils.invalidate().catch(() => {
        // Cache cleanup only; the auth gate has already routed to login.
      });
    },
  });

  return (
    <Screen className="gap-4">
      <Text variant="title" className="py-4">
        More
      </Text>
      <Card>
        <CardTitle>Coming soon</CardTitle>
        <Text variant="muted">Pantry, Tracker, Preferences and Profile land with Wave 2.</Text>
      </Card>
      <Button
        testID="logout-button"
        variant="outline"
        loading={logout.isPending}
        onPress={() => logout.mutate()}
      >
        Sign out
      </Button>
    </Screen>
  );
}
