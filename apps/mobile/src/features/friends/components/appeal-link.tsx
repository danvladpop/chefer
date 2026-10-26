import { Linking, Pressable, View } from 'react-native';
import type { Translator } from '@chefer/i18n';
import { SUPPORT_EMAIL } from '@chefer/types';
import { Text } from '@chefer/ui-mobile';
import { cn } from '@chefer/utils';
import { useT } from '../../../lib/i18n';

// ─── AppealLink (PRD §9, terms "Automatic enforcement") ───────────────────────
// The appeal route for an automatic moderation step, shown where the owner
// sees the step: their hidden recipe's banner and the forced-private note.
// Opens a pre-addressed email with RN core `Linking` (no native module).

export type AppealLinkProps = {
  /** Which step is being appealed — sets the email subject. */
  subject: 'recipe' | 'profile';
  /** Text colour of the surrounding banner (e.g. `text-attention`). */
  tone?: string;
  className?: string;
  testID?: string;
};

export function appealMailto(subject: AppealLinkProps['subject'], t: Translator['t']): string {
  const line =
    subject === 'recipe' ? t('friends.appeal.subjectRecipe') : t('friends.appeal.subjectProfile');
  return `mailto:${SUPPORT_EMAIL}?subject=${encodeURIComponent(line)}`;
}

export function AppealLink({
  subject,
  tone = 'text-muted-foreground',
  className,
  testID = 'friends-appeal',
}: AppealLinkProps) {
  const { t } = useT();
  return (
    <View className={cn('flex-row flex-wrap items-center gap-x-1', className)}>
      <Text className={cn('text-sm', tone)}>{t('friends.appeal.prompt')}</Text>
      <Pressable
        testID={testID}
        accessibilityRole="link"
        accessibilityLabel={t('friends.appeal.a11y', { email: SUPPORT_EMAIL })}
        hitSlop={{ top: 12, bottom: 12, left: 8, right: 8 }}
        onPress={() => {
          Linking.openURL(appealMailto(subject, t)).catch(() => undefined);
        }}
        className="min-h-11 justify-center"
      >
        <Text className={cn('text-sm font-semibold underline', tone)}>
          {t('friends.appeal.action', { email: SUPPORT_EMAIL })}
        </Text>
      </Pressable>
    </View>
  );
}
