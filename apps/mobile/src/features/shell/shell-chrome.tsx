import { createContext, useContext, type ReactNode } from 'react';
import { View } from 'react-native';
import { router, type Href } from 'expo-router';
import { IconButton, Text, useThemeColors } from '@chefer/ui-mobile';
import { Icon } from '../../components/icon';

// ─── Shell chrome (mobile UX revamp, phase 1) ───────────────────────────────
// Every tab-root screen of the old shell draws a Food|Gym `ModeSwitch` as its
// first header row. In the new shell that row becomes this top bar instead,
// so the existing screens can be reused unchanged as tabs and pushed screens:
//  - on a tab root it shows the tab's actions (Ask Chef, Recipes, Add…), or
//    nothing;
//  - on a pushed screen it shows a Back button (system swipe-back still
//    works), falling back to the tab root when there is no history.
// The route that renders the screen says which, through this context.

// 10 Oct redesign: every tab root names itself (title1) and carries Ask Chef;
// Today adds a date eyebrow over its title; pushed shell screens may show
// their title next to Back.
export type ShellChrome =
  | { kind: 'tab-root'; actions?: ReactNode; title?: string; eyebrow?: string }
  | { kind: 'pushed'; fallback: Href; actions?: ReactNode; title?: string };

const ShellChromeContext = createContext<ShellChrome | null>(null);

export function ShellChromeProvider({
  value,
  children,
}: {
  value: ShellChrome;
  children: ReactNode;
}) {
  return <ShellChromeContext.Provider value={value}>{children}</ShellChromeContext.Provider>;
}

export function useShellChrome(): ShellChrome | null {
  return useContext(ShellChromeContext);
}

/** The new shell's replacement for the ModeSwitch header row. */
export function ShellTopBar({ className }: { className?: string }) {
  const chrome = useShellChrome();
  const colors = useThemeColors();
  if (!chrome) return null;
  const back =
    chrome.kind === 'pushed' ? (
      <IconButton
        testID="shell-back"
        accessibilityLabel="Back"
        icon={<Icon name="chevronBack" color={colors.brand} size={26} />}
        onPress={() => (router.canGoBack() ? router.back() : router.replace(chrome.fallback))}
        className="-ml-2"
      />
    ) : null;
  const title = chrome.title ? (
    <View className="min-w-0 flex-1">
      {chrome.kind === 'tab-root' && chrome.eyebrow ? (
        <Text className="text-subhead font-semibold text-label-secondary" numberOfLines={1}>
          {chrome.eyebrow}
        </Text>
      ) : null}
      <Text
        accessibilityRole="header"
        className="text-title1 font-bold text-label"
        numberOfLines={1}
      >
        {chrome.title}
      </Text>
    </View>
  ) : null;
  if (!back && !title && !chrome.actions) return null;
  return (
    <View className={['min-h-11 flex-row items-center justify-between gap-2', className].join(' ')}>
      {back && title ? (
        <View className="min-w-0 flex-1 flex-row items-center gap-1">
          {back}
          {title}
        </View>
      ) : (
        (back ?? title ?? <View />)
      )}
      {chrome.actions ? (
        <View className="flex-row items-center gap-1">{chrome.actions}</View>
      ) : null}
    </View>
  );
}
