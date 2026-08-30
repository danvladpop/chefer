import type { ViewProps } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { cn } from '@chefer/utils';

export interface ScreenProps extends ViewProps {
  className?: string;
  /** Safe-area edges to inset. Tab screens omit 'bottom' (the tab bar owns it). */
  edges?: ('top' | 'bottom' | 'left' | 'right')[];
}

/** Standard screen chrome: safe-area handling + themed background + padding. */
export function Screen({ className, edges = ['top', 'left', 'right'], ...props }: ScreenProps) {
  return (
    <SafeAreaView edges={edges} className={cn('flex-1 bg-background px-4', className)} {...props} />
  );
}
