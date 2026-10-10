import { router } from 'expo-router';
import { IconButton, useThemeColors } from '@chefer/ui-mobile';
import { Icon } from '../../src/components/icon';
import { AddAction, AskChefAction } from '../../src/features/shell/add-action';
import { ShellChromeProvider } from '../../src/features/shell/shell-chrome';
import { todayEyebrow } from '../../src/features/shell/today/today-helpers';
import { TodayScreen } from '../../src/features/shell/today/today-screen';

// New shell: Today (10 Oct redesign, boards Home / HomeDone). Its own screen
// now — the old Food Today (`app/(food)/index.tsx`) stays as it was for the
// old shell. Top bar: the date over "Today", then Stats, Ask Chef and Add.
export default function HomeTab() {
  const colors = useThemeColors();
  return (
    <ShellChromeProvider
      value={{
        kind: 'tab-root',
        title: 'Today',
        eyebrow: todayEyebrow(),
        actions: (
          <>
            <IconButton
              testID="shell-stats"
              accessibilityLabel="Stats"
              variant="tinted"
              icon={<Icon name="progress" color={colors.brand} />}
              onPress={() => router.push('/progress')}
            />
            <AskChefAction />
            <AddAction />
          </>
        ),
      }}
    >
      <TodayScreen />
    </ShellChromeProvider>
  );
}
