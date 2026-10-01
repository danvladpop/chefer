import { View } from 'react-native';
import { Skeleton } from '@chefer/ui-mobile';

// MO-03 placeholders. A loading region is labelled once, by its owner; the
// skeleton blocks themselves are hidden from the accessibility tree.

export function PersonRowSkeleton() {
  return (
    <View className="min-h-16 flex-row items-center gap-3 px-4 py-2">
      <Skeleton className="h-10 w-10 rounded-full" />
      <View className="flex-1 gap-2">
        <Skeleton className="h-4 w-1/2" />
        <Skeleton className="h-3 w-1/3" />
      </View>
      <Skeleton className="h-11 w-28 rounded-md" />
    </View>
  );
}

export function PersonRowsSkeleton({ count = 3, testID }: { count?: number; testID?: string }) {
  return (
    <View testID={testID} accessibilityLabel="Loading" accessible>
      {Array.from({ length: count }, (_, i) => (
        <PersonRowSkeleton key={i} />
      ))}
    </View>
  );
}
