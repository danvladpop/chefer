'use client';

import Link from 'next/link';
import { useNumbersMode } from '@/features/numbers-mode/numbers-mode';
import { useT } from '@/lib/i18n';
import type { ProteinWhy } from '@chefer/types';
import { Sheet } from '@chefer/ui';

// ─── ProteinWhySheet (WP-08, D-5) ───────────────────────────────────────────────
// "Why this protein number?" The sentence comes from the API's `proteinWhy`
// (targets.get → explainProteinTarget), so the wording matches the app's. It
// names the user's effective target and, when it is not ~1.6 g per kg, why.
// The action only changes an input, never upsells. Mirrors
// apps/mobile/src/features/nutrition/protein-why-sheet.tsx.

export interface ProteinWhySheetProps {
  open: boolean;
  onClose: () => void;
  /** `targets.get`'s `proteinWhy` — omitted while it is still loading. */
  why: ProteinWhy | undefined;
  /** Where "Change your targets" goes; omitted where the user is already on the targets. */
  actionHref?: string | undefined;
}

export function ProteinWhySheet({ open, onClose, why, actionHref }: ProteinWhySheetProps) {
  // Lane E3 "Hide numbers": the protein target is never explained in figures.
  const { noNumbers } = useNumbersMode();
  const { t } = useT();
  const rows = why
    ? [
        {
          label: t('today.settings.proteinWhy.perDay'),
          value: t('today.settings.grams.protein', { value: why.effectiveG }),
        },
        ...(why.gPerKg !== null
          ? [
              {
                label: t('today.settings.proteinWhy.perKg'),
                value: t('today.settings.grams.protein', { value: why.gPerKg }),
              },
            ]
          : []),
        ...(why.differs && why.referenceG !== null
          ? [
              {
                label: t('today.settings.proteinWhy.atReference', {
                  value: why.referenceGPerKg,
                }),
                value: t('today.settings.grams.protein', { value: why.referenceG }),
              },
            ]
          : []),
      ]
    : [];
  if (noNumbers) return null;
  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={t('today.settings.proteinWhy.title')}
      description={t('today.settings.proteinWhy.eyebrow')}
      size="sm"
      footer={
        actionHref ? (
          <Link
            href={actionHref}
            onClick={onClose}
            className="inline-flex min-h-11 w-full items-center justify-center rounded-md border border-neutral-300 text-sm font-medium hover:bg-neutral-50"
          >
            {t('today.settings.targetExplain.changeTargets')}
          </Link>
        ) : undefined
      }
    >
      <div className="space-y-4 px-5 pb-5" data-testid="protein-why-sheet">
        {why ? (
          <p className="text-base text-neutral-800">{why.sentence}</p>
        ) : (
          <p className="text-sm text-neutral-500">{t('common.states.loading')}</p>
        )}
        {rows.length > 0 && (
          <dl className="space-y-1">
            {rows.map((row) => (
              <div
                key={row.label}
                className="flex items-start justify-between gap-3 border-b border-neutral-100 py-2"
              >
                <dt className="min-w-0 text-sm text-neutral-500">{row.label}</dt>
                <dd className="shrink-0 text-sm font-medium text-neutral-800">{row.value}</dd>
              </div>
            ))}
          </dl>
        )}
      </div>
    </Sheet>
  );
}
