import { ActivityIndicator, ScrollView } from 'react-native';
import { Card, CardTitle, Screen, Text } from '@chefer/ui-mobile';
import { trpc } from '../../src/lib/trpc';

// Home tab. The auth.me call doubles as the wiring proof for the whole stack:
// SecureStore token → Bearer header → tRPC → superjson. The real dashboard
// (nutrition summary, today's meals) lands with plan task M2-1.
export default function HomeScreen() {
  const me = trpc.auth.me.useQuery();

  return (
    <Screen>
      <ScrollView contentContainerClassName="gap-4 py-4">
        <Text variant="title" testID="home-title">
          {me.data?.firstName ? `Hi, ${me.data.firstName}!` : 'Welcome to Chefer'}
        </Text>

        {me.isLoading && <ActivityIndicator />}

        {me.data && (
          <Card testID="home-account-card">
            <CardTitle>Your account</CardTitle>
            <Text variant="muted">{me.data.email}</Text>
            <Text variant="muted">Plan: {me.data.planTier}</Text>
          </Card>
        )}

        <Card>
          <CardTitle>Coming soon</CardTitle>
          <Text variant="muted">
            Today&apos;s meals and your nutrition summary will appear here (M2-1).
          </Text>
        </Card>
      </ScrollView>
    </Screen>
  );
}
