import { router, type Href } from 'expo-router';
import { IconButton, useThemeColors } from '@chefer/ui-mobile';
import { Icon } from '../../../components/icon';

// Manual back button for gym stack routes: the root Stack sets
// `headerShown: false` globally (app/_layout.tsx), so every stack screen
// draws its own. 10 Oct redesign: drawn exactly like the shell top bar's Back
// (`ShellTopBar`: a plain IconButton with the brand chevron), so a legacy
// stack screen and a shell screen read the same.
export function StackBackButton({
  testID,
  fallback = '/today',
}: {
  testID: string;
  fallback?: Href;
}) {
  const colors = useThemeColors();
  return (
    <IconButton
      testID={testID}
      accessibilityLabel="Back"
      icon={<Icon name="chevronBack" color={colors.brand} size={26} />}
      onPress={() => (router.canGoBack() ? router.back() : router.replace(fallback))}
      className="-ml-2"
    />
  );
}
