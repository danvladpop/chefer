import { Switch } from 'react-native';
import Constants from 'expo-constants';
import { ListRow, ListSection, useThemeColors } from '@chefer/ui-mobile';
import { useT } from '../../lib/i18n';
import { trpc } from '../../lib/trpc';
import { setShellV2Preview, useShellV2Preview } from './shell-store';

// The owner's way into the new shell before `mobileShellV2` is on for
// everyone: a per-device switch, shown only to admins and on dev builds.
// Turning it off from the new shell's You tab drops straight back into the
// old Food|Gym shell (the (main) layout redirects once it reads false).

/** Admins and development builds may preview the revamp. */
export function useCanPreviewShell(): boolean {
  const { data: me } = trpc.auth.me.useQuery(undefined, { staleTime: 30_000 });
  const devBuild = Constants.expoConfig?.extra?.appVariant === 'development';
  return devBuild || me?.role === 'ADMIN';
}

/** `footer` lets the new shell's You tab use the board's shorter line. */
export function ShellPreviewSection({ footer }: { footer?: string } = {}) {
  const { t } = useT();
  const allowed = useCanPreviewShell();
  const on = useShellV2Preview();
  const colors = useThemeColors();
  if (!allowed) return null;
  return (
    <ListSection
      title={t('today.shell.preview.section')}
      footer={footer ?? t('today.shell.preview.footer')}
      testID="shell-preview-section"
    >
      <ListRow
        title={t('today.shell.preview.row')}
        accessory={
          <Switch
            testID="shell-preview-switch"
            accessibilityLabel={t('today.shell.preview.switchLabel')}
            value={on}
            onValueChange={setShellV2Preview}
            // Android draws its own teal thumb unless told otherwise. White in
            // both schemes, like the native thumb: `surface` vanished at night.
            // drift-ok: native switch thumbs are white by day and by night
            thumbColor="#FFFFFF"
            ios_backgroundColor={colors.separator}
            trackColor={{ true: colors.brand, false: colors.separator }}
          />
        }
      />
    </ListSection>
  );
}
