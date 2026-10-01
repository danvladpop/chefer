import { Linking, Pressable } from 'react-native';
import { FRIENDS_COPY } from '@chefer/types';
import { Text } from '@chefer/ui-mobile';
import { cn, sourceDomainOf } from '@chefer/utils';

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
  const safeDomain = sourceDomainOf(url);
  if (!url || !safeDomain) return null;
  const shown = domain ?? safeDomain;
  return (
    <Pressable
      testID={testID}
      accessibilityRole="link"
      accessibilityLabel={FRIENDS_COPY.recipe.sourceLabel(shown)}
      hitSlop={{ top: 12, bottom: 12, left: 8, right: 8 }}
      onPress={() => {
        Linking.openURL(url).catch(() => undefined);
      }}
      className={cn('min-h-11 justify-center self-start', className)}
    >
      <Text className="text-sm text-primary underline">{FRIENDS_COPY.recipe.source(shown)}</Text>
    </Pressable>
  );
}
