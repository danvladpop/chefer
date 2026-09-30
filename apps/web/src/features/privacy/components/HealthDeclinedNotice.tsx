import { HEALTH_CONSENT_COPY } from '@chefer/types';

// Amber notice after "Don't save it" (UX-26, AC2): says what the skipped
// save means. Mobile twin: features/privacy/health-notices.tsx.
export function HealthDeclinedNotice({
  message = HEALTH_CONSENT_COPY.declinedNotice,
  testId = 'health-declined-notice',
}: {
  message?: string;
  testId?: string;
}) {
  return (
    <p
      role="status"
      data-testid={testId}
      className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900"
    >
      {message}
    </p>
  );
}

export const HEALTH_DECLINED_BODY_NOTICE =
  'Your goal and measurements weren’t saved, so targets use the defaults.';

export const HEALTH_DECLINED_BODY_NOTICE_WEIGHT =
  'Your weight wasn’t saved, because Chefer doesn’t have permission to store health information.';
