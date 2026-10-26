import { useState, type ReactNode } from 'react';
import { Linking, Pressable, View } from 'react-native';
import { ListRow, ListSection, Text, useThemeColors } from '@chefer/ui-mobile';
import { Icon } from '../../../components/icon';
import { getWebUrl } from '../../../lib/api-url';
import { CURRENT_BUILD, CURRENT_VERSION_LABEL } from '../../../lib/current-build';
import { useT } from '../../../lib/i18n';
import { openLegal } from '../../legal/open-legal';
import { useSignOut } from '../../settings/use-sign-out';

// The bottom of both You tabs (personal, and trainer mode §6.8): Help (Send
// feedback, Support, Terms, Privacy), Sign out, and the version line. One
// copy, so the two modes can't drift. Each mode brings its own feedback row:
// personal You's form in a sheet, trainer You's trainer mail link.

export function YouHelpSection({ feedback }: { feedback: ReactNode }) {
  const { t } = useT();
  const colors = useThemeColors();
  return (
    <ListSection title={t('settings.you.helpTitle')}>
      {feedback}
      <ListRow
        testID="you-support"
        title={t('settings.you.support')}
        icon={<Icon name="help" color={colors.brand} />}
        onPress={() => void Linking.openURL(getWebUrl('/support'))}
      />
      <ListRow
        testID="you-terms"
        title={t('settings.you.terms')}
        icon={<Icon name="legal" color={colors.brand} />}
        onPress={() => openLegal('terms')}
      />
      <ListRow
        testID="you-privacy"
        title={t('settings.you.privacy')}
        icon={<Icon name="legal" color={colors.brand} />}
        onPress={() => openLegal('privacy')}
      />
    </ListSection>
  );
}

/** Sign out (asks first) and "Version 1.0.1" (long-press for the support line, R-15). */
export function YouSignOutFooter() {
  const { t } = useT();
  const colors = useThemeColors();
  const [showBuildDetails, setShowBuildDetails] = useState(false);
  const signOut = useSignOut('you-sign-out-confirm');
  return (
    <>
      <ListSection>
        <ListRow
          testID="logout-button"
          title={signOut.isPending ? t('settings.you.signingOut') : t('settings.you.signOut')}
          icon={<Icon name="signOut" color={colors.danger} />}
          destructive
          disabled={signOut.isPending}
          onPress={signOut.request}
        />
      </ListSection>
      {signOut.confirmSheet}

      <Pressable
        testID="build-info"
        accessibilityLabel={showBuildDetails ? CURRENT_BUILD : CURRENT_VERSION_LABEL}
        onLongPress={() => setShowBuildDetails((shown) => !shown)}
        delayLongPress={600}
        className="min-h-11 items-center justify-center"
      >
        <View>
          <Text className="text-center text-caption text-label-tertiary">
            {showBuildDetails ? CURRENT_BUILD : CURRENT_VERSION_LABEL}
          </Text>
        </View>
      </Pressable>
    </>
  );
}
