import { COACHING_COPY } from '@chefer/types';
import { Button } from '@chefer/ui';
import { userFacingErrorMessage } from '@chefer/utils';

/** A failed load with Retry, as on Trainer tools (role=alert so it is announced). */
export function QueryError({ error, onRetry }: { error: unknown; onRetry: () => void }) {
  return (
    <div role="alert" className="rounded-2xl border bg-white p-4 text-sm text-gray-700">
      <p>{userFacingErrorMessage(error)}</p>
      <Button type="button" variant="outline" className="mt-3 min-h-11" onClick={onRetry}>
        {COACHING_COPY.common.retry}
      </Button>
    </div>
  );
}
