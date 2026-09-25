import { EmptyState } from './empty-state';

export interface ErrorStateProps {
  title?: string;
  description?: string;
  onRetry: () => void;
  /** Any icon element (ui-mobile has no icon dependency — pass an Ionicons node). */
  icon?: React.ReactNode;
  className?: string;
  testID?: string;
}

/**
 * What a screen shows when its data failed to load. Screens used to fall
 * through to their empty state offline — "No meal plan for this week —
 * Generate Plan" for a user who has one (audit F-X-3-1 on mobile). Render
 * this before any empty-state branch.
 */
export function ErrorState({
  title = "Couldn't load this screen",
  description = 'Check your connection and try again. Nothing you saved has been lost.',
  onRetry,
  icon,
  className,
  testID = 'error-state',
}: ErrorStateProps) {
  return (
    <EmptyState
      testID={testID}
      title={title}
      description={description}
      icon={icon}
      className={className}
      action={{ label: 'Try again', onPress: onRetry, testID: `${testID}-retry` }}
    />
  );
}
