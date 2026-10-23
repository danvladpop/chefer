'use client';

import { useT } from '@/lib/i18n';
import { Button, Sheet } from '@chefer/ui';

// ─── HealthDataConsentSheet (UX-26, T-26.2) ───────────────────────────────────
// Same copy and structure as apps/mobile/src/features/privacy/
// health-consent-sheet.tsx (copy lives in @chefer/types). Heading, an
// explanation, a what/why/where/choice list, then two buttons — neither
// pre-selected. SEPARATE from the AI data consent sheet. PENDING COUNSEL
// REVIEW (copy).

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
  const { t } = useT();
  const lines = [
    { label: t('consent.health.whatLabel'), text: t('consent.health.whatText') },
    { label: t('consent.health.whyLabel'), text: t('consent.health.whyText') },
    { label: t('consent.health.whereLabel'), text: t('consent.health.whereText') },
    { label: t('consent.health.choiceLabel'), text: t('consent.health.choiceText') },
  ];
  return (
    <Sheet
      open={open}
      onClose={onDecline}
      title={t('consent.health.title')}
      description={t('consent.health.eyebrow')}
      footer={
        <div className="flex flex-col gap-2 sm:flex-row-reverse sm:justify-start">
          <Button onClick={onAllow} disabled={saving} data-testid="health-consent-allow">
            {saving ? t('consent.health.saving') : t('consent.health.allow')}
          </Button>
          <Button
            variant="outline"
            onClick={onDecline}
            disabled={saving}
            data-testid="health-consent-decline"
          >
            {t('consent.health.decline')}
          </Button>
        </div>
      }
    >
      <div className="space-y-3 px-5 pb-2 text-sm text-gray-700" data-testid="health-consent-sheet">
        <p>{t('consent.health.intro')}</p>
        <ul className="list-disc space-y-1 pl-5">
          {lines.map((line) => (
            <li key={line.label}>
              <span className="font-semibold text-gray-900">{line.label}:</span> {line.text}
            </li>
          ))}
        </ul>
        {saveFailed && (
          <p role="alert" className="text-red-700">
            {t('consent.health.saveError')}
          </p>
        )}
      </div>
    </Sheet>
  );
}
