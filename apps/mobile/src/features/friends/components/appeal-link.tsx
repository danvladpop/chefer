import { Linking, Pressable, View } from 'react-native';
import { FRIENDS_COPY, SUPPORT_EMAIL } from '@chefer/types';
import { Text } from '@chefer/ui-mobile';
import { cn } from '@chefer/utils';

// ─── AppealLink (PRD §9, terms "Automatic enforcement") ───────────────────────
// The appeal route for an automatic moderation step, shown where the owner
// sees the step: their hidden recipe's banner and the forced-private note.
// Opens a pre-addressed email with RN core `Linking` (no native module).

export type AppealLinkProps = {
  /** Which step is being appealed — sets the email subject. */
  subject: 'recipe' | 'profile';
  /** Text colour of the surrounding banner (e.g. `text-blue-900`). */
  tone?: string;
  className?: string;
  testID?: string;
};

export function appealMailto(subject: AppealLinkProps['subject']): string {
  const line =
    subject === 'recipe' ? FRIENDS_COPY.appeal.subjectRecipe : FRIENDS_COPY.appeal.subjectProfile;
  return `mailto:${SUPPORT_EMAIL}?subject=${encodeURIComponent(line)}`;
}

export function AppealLink({
  subject,
  tone = 'text-muted-foreground',
  className,
  testID = 'friends-appeal',
}: AppealLinkProps) {
  return (
    <View className={cn('flex-row flex-wrap items-center gap-x-1', className)}>
      <Text className={cn('text-sm', tone)}>{FRIENDS_COPY.appeal.prompt}</Text>
      <Pressable
        testID={testID}
        accessibilityRole="link"
        accessibilityLabel={FRIENDS_COPY.appeal.a11y(SUPPORT_EMAIL)}
        hitSlop={{ top: 12, bottom: 12, left: 8, right: 8 }}
        onPress={() => {
          Linking.openURL(appealMailto(subject)).catch(() => undefined);
        }}
        className="min-h-11 justify-center"
      >
        <Text className={cn('text-sm font-semibold underline', tone)}>
          {FRIENDS_COPY.appeal.action(SUPPORT_EMAIL)}
        </Text>
      </Pressable>
    </View>
  );
}
