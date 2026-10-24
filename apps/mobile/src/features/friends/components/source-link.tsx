import { Linking, Pressable } from 'react-native';
import { Text } from '@chefer/ui-mobile';
import { cn, sourceDomainOf } from '@chefer/utils';
import { useT } from '../../../lib/i18n';

// ─── SourceLink (UX §3.2, §9.4, PRD Q-F-7) ────────────────────────────────────
// `Source: {domain}` under an imported recipe, opening the original in the
// browser with RN core `Linking.openURL` (no new native module). Only http(s)
// URLs get a domain from `sourceDomainOf` (a `javascript:` URL is null), so
// anything else renders nothing.

export type SourceLinkProps = {
  url: string | null | undefined;
  /** The API's `sourceDomain`, when it already sent one. */
  domain?: string | null;
  className?: string;
  testID?: string;
};

export function SourceLink({
  url,
  domain,
  className,
  testID = 'friends-source-link',
}: SourceLinkProps) {
  const { t } = useT();
  const safeDomain = sourceDomainOf(url);
  if (!url || !safeDomain) return null;
  const shown = domain ?? safeDomain;
  return (
    <Pressable
      testID={testID}
      accessibilityRole="link"
      accessibilityLabel={t('friends.recipe.sourceLabel', { domain: shown })}
      hitSlop={{ top: 12, bottom: 12, left: 8, right: 8 }}
      onPress={() => {
        Linking.openURL(url).catch(() => undefined);
      }}
      className={cn('min-h-11 justify-center self-start', className)}
    >
      <Text className="text-sm text-primary underline">
        {t('friends.recipe.source', { domain: shown })}
      </Text>
    </Pressable>
  );
}
