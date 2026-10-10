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

export type ShellChrome =
  | { kind: 'tab-root'; actions?: ReactNode; title?: string }
  | { kind: 'pushed'; fallback: Href; actions?: ReactNode };

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
  // A tab whose screen has no title of its own (Plan) names itself here.
  const title =
    chrome.kind === 'tab-root' && chrome.title ? (
      <Text
        accessibilityRole="header"
        className="min-w-0 flex-1 text-title1 font-bold text-label"
        numberOfLines={1}
      >
        {chrome.title}
      </Text>
    ) : null;
  if (!back && !title && !chrome.actions) return null;
  return (
    <View className={['min-h-11 flex-row items-center justify-between gap-2', className].join(' ')}>
      {back ?? title ?? <View />}
      {chrome.actions ? (
        <View className="flex-row items-center gap-1">{chrome.actions}</View>
      ) : null}
    </View>
  );
}
