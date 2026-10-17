import type { ReactNode } from 'react';
import { View } from 'react-native';
import { cn } from '@chefer/utils';

// The trainer and coaching screens' card: the new shell's surface card (the same recipe as Train's
// cards — surface, hairline, card radius), so these screens match the screens they are reached from.

export function CoachingCard({
  children,
  className,
  testID,
}: {
  children: ReactNode;
  className?: string;
  testID?: string;
}) {
  return (
    <View
      testID={testID}
      className={cn('gap-3 rounded-card border border-separator bg-surface p-4', className)}
    >
      {children}
    </View>
  );
}
