// Raw colour values for places NativeWind classes can't reach (react-native-svg
// fills/strokes, ActivityIndicator, icon tints). They mirror the HSL tokens in
// apps/mobile/global.css — keep the two in sync.
export const colors = {
  primary: '#944a00', // --primary (brand brown)
  primaryForeground: '#fcf9f5',
  foreground: '#020817',
  mutedForeground: '#8a7560', // --muted-foreground
  muted: '#faf5f0', // --muted / --secondary
  accent: '#fcf3ea', // --accent
  border: '#e2e8f0', // --border
  card: '#ffffff',
  destructive: '#ef4444',
  success: '#059669', // emerald-600
  warning: '#d97706', // amber-600
  info: '#2563eb', // blue-600
  neutral: '#d1d5db', // gray-300
  neutralSoft: '#f3f4f6', // gray-100
} as const;

/** Categorical series colours for charts (brand first). */
export const chartPalette = ['#944a00', '#2563eb', '#059669', '#d97706', '#7c3aed', '#db2777'];
