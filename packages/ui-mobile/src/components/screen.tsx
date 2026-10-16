import { useContext } from 'react';
import type { ViewProps } from 'react-native';
import { SafeAreaInsetsContext, SafeAreaView } from 'react-native-safe-area-context';
import { cn } from '@chefer/utils';
import { useReadableLayout } from './readable-layout';

export interface ScreenProps extends ViewProps {
  className?: string;
  /** Safe-area edges to inset. Tab screens omit 'bottom' (the tab bar owns it). */
  edges?: ('top' | 'bottom' | 'left' | 'right')[];
}

/**
 * Standard screen chrome: safe-area handling + themed background + padding.
 *
 * Large screens: on a window wider than the readable column (Android tablet,
 * foldable, a large-screen window in landscape) the side padding grows to
 * centre a READABLE_MAX_WIDTH column — the background still fills the window,
 * and everything inside (header, ScrollView/FlatList content, pinned footers)
 * is capped with it. The safe area's own side insets (a display cutout after
 * a rotation) count towards that gutter rather than adding to it. On
 * phone-sized windows the gutter is 0 and nothing changes: the className's
 * own padding applies untouched.
 */
export function Screen({
  className,
  edges = ['top', 'left', 'right'],
  style,
  ...props
}: ScreenProps) {
  const { gutter } = useReadableLayout();
  // The context, not useSafeAreaInsets(): the root error boundary renders a
  // Screen above the SafeAreaProvider, where the hook would throw.
  const insets = useContext(SafeAreaInsetsContext);
  // SafeAreaView adds the inset of each listed edge on top of this padding.
  const side = (edge: 'left' | 'right') =>
    Math.max(0, gutter - (edges.includes(edge) ? (insets?.[edge] ?? 0) : 0));
  return (
    <SafeAreaView
      edges={edges}
      className={cn('flex-1 bg-background px-4', className)}
      style={
        gutter > 0 ? [style, { paddingLeft: side('left'), paddingRight: side('right') }] : style
      }
      {...props}
    />
  );
}
