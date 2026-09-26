import type { ErrorBoundaryProps } from 'expo-router';
import { ErrorState, Screen } from '@chefer/ui-mobile';

/**
 * Exported as `ErrorBoundary` from app/_layout.tsx, so expo-router wraps every
 * route in it. Without it a render error anywhere took down the whole app in
 * release builds: expo-updates' error recovery rethrows an unhandled JS error
 * as a native crash (found while capturing App Store screenshots — a client
 * newer than its API crashed on the dashboard). The web equivalent is
 * apps/web/src/app/error.tsx.
 */
export function RootErrorBoundary({ error, retry }: ErrorBoundaryProps) {
  // The only trace of the error until mobile Sentry lands (M1-6).
  console.error('[chefer] render error', error);
  return (
    <Screen className="flex-1 justify-center bg-white px-6">
      <ErrorState
        testID="root-error"
        title="Something went wrong"
        description="This screen hit an unexpected error. Nothing you saved has been lost."
        onRetry={() => void retry()}
      />
    </Screen>
  );
}
