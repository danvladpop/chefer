'use client';

import { HEALTH_CONSENT_COPY } from '@chefer/types';
import { Button, Sheet } from '@chefer/ui';

// ─── HealthDataConsentSheet (UX-26, T-26.2) ───────────────────────────────────
// Same copy and structure as apps/mobile/src/features/privacy/
// health-consent-sheet.tsx (copy lives in @chefer/types). Heading, an
// explanation, a what/why/where/choice list, then two buttons — neither
// pre-selected. SEPARATE from the AI data consent sheet. PENDING COUNSEL
// REVIEW (copy).

const LINES = [
  HEALTH_CONSENT_COPY.what,
  HEALTH_CONSENT_COPY.why,
  HEALTH_CONSENT_COPY.where,
  HEALTH_CONSENT_COPY.choice,
] as const;

export function HealthConsentSheet({
  open,
  saving,
  saveFailed,
  onAllow,
  onDecline,
}: {
  open: boolean;
  saving: boolean;
  saveFailed: boolean;
  onAllow: () => void;
  onDecline: () => void;
}) {
  return (
    <Sheet
      open={open}
      onClose={onDecline}
      title={HEALTH_CONSENT_COPY.title}
      description={HEALTH_CONSENT_COPY.eyebrow}
      footer={
        <div className="flex flex-col gap-2 sm:flex-row-reverse sm:justify-start">
          <Button onClick={onAllow} disabled={saving} data-testid="health-consent-allow">
            {saving ? HEALTH_CONSENT_COPY.saving : HEALTH_CONSENT_COPY.allow}
          </Button>
          <Button
            variant="outline"
            onClick={onDecline}
            disabled={saving}
            data-testid="health-consent-decline"
          >
            {HEALTH_CONSENT_COPY.decline}
          </Button>
        </div>
      }
    >
      <div className="space-y-3 px-5 pb-2 text-sm text-gray-700" data-testid="health-consent-sheet">
        <p>{HEALTH_CONSENT_COPY.intro}</p>
        <ul className="list-disc space-y-1 pl-5">
          {LINES.map((line) => (
            <li key={line.label}>
              <span className="font-semibold text-gray-900">{line.label}:</span> {line.text}
            </li>
          ))}
        </ul>
        {saveFailed && (
          <p role="alert" className="text-red-700">
            {HEALTH_CONSENT_COPY.saveError}
          </p>
        )}
      </div>
    </Sheet>
  );
}
