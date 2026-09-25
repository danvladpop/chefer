import { Pressable, Text } from 'react-native';
import { router } from 'expo-router';
import { trpc } from '../lib/trpc';

/** Up to two initials from the user's name, else the email's first letter. */
export function initialsFor(user: {
  firstName?: string | null;
  lastName?: string | null;
  name?: string | null;
  email?: string | null;
}): string {
  const first = user.firstName?.trim();
  const last = user.lastName?.trim();
  if (first) return `${first[0]}${last ? last[0] : ''}`.toUpperCase();
  const words = (user.name ?? '').trim().split(/\s+/).filter(Boolean);
  if (words.length > 0)
    return words
      .slice(0, 2)
      .map((w) => w[0])
      .join('')
      .toUpperCase();
  return (user.email?.trim()[0] ?? '?').toUpperCase();
}

/**
 * Profile avatar for the top-right of every tab-root header (dogfood #5):
 * balances the Food/Gym switch and is the one-tap way to Profile — the web
 * header's initials circle, on the phone.
 */
export function HeaderAvatar() {
  const me = trpc.auth.me.useQuery(undefined, { staleTime: 5 * 60_000 });
  const initials = me.data ? initialsFor(me.data) : '';
  return (
    <Pressable
      testID="header-avatar"
      accessibilityRole="button"
      accessibilityLabel="Profile"
      onPress={() => router.push('/profile')}
      className="h-11 w-11 items-center justify-center"
    >
      <Text className="h-9 w-9 overflow-hidden rounded-full bg-primary text-center text-sm font-semibold leading-9 text-primary-foreground">
        {initials}
      </Text>
    </Pressable>
  );
}
