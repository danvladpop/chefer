import '../global.css';
import { useState } from 'react';
import { QueryClientProvider } from '@tanstack/react-query';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useSession } from '../src/features/auth/use-session';
import { getTrpcUrl } from '../src/lib/api-url';
import { getToken } from '../src/lib/auth-store';
import { makeQueryClient, trpc } from '../src/lib/trpc';
import { buildTrpcLinks } from '../src/lib/trpc-links';

export default function RootLayout() {
  const { ready, token } = useSession();

  const [queryClient] = useState(makeQueryClient);
  const [trpcClient] = useState(() =>
    trpc.createClient({
      links: buildTrpcLinks({
        url: getTrpcUrl(),
        getToken,
        enableLogger: __DEV__,
      }),
    }),
  );

  if (!ready) {
    // SecureStore read is in flight — keep the splash frame, don't flash login.
    return null;
  }

  return (
    <trpc.Provider client={trpcClient} queryClient={queryClient}>
      <QueryClientProvider client={queryClient}>
        <StatusBar style="auto" />
        <Stack screenOptions={{ headerShown: false }}>
          <Stack.Protected guard={token !== null}>
            <Stack.Screen name="(tabs)" />
            <Stack.Screen name="recipe/[id]" />
            <Stack.Screen name="tracker" />
            <Stack.Screen name="pantry" />
            <Stack.Screen name="profile" />
            <Stack.Screen name="preferences" />
            <Stack.Screen name="chat" />
            <Stack.Screen name="history" />
            <Stack.Screen name="onboarding" />
            <Stack.Screen name="cook/[id]" />
          </Stack.Protected>
          <Stack.Protected guard={token === null}>
            <Stack.Screen name="(auth)" />
          </Stack.Protected>
        </Stack>
      </QueryClientProvider>
    </trpc.Provider>
  );
}
