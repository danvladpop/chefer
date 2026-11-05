import { Platform } from 'react-native';
import { getTranslator } from './i18n';

/**
 * Shared tab-bar look for BOTH mode tab bars (Food / Gym). Labels are 12pt
 * semibold instead of React Navigation's 10pt default (dogfood #10: text too
 * small on the phone); icons are drawn 2pt larger in each layout. The active
 * tint and the bar's colours come from the navigation theme (app/_layout.tsx:
 * `primary` is the brand), so they follow Day and Night.
 */
export const TAB_BAR_SCREEN_OPTIONS = {
  headerShown: false,
  tabBarLabelStyle: { fontSize: 12, fontWeight: '600' },
} as const;

/**
 * The spoken name of a tab, for `tabBarAccessibilityLabel` on every tab of
 * every tab bar (new shell, old Food and Gym).
 *
 * Without one, React Navigation builds a label only on iOS ("Today, tab, 1 of
 * 5") and leaves Android's to the platform, which reads every child of the
 * tab button — the icon font's private-use glyph included — so TalkBack said
 * "<glyph>, Today". iOS keeps React Navigation's own wording; Android gets the
 * plain title (TalkBack adds "tab" from the role itself). A badge is spoken
 * as "N new" on both. The words come from `nav.tab.*` (Lane J phase 4).
 */
export function tabAccessibilityLabel(
  title: string,
  index: number,
  count: number,
  badgeCount = 0,
  os: typeof Platform.OS = Platform.OS,
): string {
  // Called while a layout renders; the layouts read `useT()`, so a language
  // change re-renders them and this reads the new translator.
  const { t } = getTranslator();
  const name = badgeCount > 0 ? t('nav.tab.withBadge', { count: badgeCount, title }) : title;
  return os === 'ios' ? t('nav.tab.position', { name, position: index + 1, total: count }) : name;
}
