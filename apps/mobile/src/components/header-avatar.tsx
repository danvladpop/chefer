import { Pressable, Text, View } from 'react-native';
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
      {/* R-20: a fixed 36pt circle with a fixed line-height clipped the initial
          at Accessibility XL. The circle is a plain View now; the initial is
          capped (1.2x) and shrinks to fit instead of disappearing. */}
      <View className="h-9 w-9 items-center justify-center overflow-hidden rounded-full bg-primary">
        <Text
          testID="header-avatar-initials"
          maxFontSizeMultiplier={1.2}
          adjustsFontSizeToFit
          numberOfLines={1}
          minimumFontScale={0.7}
          className="text-center text-sm font-semibold text-primary-foreground"
        >
          {initials}
        </Text>
      </View>
    </Pressable>
  );
}
