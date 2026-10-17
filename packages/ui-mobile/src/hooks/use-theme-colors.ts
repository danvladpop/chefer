import { colorsFor, type ColorRole } from '@chefer/tokens';

// Raw hex values of the revamp colour roles, for the places a class can't
// reach (icon tints, react-native-svg, ActivityIndicator). Light only until
// phase 4's Appearance setting; then this reads the active scheme and every
// caller follows without a change.
const LIGHT = colorsFor('light');

export function useThemeColors(): Record<ColorRole, string> {
  return LIGHT;
}
