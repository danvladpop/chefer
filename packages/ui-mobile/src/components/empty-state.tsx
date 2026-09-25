import { View } from 'react-native';
import { cn } from '@chefer/utils';
import { Button } from './button';
import { Text } from './text';

export interface EmptyStateProps {
  title: string;
  description?: string;
  /** Any icon element (ui-mobile has no icon dependency — pass an Ionicons node). */
  icon?: React.ReactNode;
  action?: { label: string; onPress: () => void; testID?: string };
  className?: string;
  testID?: string;
}

/** Centred placeholder for empty lists and "needs a connection" states. */
export function EmptyState({
  title,
  description,
  icon,
  action,
  className,
  testID,
}: EmptyStateProps) {
  return (
    <View testID={testID} className={cn('items-center justify-center gap-2 px-6 py-10', className)}>
      {icon ? <View className="mb-1">{icon}</View> : null}
      <Text variant="heading" className="text-center">
        {title}
      </Text>
      {description ? (
        <Text variant="muted" className="text-center">
          {description}
        </Text>
      ) : null}
      {action ? (
        <Button testID={action.testID} className="mt-3" onPress={action.onPress}>
          {action.label}
        </Button>
      ) : null}
    </View>
  );
}
