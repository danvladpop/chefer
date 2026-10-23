import { Pressable, ScrollView, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { SUPPORTED_LOCALES, type SupportedLocale } from '@chefer/types';
import { ListSection, Screen, Text, useThemeColors } from '@chefer/ui-mobile';
import { getDeviceLocale, setLocaleChoice, useLocaleChoice, useT } from '../../lib/i18n';
import { trpc } from '../../lib/trpc';
import { ShellChromeProvider, ShellTopBar } from '../shell/shell-chrome';

type Option = SupportedLocale | 'auto';

function OptionRow({
  label,
  hint,
  lang,
  selected,
  testID,
  onPress,
}: {
  label: string;
  hint?: string;
  lang?: string;
  selected: boolean;
  testID: string;
  onPress: () => void;
}) {
  const colors = useThemeColors();
  return (
    <Pressable
      testID={testID}
      accessibilityRole="radio"
      accessibilityState={{ checked: selected }}
      {...(lang ? { accessibilityLanguage: lang } : {})}
      onPress={onPress}
      style={({ pressed }) => (pressed ? { backgroundColor: colors.surfaceSunken } : undefined)}
      className="min-h-11 flex-row items-center gap-3 px-4 py-3"
    >
      <View className="min-w-0 flex-1">
        <Text className="text-body text-label">{label}</Text>
        {hint ? <Text className="mt-0.5 text-subhead text-label-secondary">{hint}</Text> : null}
      </View>
      {selected ? <Ionicons name="checkmark" size={20} color={colors.brand} /> : null}
    </Pressable>
  );
}

/**
 * Settings › Language (ADR 0002). Applies on tap — the screen itself switches
 * — and saves to the account so web and emails follow. Each language is
 * written in itself, so a wrong pick is easy to undo.
 */
export function LanguageScreen() {
  const { t } = useT();
  const choice = useLocaleChoice();
  const utils = trpc.useUtils();
  const save = trpc.user.setLocale.useMutation({
    meta: { silent: true },
    onSuccess: (saved) => {
      // `me` first, so LocaleSyncHost doesn't flip back to the stale value.
      utils.user.me.setData(undefined, (me) => (me ? { ...me, ...saved } : me));
    },
  });

  const value: Option = choice ?? 'auto';
  const pick = (next: Option) => {
    if (next === value) return;
    const locale = next === 'auto' ? null : next;
    utils.user.me.setData(undefined, (me) => (me ? { ...me, locale } : me));
    setLocaleChoice(locale);
    save.mutate({ locale });
  };

  return (
    <ShellChromeProvider
      value={{ kind: 'pushed', fallback: '/settings', title: t('settings.language.title') }}
    >
      <Screen className="bg-canvas px-0">
        <View className="px-4">
          <ShellTopBar />
        </View>
        <ScrollView contentContainerClassName="gap-4 px-4 pb-8 pt-2">
          <Text className="px-1 text-subhead text-label-secondary">
            {t('settings.language.description')}
          </Text>
          <ListSection>
            <OptionRow
              testID="language-auto"
              label={t('settings.language.automatic')}
              hint={t('settings.language.automaticHint', {
                language: t(`settings.language.names.${getDeviceLocale()}`),
              })}
              selected={value === 'auto'}
              onPress={() => pick('auto')}
            />
            {SUPPORTED_LOCALES.map((locale) => (
              <OptionRow
                key={locale}
                testID={`language-${locale}`}
                label={t(`settings.language.names.${locale}`)}
                lang={locale}
                selected={value === locale}
                onPress={() => pick(locale)}
              />
            ))}
          </ListSection>
          {save.isError ? (
            <Text className="px-1 text-subhead text-danger">{t('common.errors.generic')}</Text>
          ) : null}
        </ScrollView>
      </Screen>
    </ShellChromeProvider>
  );
}
