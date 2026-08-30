import { View, type ViewProps } from 'react-native';
import { cn } from '@chefer/utils';
import { Text, type TextProps } from './text';

export interface CardProps extends ViewProps {
  className?: string;
}

export function Card({ className, ...props }: CardProps) {
  return (
    <View className={cn('rounded-lg border border-border bg-card p-4', className)} {...props} />
  );
}

export function CardTitle({ className, ...props }: TextProps) {
  return <Text variant="heading" className={cn('mb-2', className)} {...props} />;
}
