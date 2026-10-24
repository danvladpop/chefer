import { useColorScheme } from 'nativewind';
import { colorsFor, type ColorRole, type ColorScheme } from '@chefer/tokens';

// Raw hex values of the revamp colour roles, for the places a class can't
// reach (icon tints, react-native-svg, ActivityIndicator). Follows the active
// scheme — the Appearance setting (Automatic · Day · Night) or, on
// Automatic, the phone — so every caller re-renders in night colours.
const BY_SCHEME: Record<ColorScheme, Record<ColorRole, string>> = {
  light: colorsFor('light'),
  dark: colorsFor('dark'),
};

/** The active scheme, resolved: `light` or `dark`. */
export function useResolvedScheme(): ColorScheme {
  return useColorScheme().colorScheme === 'dark' ? 'dark' : 'light';
}

export function useThemeColors(): Record<ColorRole, string> {
  return BY_SCHEME[useResolvedScheme()];
}
