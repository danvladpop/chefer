import type { ReactNode } from 'react';
import { View } from 'react-native';
import { cn } from '@chefer/utils';
import { Text } from './text';

// The tab-root title (plan: "Native header" — the JS stand-in until binary
// 1.1 moves tab roots onto native large titles). A small eyebrow line
// (the date, the week), the screen's one <h1>-equivalent title, and up to
// three trailing actions (IconButtons). It scrolls with the content, like an
// iOS large title.

export interface LargeHeaderProps {
  title: string;
  /** One short line above the title, e.g. "Thursday 9 October". */
  eyebrow?: string;
  /** Trailing actions, usually `IconButton`s. */
  actions?: ReactNode;
  /** Content under the title row (a segmented control, a week strip). */
  children?: ReactNode;
  className?: string;
  testID?: string;
}

export function LargeHeader({
  title,
  eyebrow,
  actions,
  children,
  className,
  testID,
}: LargeHeaderProps) {
  return (
    <View className={cn('gap-3 pb-2 pt-2', className)} testID={testID}>
      <View className="flex-row items-end gap-2">
        <View className="min-w-0 flex-1">
          {eyebrow ? (
            <Text className="text-subhead font-semibold text-label-secondary" numberOfLines={1}>
              {eyebrow}
            </Text>
          ) : null}
          <Text
            accessibilityRole="header"
            className="text-display font-bold text-label"
            numberOfLines={2}
          >
            {title}
          </Text>
        </View>
        {actions ? <View className="flex-row items-center gap-1">{actions}</View> : null}
      </View>
      {children}
    </View>
  );
}
