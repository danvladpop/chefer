'use client';

import { useT } from '@/lib/i18n';

// Amber notice after "Don't save it" (UX-26, AC2): says what the skipped
// save means. Mobile twin: features/privacy/health-notices.tsx.
//
// The two body notices are still exported as English strings because other
// screens pass them as `message`; they are recognised here and shown from the
// catalog (`consent.health.declinedBody` / `declinedWeight`) in the UI language.
export const HEALTH_DECLINED_BODY_NOTICE =
  'Your goal and measurements weren’t saved, so targets use the defaults.';

export const HEALTH_DECLINED_BODY_NOTICE_WEIGHT =
  'Your weight wasn’t saved, because Chefer doesn’t have permission to store health information.';

export function HealthDeclinedNotice({
  message,
  testId = 'health-declined-notice',
}: {
  /** Defaults to "Without this, Chefer can't check plans for allergies." */
  message?: string;
  testId?: string;
}) {
  const { t } = useT();
  const text =
    message === undefined
      ? t('consent.health.declinedNotice')
      : message === HEALTH_DECLINED_BODY_NOTICE
        ? t('consent.health.declinedBody')
        : message === HEALTH_DECLINED_BODY_NOTICE_WEIGHT
          ? t('consent.health.declinedWeight')
          : message;
  return (
    <p
      role="status"
      data-testid={testId}
      className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900"
    >
      {text}
    </p>
  );
}
